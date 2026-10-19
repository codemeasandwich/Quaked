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

/// Installs the delegate callback without replacing a method supplied by the delegate itself.
/// `class` must be a live Objective-C delegate class whose pointer-lock callback uses WebKit's ABI.
unsafe fn install_pointer_lock_method(class: &AnyClass) {
    let class = class as *const AnyClass as *mut AnyClass;
    let selector = sel!(_webViewDidRequestPointerLock:completionHandler:);
    let imp: Imp = unsafe { std::mem::transmute::<unsafe extern "C-unwind" fn(*mut AnyObject, Sel, *mut AnyObject, *mut Block<dyn Fn(Bool)>), Imp>(did_request) };
    // false when the class already has it (a second window): it is still allowed.
    let _ = unsafe { objc2::ffi::class_addMethod(class, selector, imp, c"v@:@@?".as_ptr()) };
    // Do not register the legacy `_webViewRequestPointerLock:` selector. WebKit checks it
    // first and then denies the request, bypassing this completion handler. Its old
    // `_didAllowPointerLock` reply no longer exists on current WKWebView. The supported
    // macOS 14+ versions all provide the modern completion-handler API.
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
        install_pointer_lock_method((*delegate).class());
        let selector = sel!(_webViewDidRequestPointerLock:completionHandler:);
        let _: () = msg_send![webview, setUIDelegate: delegate];
        let answers: Bool = msg_send![delegate, respondsToSelector: selector];
        answers.as_bool()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use block2::RcBlock;
    use objc2::rc::Retained;
    use objc2::runtime::ClassBuilder;
    use std::cell::Cell;

    #[test]
    fn delegate_registers_only_modern_pointer_lock_and_completes_once() {
        // Use the actual runtime method table, without creating a WKWebView or requiring
        // the test runner to own the main thread. Never mutate NSObject or wry's class.
        let class = ClassBuilder::new(c"QuakedPointerLockRegressionDelegate", objc2::class!(NSObject))
            .expect("isolated pointer-lock test class")
            .register();
        let modern = sel!(_webViewDidRequestPointerLock:completionHandler:);
        let legacy = sel!(_webViewRequestPointerLock:);
        assert!(class.instance_method(modern).is_none());
        assert!(class.instance_method(legacy).is_none());

        unsafe { install_pointer_lock_method(class) };
        assert!(class.instance_method(modern).is_some(), "modern completion selector must be installed");
        assert!(class.instance_method(legacy).is_none(), "legacy selector must not mask the completion callback");
        unsafe { install_pointer_lock_method(class) };
        assert_eq!(class.instance_methods().iter().filter(|method| method.name() == modern).count(), 1,
            "opening another window must not duplicate the callback");

        let calls = Cell::new(0);
        let approved = Cell::new(false);
        let completion = RcBlock::new(|allowed: Bool| {
            calls.set(calls.get() + 1);
            approved.set(allowed.as_bool());
        });
        let delegate: Retained<AnyObject> = unsafe { msg_send![class, new] };
        // Dispatch through Objective-C, exercising the registered ABI and the real block.
        // did_request deliberately does not inspect the web view argument.
        let _: () = unsafe { msg_send![&*delegate,
            _webViewDidRequestPointerLock: std::ptr::null_mut::<AnyObject>(),
            completionHandler: &*completion
        ] };
        assert_eq!(calls.get(), 1);
        assert!(approved.get(), "the completion receives Bool::YES");
    }
}
