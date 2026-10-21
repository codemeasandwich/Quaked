//! Switch Pro Controller motion read straight from the controller over IOKit HID. Apple's GameController framework
//! lists the controller's motion (hasRotationRate, sensors activated) but reported exactly zero on every axis in the
//! owner's trial (21 October 2026, macOS, Bluetooth), while the controller's own full reports carried live rates.
//! This asks for those reports the way SDL and the browser path (src/platform/gyro_hid.js) do: full report mode
//! (subcommand 0x03 0x30), IMU on (0x40 1) and a read of the factory IMU calibration (SPI 0x6020), without writing
//! the controller's flash. Buttons and sticks still come through the web view's Gamepad API; only motion is read here.
//!
//! IOKit and CoreFoundation are system frameworks; core-foundation-sys is the binding Tauri already builds. The
//! manager, its devices and their callbacks live on the app's main thread (its run loop); `service` is called there.

use core_foundation_sys::base::{kCFAllocatorDefault, CFIndex, CFRelease, CFTypeRef};
use core_foundation_sys::dictionary::{
    kCFTypeDictionaryKeyCallBacks, kCFTypeDictionaryValueCallBacks, CFDictionaryCreateMutable,
    CFDictionarySetValue, CFMutableDictionaryRef,
};
use core_foundation_sys::number::{kCFNumberSInt32Type, CFNumberCreate};
use core_foundation_sys::runloop::{kCFRunLoopDefaultMode, CFRunLoopGetMain};
use core_foundation_sys::string::{kCFStringEncodingUTF8, CFStringCreateWithCString, CFStringRef};
use std::collections::HashMap;
use std::ffi::{c_void, CStr};
use std::sync::Mutex;
use std::time::{Duration, Instant};

type IOHIDManagerRef = *mut c_void;
type IOHIDDeviceRef = *mut c_void;
type IOReturn = i32;
type ReportCallback = extern "C" fn(*mut c_void, IOReturn, *mut c_void, u32, u32, *mut u8, CFIndex);
type DeviceCallback = extern "C" fn(*mut c_void, IOReturn, *mut c_void, IOHIDDeviceRef);

#[link(name = "IOKit", kind = "framework")]
extern "C" {
    fn IOHIDManagerCreate(allocator: *const c_void, options: u32) -> IOHIDManagerRef;
    fn IOHIDManagerSetDeviceMatching(manager: IOHIDManagerRef, matching: CFMutableDictionaryRef);
    fn IOHIDManagerRegisterDeviceMatchingCallback(manager: IOHIDManagerRef, callback: DeviceCallback, context: *mut c_void);
    fn IOHIDManagerRegisterDeviceRemovalCallback(manager: IOHIDManagerRef, callback: DeviceCallback, context: *mut c_void);
    fn IOHIDManagerScheduleWithRunLoop(manager: IOHIDManagerRef, run_loop: *mut c_void, mode: CFStringRef);
    fn IOHIDManagerOpen(manager: IOHIDManagerRef, options: u32) -> IOReturn;
    fn IOHIDDeviceRegisterInputReportCallback(
        device: IOHIDDeviceRef,
        report: *mut u8,
        length: CFIndex,
        callback: ReportCallback,
        context: *mut c_void,
    );
    fn IOHIDDeviceSetReport(device: IOHIDDeviceRef, kind: u32, id: CFIndex, report: *const u8, length: CFIndex) -> IOReturn;
}

const NINTENDO: i32 = 0x057e;
const PRO_CONTROLLER: i32 = 0x2009;
const OUTPUT_REPORT: u32 = 1; // kIOHIDReportTypeOutput
const BUFFER: usize = 512;
/// Nominal LSM6DS3 rate in the controller's ±2000 dps mode, degrees/second per digit, before calibration.
const NOMINAL: f64 = 0.070;

/// One axis's factory zero offset and degrees/second per digit (SDL_hidapi_switch.c:1038-1073).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Axis {
    pub bias: f64,
    pub scale: f64,
}

/// Reads the 24-byte IMU calibration block (SPI 0x6020): gyro offsets at 12, sensitivities at 18 (signed, LE).
/// None for a malformed block, as gyro_hid.js `GyroHID_Calibration` (same bounds).
pub fn calibration(block: &[u8]) -> Option<[Axis; 3]> {
    if block.len() < 24 {
        return None;
    }
    let word = |at: usize| i16::from_le_bytes([block[at], block[at + 1]]) as f64;
    let mut axes = [Axis { bias: 0.0, scale: 0.0 }; 3];
    for (i, axis) in axes.iter_mut().enumerate() {
        let bias = word(12 + i * 2);
        let scale = 936.0 / (word(18 + i * 2) - bias);
        if !scale.is_finite() || !(0.03..=0.1).contains(&scale) || bias.abs() > 1024.0 {
            return None;
        }
        *axis = Axis { bias, scale };
    }
    Some(axes)
}

/// Degrees/second (pitch, yaw, roll) and the right stick's press from a 0x30 report's data (after its ID byte): three
/// IMU frames averaged, mapped as gyro_hid.js `GyroHID_Parse` (SDL_hidapi_switch.c:2218-2228).
pub fn parse(data: &[u8], calibration: Option<&[Axis; 3]>) -> Option<([f64; 3], bool)> {
    if data.len() < 48 {
        return None;
    }
    let mut sum = [0.0f64; 3];
    for n in 0..3 {
        for (i, value) in sum.iter_mut().enumerate() {
            let at = 18 + n * 12 + i * 2;
            *value += i16::from_le_bytes([data[at], data[at + 1]]) as f64;
        }
    }
    let v: Vec<f64> = (0..3)
        .map(|i| match calibration {
            Some(c) => (sum[i] / 3.0 - c[i].bias) * c[i].scale,
            None => sum[i] * NOMINAL / 3.0,
        })
        .collect();
    Some(([-v[1], v[2], -v[0]], data[3] & 4 != 0))
}

struct Device {
    sequence: u8,
    calibration: Option<[Axis; 3]>,
    rate: [f64; 3],
    pair_pressed: bool,
    updated: Option<Instant>,
    asked: Instant,
    buffer: *mut u8,
}
// Devices are touched only on the main thread (IOKit callbacks and `service`); the Mutex just guards the map.
unsafe impl Send for Device {}

static DEVICES: Mutex<Option<HashMap<usize, Device>>> = Mutex::new(None);

fn subcommand(record: &mut Device, body: &[u8]) -> [u8; 49] {
    // Bluetooth output report 0x01: ID, sequence, neutral rumble, subcommand and its arguments (49 bytes in all).
    let mut bytes = [0u8; 49];
    record.sequence = (record.sequence + 1) & 15;
    bytes[..10].copy_from_slice(&[0x01, record.sequence, 0, 1, 0x40, 0x40, 0, 1, 0x40, 0x40]);
    bytes[10..10 + body.len()].copy_from_slice(body);
    bytes
}

/// The reports that turn motion on (and fetch the calibration once). Built under the lock, sent after it is released,
/// so a report arriving during a send can never wait on it.
fn ask(record: &mut Device) -> Vec<[u8; 49]> {
    record.asked = Instant::now();
    let mut reports = vec![subcommand(record, &[0x03, 0x30]), subcommand(record, &[0x40, 0x01])];
    if record.calibration.is_none() {
        reports.push(subcommand(record, &[0x10, 0x20, 0x60, 0, 0, 24]));
    }
    reports
}

fn send(device: IOHIDDeviceRef, reports: &[[u8; 49]]) {
    for bytes in reports {
        unsafe { IOHIDDeviceSetReport(device, OUTPUT_REPORT, 0x01, bytes.as_ptr(), bytes.len() as CFIndex) };
    }
}

extern "C" fn report(context: *mut c_void, _: IOReturn, _: *mut c_void, _: u32, id: u32, bytes: *mut u8, length: CFIndex) {
    let all = unsafe { std::slice::from_raw_parts(bytes, length.max(0) as usize) };
    // the buffer starts with the report ID when the device numbers its reports
    let data = if all.first() == Some(&(id as u8)) { &all[1..] } else { all };
    let mut guard = DEVICES.lock().unwrap();
    let Some(record) = guard.as_mut().and_then(|map| map.get_mut(&(context as usize))) else { return };
    match id {
        0x30 => {
            if let Some((rate, pair)) = parse(data, record.calibration.as_ref()) {
                record.rate = rate;
                record.pair_pressed = pair;
                record.updated = Some(Instant::now());
            }
        }
        // subcommand reply: the SPI read of 0x6020 echoes its address and length before the 24 bytes
        0x21 if data.len() >= 43 && data[13] == 0x10 && data[14..18] == [0x20, 0x60, 0, 0] && data[18] == 24 => {
            record.calibration = calibration(&data[19..43]);
        }
        _ => {}
    }
}

extern "C" fn matched(_: *mut c_void, _: IOReturn, _: *mut c_void, device: IOHIDDeviceRef) {
    let buffer = Box::into_raw(Box::new([0u8; BUFFER])) as *mut u8;
    let mut record = Device {
        sequence: 0,
        calibration: None,
        rate: [0.0; 3],
        pair_pressed: false,
        updated: None,
        asked: Instant::now(),
        buffer,
    };
    let reports = ask(&mut record);
    DEVICES.lock().unwrap().get_or_insert_with(HashMap::new).insert(device as usize, record);
    unsafe { IOHIDDeviceRegisterInputReportCallback(device, buffer, BUFFER as CFIndex, report, device) };
    send(device, &reports);
}

extern "C" fn removed(_: *mut c_void, _: IOReturn, _: *mut c_void, device: IOHIDDeviceRef) {
    if let Some(record) = DEVICES.lock().unwrap().as_mut().and_then(|map| map.remove(&(device as usize))) {
        // IOKit makes no more report calls for a removed device
        drop(unsafe { Box::from_raw(record.buffer as *mut [u8; BUFFER]) });
    }
}

fn number(value: i32) -> CFTypeRef {
    unsafe { CFNumberCreate(kCFAllocatorDefault, kCFNumberSInt32Type, &value as *const i32 as *const c_void) as CFTypeRef }
}

fn string(text: &CStr) -> CFStringRef {
    unsafe { CFStringCreateWithCString(kCFAllocatorDefault, text.as_ptr(), kCFStringEncodingUTF8) }
}

/// Starts watching for Pro Controllers. Call once, on the main thread. Matching names only the controller, so no
/// keyboard is opened (and no Input Monitoring permission is asked for).
pub fn start() {
    unsafe {
        let manager = IOHIDManagerCreate(kCFAllocatorDefault as *const c_void, 0);
        if manager.is_null() {
            return;
        }
        let matching = CFDictionaryCreateMutable(kCFAllocatorDefault, 2, &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
        for (key, value) in [(c"VendorID", NINTENDO), (c"ProductID", PRO_CONTROLLER)] {
            let (key, value) = (string(key), number(value));
            CFDictionarySetValue(matching, key as *const c_void, value as *const c_void);
            CFRelease(key as CFTypeRef);
            CFRelease(value);
        }
        IOHIDManagerSetDeviceMatching(manager, matching);
        CFRelease(matching as CFTypeRef);
        IOHIDManagerRegisterDeviceMatchingCallback(manager, matched, std::ptr::null_mut());
        IOHIDManagerRegisterDeviceRemovalCallback(manager, removed, std::ptr::null_mut());
        IOHIDManagerScheduleWithRunLoop(manager, CFRunLoopGetMain() as *mut c_void, kCFRunLoopDefaultMode);
        IOHIDManagerOpen(manager, 0);
        // the manager lives for the whole process
    }
}

/// Whether a Pro Controller is open here (its GameController motion is then left alone: it reports only zeros, and
/// switching its sensors could turn off the motion this reads).
pub fn connected() -> bool {
    DEVICES.lock().unwrap().as_ref().is_some_and(|map| !map.is_empty())
}

/// One fresh sample per controller as (id, [pitch, yaw, roll] deg/s, right stick pressed). A controller whose motion
/// has stopped for a second (another program changed its report mode, or it woke) is asked again, at most once a
/// second. Main thread only.
pub fn service() -> Vec<(String, [f64; 3], bool)> {
    let now = Instant::now();
    let mut samples = Vec::new();
    let mut asks = Vec::new();
    if let Some(map) = DEVICES.lock().unwrap().as_mut() {
        for (&key, record) in map.iter_mut() {
            let fresh = record.updated.is_some_and(|at| now - at < Duration::from_millis(100));
            if !fresh && now - record.asked > Duration::from_secs(1) {
                asks.push((key, ask(record)));
            }
            if fresh {
                samples.push((format!("hid-{key:x}"), record.rate, record.pair_pressed));
            }
        }
    }
    for (key, reports) in asks {
        send(key as IOHIDDeviceRef, &reports);
    }
    samples
}

#[cfg(test)]
mod tests {
    use super::*;

    fn block(bias: [i16; 3], sensitivity: [i16; 3]) -> Vec<u8> {
        let mut b = vec![0u8; 24];
        for i in 0..3 {
            b[12 + i * 2..14 + i * 2].copy_from_slice(&bias[i].to_le_bytes());
            b[18 + i * 2..20 + i * 2].copy_from_slice(&sensitivity[i].to_le_bytes());
        }
        b
    }

    #[test]
    fn calibration_matches_the_browser_path() {
        let axes = calibration(&block([10, -20, 30], [13381, 13351, 13401])).unwrap();
        assert_eq!(axes[0].bias, 10.0);
        assert!((axes[0].scale - 936.0 / 13371.0).abs() < 1e-12);
        assert!(calibration(&block([0, 0, 0], [0, 0, 0])).is_none(), "zero sensitivity rejected");
        assert!(calibration(&[0u8; 23]).is_none(), "short block rejected");
    }

    #[test]
    fn full_reports_average_three_frames_into_view_axes() {
        let mut data = vec![0u8; 48];
        for n in 0..3 {
            for (i, raw) in [100i16, 200, 300].iter().enumerate() {
                let at = 18 + n * 12 + i * 2;
                data[at..at + 2].copy_from_slice(&raw.to_le_bytes());
            }
        }
        data[3] = 4;
        let (rate, pair) = parse(&data, None).unwrap();
        // pitch = -sensor Y, yaw = sensor Z, roll = -sensor X, at the nominal 0.070 dps/digit
        assert!((rate[0] + 14.0).abs() < 1e-9 && (rate[1] - 21.0).abs() < 1e-9 && (rate[2] + 7.0).abs() < 1e-9);
        assert!(pair);
        let c = [Axis { bias: 100.0, scale: 0.07 }, Axis { bias: 0.0, scale: 0.07 }, Axis { bias: 300.0, scale: 0.07 }];
        let (rate, _) = parse(&data, Some(&c)).unwrap();
        assert!(rate[0].abs() > 1.0 && rate[1].abs() < 1e-9 && rate[2].abs() < 1e-9, "calibrated zero offsets");
        assert!(parse(&data[..47], None).is_none());
    }
}
