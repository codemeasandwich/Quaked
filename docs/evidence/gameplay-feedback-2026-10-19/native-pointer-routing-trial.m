// Isolated public WKWebView regression. Never addresses an existing application,
// posts OS/NSEvents, changes a user profile, or alters capture policy in Quaked.
// Requests through public evaluateJavaScript; WebKit supplies its API's user-gesture
// semantics. This proves selector routing/grant, not physical mouse movement.
#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>
#import <objc/message.h>
@interface Trial : NSObject <WKUIDelegate, WKNavigationDelegate, WKScriptMessageHandler>
@property NSWindow *window;
@property WKWebView *web;
@property NSMutableArray *events;
@property NSString *mode;
@property NSInteger modernCalls;
@property NSInteger legacyCalls;
@end
@implementation Trial
- (void)_webViewDidRequestPointerLock:(WKWebView *)web completionHandler:(void (^)(BOOL))handler { self.modernCalls++; handler(YES); }
- (void)userContentController:(WKUserContentController *)controller didReceiveScriptMessage:(WKScriptMessage *)message { [self.events addObject:message.body]; }
- (void)webView:(WKWebView *)web didFinishNavigation:(WKNavigation *)navigation {
 [self.window makeKeyAndOrderFront:nil]; [self.window makeFirstResponder:web];
 [NSApp activateIgnoringOtherApps:YES];
 dispatch_after(dispatch_time(DISPATCH_TIME_NOW,(int64_t)(0.4*NSEC_PER_SEC)),dispatch_get_main_queue(),^{
  [web evaluateJavaScript:@"window.report('before'); try { const p=document.body.requestPointerLock(); if(p?.catch)p.catch(e=>window.report('rejected:'+e.name)); }catch(e){window.report('thrown:'+e.name)}; 'requested'" completionHandler:^(id value,NSError *error){ if(error)[self.events addObject:@{ @"evaluationError":error.localizedDescription }]; }];
 });
 dispatch_after(dispatch_time(DISPATCH_TIME_NOW,(int64_t)(2*NSEC_PER_SEC)),dispatch_get_main_queue(),^{
  [web evaluateJavaScript:@"window.report('final'); document.exitPointerLock(); 'done'" completionHandler:^(id value,NSError *error){
   if(error)[self.events addObject:@{ @"finalError":error.localizedDescription }];
   NSDictionary *result=@{ @"mode":self.mode,@"modernCalls":@(self.modernCalls),@"legacyCalls":@(self.legacyCalls),@"legacyAllowSelectorPresent":@([web respondsToSelector:NSSelectorFromString(@"_didAllowPointerLock")]),@"events":self.events,@"windowKey":@(self.window.isKeyWindow),@"appActive":@(NSApp.isActive),@"physicalInput":@NO };
   NSData *data=[NSJSONSerialization dataWithJSONObject:result options:NSJSONWritingPrettyPrinted error:nil]; puts([[NSString alloc]initWithData:data encoding:NSUTF8StringEncoding].UTF8String);
   [self.window orderOut:nil]; [NSApp terminate:nil];
  }];
 });
}
@end
@interface BeforeTrial : Trial @end
@implementation BeforeTrial
- (void)_webViewRequestPointerLock:(WKWebView *)web {
 self.legacyCalls++;
 SEL allow=NSSelectorFromString(@"_didAllowPointerLock");
 if([web respondsToSelector:allow]) ((void(*)(id,SEL))objc_msgSend)(web,allow);
}
@end
int main(int argc,const char **argv){ @autoreleasepool {
 [NSApplication sharedApplication]; [NSApp setActivationPolicy:NSApplicationActivationPolicyRegular];
 NSString *mode=argc>1?[NSString stringWithUTF8String:argv[1]]:@"after";
 Trial *trial=[mode isEqualToString:@"before"]?[BeforeTrial new]:[Trial new]; trial.mode=mode;trial.events=[NSMutableArray new];
 WKWebViewConfiguration *config=[WKWebViewConfiguration new]; config.websiteDataStore=WKWebsiteDataStore.nonPersistentDataStore;
 [config.userContentController addScriptMessageHandler:trial name:@"report"];
 trial.web=[[WKWebView alloc]initWithFrame:NSMakeRect(0,0,480,260) configuration:config]; trial.web.UIDelegate=trial; trial.web.navigationDelegate=trial;
 trial.window=[[NSWindow alloc]initWithContentRect:NSMakeRect(80,80,480,260) styleMask:NSWindowStyleMaskTitled|NSWindowStyleMaskClosable backing:NSBackingStoreBuffered defer:NO];
 trial.window.title=[@"Quaked isolated pointer routing: " stringByAppendingString:mode]; trial.window.contentView=trial.web;
 NSString *html=@"<!doctype html><meta charset=utf-8><body style='background:#191919;color:white;font:20px sans-serif'><p>Isolated pointer routing regression</p><p>No physical or synthetic mouse input is sent.</p><script>window.report=(phase)=>webkit.messageHandlers.report.postMessage({phase,locked:document.pointerLockElement===document.body,focused:document.hasFocus(),visibility:document.visibilityState});document.addEventListener('pointerlockchange',()=>report('change'));document.addEventListener('pointerlockerror',()=>report('error'));</script>";
 [trial.web loadHTMLString:html baseURL:[NSURL URLWithString:@"file:///private/tmp/"]];
 dispatch_after(dispatch_time(DISPATCH_TIME_NOW,8*NSEC_PER_SEC),dispatch_get_main_queue(),^{ fputs("TIMEOUT: no completed native routing receipt\n",stderr);[trial.window orderOut:nil];exit(2); });
 [NSApp run];
 }return 0;}
