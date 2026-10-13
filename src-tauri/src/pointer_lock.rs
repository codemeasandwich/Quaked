//! Mouse look in the Mac app (owner report, 13 October 2026: "mouse look doesn't seem to be working"). The engine
//! turns the view only while the page holds the pointer lock (src/platform/in_web.js). WKWebView grants
//! `requestPointerLock` only when its UI delegate answers WebKit's `_webViewDidRequestPointerLock:completionHandler:`,
//! which wry's delegate does not (wry documents pointer lock as unsupported on macOS). This adds that method to the
//! delegate's class, always allowing (the page is the app's own), and sets the delegate again so WebKit sees it.
//! Leaving the lock (Escape, or the page's `exitPointerLock`) is WebKit's own behaviour.

use block2::Block;
use objc2::runtime::{AnyClass, AnyObject, Bool, Imp, Sel};
use objc2::{msg_send, sel};
use std::ffi::c_void;

unsafe extern "C-unwind" fn did_request(_this: *mut AnyObject, _cmd: Sel, _webview: *mut AnyObject, handler: *mut Block<dyn Fn(Bool)>) {
    if let Some(handler) = unsafe { handler.as_ref() } {
        handler.call((Bool::YES,));
    }
}

// Older WebKit asks `_webViewRequestPointerLock:` instead and expects the answer through the web view's
// `_didAllowPointerLock` (absent from current WebKit, so it is called only when present).
unsafe extern "C-unwind" fn request(_this: *mut AnyObject, _cmd: Sel, webview: *mut AnyObject) {
    if webview.is_null() {
        return;
    }
    unsafe {
        let allow = sel!(_didAllowPointerLock);
        let can: Bool = msg_send![webview, respondsToSelector: allow];
        if can.as_bool() {
            let _: () = msg_send![webview, _didAllowPointerLock];
        }
    }
}

/// Lets the page in `webview` (a `WKWebView`) take the pointer lock. Returns false when the web view has no UI
/// delegate or the method is missing from it afterwards (mouse look then stays off, as before). Whether WebKit then
/// grants the lock can only be seen in the app: true does not prove it.
pub fn allow(webview: *mut c_void) -> bool {
    let webview = webview.cast::<AnyObject>();
    if webview.is_null() {
        return false;
    }
    unsafe {
        let delegate: *mut AnyObject = msg_send![webview, UIDelegate];
        if delegate.is_null() {
            return false;
        }
        let class = (*delegate).class() as *const AnyClass as *mut AnyClass;
        let selector = sel!(_webViewDidRequestPointerLock:completionHandler:);
        let imp: Imp = std::mem::transmute::<unsafe extern "C-unwind" fn(*mut AnyObject, Sel, *mut AnyObject, *mut Block<dyn Fn(Bool)>), Imp>(did_request);
        // false when the class already has it (a second window): it is still allowed.
        let _ = objc2::ffi::class_addMethod(class, selector, imp, c"v@:@@?".as_ptr());
        let older: Imp = std::mem::transmute::<unsafe extern "C-unwind" fn(*mut AnyObject, Sel, *mut AnyObject), Imp>(request);
        let _ = objc2::ffi::class_addMethod(class, sel!(_webViewRequestPointerLock:), older, c"v@:@".as_ptr());
        let _: () = msg_send![webview, setUIDelegate: delegate];
        let answers: Bool = msg_send![delegate, respondsToSelector: selector];
        answers.as_bool()
    }
}
