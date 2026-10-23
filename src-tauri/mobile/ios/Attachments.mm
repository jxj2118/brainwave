#import <UIKit/UIKit.h>
#import <QuickLook/QuickLook.h>

@interface BWAttachmentPreview : NSObject <QLPreviewControllerDataSource>
@property(nonatomic, strong) NSURL *url;
@end
@implementation BWAttachmentPreview
- (NSInteger)numberOfPreviewItemsInPreviewController:(QLPreviewController *)controller { return 1; }
- (id<QLPreviewItem>)previewController:(QLPreviewController *)controller previewItemAtIndex:(NSInteger)index { return self.url; }
@end

extern "C" bool brainwave_open_attachment(const char *path) {
    static BWAttachmentPreview *source = nil;
    if (!source) source = [[BWAttachmentPreview alloc] init];
    source.url = [NSURL fileURLWithPath:[NSString stringWithUTF8String:path]];
    UIViewController *presenter = nil;
    for (UIScene *scene in UIApplication.sharedApplication.connectedScenes) {
        if (scene.activationState != UISceneActivationStateForegroundActive || ![scene isKindOfClass:UIWindowScene.class]) continue;
        for (UIWindow *window in ((UIWindowScene *)scene).windows) if (window.isKeyWindow) { presenter = window.rootViewController; break; }
    }
    if (!presenter) {
        for (UIWindow *window in UIApplication.sharedApplication.windows) if (window.isKeyWindow) { presenter = window.rootViewController; break; }
    }
    while (presenter.presentedViewController) presenter = presenter.presentedViewController;
    if (!presenter) return false;
    QLPreviewController *preview = [[QLPreviewController alloc] init];
    preview.dataSource = source;
    [presenter presentViewController:preview animated:YES completion:nil];
    return true;
}
