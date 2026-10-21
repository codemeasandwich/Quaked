//! GameController motion for the Mac web view. Uses the maintained objc2 runtime already used by pointer_lock,
//! linking only Apple's system framework (no SDL, downloaded binding or bundled native library). The small ABI
//! surface follows the installed SDK's GCController.h:279 and GCMotion.h:39-58, 143-162, 208-238.
//! All framework access is scheduled on the app thread, at 60 Hz; a busy UI has at most one pending read.

use objc2::encode::{Encode, Encoding};
use objc2::msg_send;
use objc2::rc::autoreleasepool;
use objc2::runtime::{AnyClass, AnyObject, Bool};
use serde::Serialize;
use std::ffi::CStr;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::time::Duration;
use tauri::{Emitter, Manager};

#[link(name = "GameController", kind = "framework")]
extern "C" {}

#[repr(C)]
#[derive(Clone, Copy, Debug)]
struct RotationRate {
    x: f64,
    y: f64,
    z: f64,
}
// GCRotationRate is an anonymous three-double C struct, on both macOS architectures.
unsafe impl Encode for RotationRate {
    const ENCODING: Encoding =
        Encoding::Struct("?", &[f64::ENCODING, f64::ENCODING, f64::ENCODING]);
}

#[derive(Clone, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
struct Sample {
    id: String,
    family: String,
    pitch: f64,
    yaw: f64,
    roll: f64,
    pair_pressed: bool,
}

fn degrees(rate: RotationRate) -> Option<[f64; 3]> {
    let values = [
        rate.x.to_degrees(),
        rate.y.to_degrees(),
        rate.z.to_degrees(),
    ];
    values
        .iter()
        .all(|v| v.is_finite() && v.abs() <= 4000.0)
        .then_some(values)
}

/// Copies an NSString while its caller's autorelease pool and owner are still alive.
unsafe fn text(value: *mut AnyObject) -> String {
    if value.is_null() {
        return String::new();
    }
    let bytes: *const std::ffi::c_char = unsafe { msg_send![value, UTF8String] };
    if bytes.is_null() {
        String::new()
    } else {
        unsafe { CStr::from_ptr(bytes) }
            .to_string_lossy()
            .into_owned()
    }
}

fn family(category: &str, vendor: &str) -> String {
    let name = format!("{category} {vendor}").to_lowercase();
    if name.contains("dualsense") {
        "dualsense"
    } else if name.contains("dualshock") {
        "dualshock4"
    } else if name.contains("switch")
        || name.contains("nintendo")
        || name.contains("pro controller")
    {
        "switch"
    } else {
        "unknown"
    }
    .to_owned()
}

/// Reads borrowed objects only inside a main-thread autorelease pool. No Objective-C pointers cross threads.
fn snapshot(active: bool) -> Vec<Sample> {
    autoreleasepool(|_| unsafe {
        let Some(class) = AnyClass::get(c"GCController") else {
            return vec![];
        };
        let controllers: *mut AnyObject = msg_send![class, controllers];
        if controllers.is_null() {
            return vec![];
        }
        let count: usize = msg_send![controllers, count];
        let mut samples = Vec::new();
        let direct = crate::gyro_hid::connected();
        if active {
            for (id, [pitch, yaw, roll], pair_pressed) in crate::gyro_hid::service() {
                samples.push(Sample { id, family: "switch".to_owned(), pitch, yaw, roll, pair_pressed });
            }
        } else {
            crate::gyro_hid::service();
        }
        for index in 0..count {
            let controller: *mut AnyObject = msg_send![controllers, objectAtIndex: index];
            let motion: *mut AnyObject = msg_send![controller, motion];
            if motion.is_null() {
                continue;
            }
            let capable: Bool = msg_send![motion, hasRotationRate];
            if !capable.as_bool() {
                continue;
            }
            let category: *mut AnyObject = msg_send![controller, productCategory];
            let vendor: *mut AnyObject = msg_send![controller, vendorName];
            let family = family(&text(category), &text(vendor));
            // a Pro Controller read directly (gyro_hid.rs) is not also read, or switched, here
            if direct && family == "switch" {
                continue;
            }
            let manual: Bool = msg_send![motion, sensorsRequireManualActivation];
            if manual.as_bool() {
                // Switch only on a change: each set can reach the controller as a command, and setting it on every
                // 60 Hz read left a Switch Pro Controller reporting no motion at all (owner trial, 21 October 2026)
                let on: Bool = msg_send![motion, sensorsActive];
                if on.as_bool() != active {
                    let _: () = msg_send![motion, setSensorsActive: Bool::new(active)];
                }
            }
            if !active {
                continue;
            }
            let rate: RotationRate = msg_send![motion, rotationRate];
            let Some([pitch, yaw, roll]) = degrees(rate) else {
                continue;
            };
            let gamepad: *mut AnyObject = msg_send![controller, extendedGamepad];
            let mut pair_pressed = false;
            if !gamepad.is_null() {
                let button: *mut AnyObject = msg_send![gamepad, rightThumbstickButton];
                if !button.is_null() {
                    let down: Bool = msg_send![button, isPressed];
                    pair_pressed = down.as_bool();
                }
            }
            samples.push(Sample {
                id: format!("gc-{:p}", controller),
                family,
                pitch,
                yaw,
                roll,
                pair_pressed,
            });
        }
        samples
    })
}

/// Starts a single process-lifetime producer. Empty frames remove disconnected sources in the web view. Manual
/// sensors sleep while the app is unfocused; reconnects are discovered without starting OS pairing/discovery.
pub fn start(app: tauri::AppHandle) {
    let pending = Arc::new(AtomicBool::new(false));
    let hid_started = Arc::new(AtomicBool::new(false));
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_millis(16));
        if pending.swap(true, Ordering::AcqRel) {
            continue;
        }
        let handle = app.clone();
        let done = pending.clone();
        let hid_started = hid_started.clone();
        if app
            .run_on_main_thread(move || {
                let active = handle
                    .webview_windows()
                    .values()
                    .any(|w| w.is_focused().unwrap_or(false));
                if !hid_started.swap(true, Ordering::AcqRel) {
                    crate::gyro_hid::start();
                }
                let _ = handle.emit("controller-gyro", snapshot(active));
                done.store(false, Ordering::Release);
            })
            .is_err()
        {
            break;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn native_rate_units_are_degrees_and_finite() {
        let d = degrees(RotationRate {
            x: std::f64::consts::PI,
            y: -std::f64::consts::FRAC_PI_2,
            z: 0.0,
        })
        .unwrap();
        assert_eq!(d, [180.0, -90.0, 0.0]);
        assert!(degrees(RotationRate {
            x: f64::NAN,
            y: 0.0,
            z: 0.0
        })
        .is_none());
        assert!(degrees(RotationRate {
            x: 100.0,
            y: 0.0,
            z: 0.0
        })
        .is_none());
        assert_eq!(family("DualSense", "Sony"), "dualsense");
        assert_eq!(family("HID", "Nintendo Switch Pro Controller"), "switch");
    }
    #[test]
    fn rotation_abi_matches_sdk() {
        assert_eq!(std::mem::size_of::<RotationRate>(), 24);
        assert_eq!(RotationRate::ENCODING.to_string(), "{?=ddd}");
    }
}
