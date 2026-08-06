#import <React/RCTViewManager.h>

@interface RCT_EXTERN_MODULE(CraveBottomSheetHostViewManager, RCTViewManager)
RCT_EXPORT_VIEW_PROPERTY(hostKey, NSString)
RCT_EXPORT_VIEW_PROPERTY(visible, BOOL)
RCT_EXPORT_VIEW_PROPERTY(snapPoints, NSDictionary)
RCT_EXPORT_VIEW_PROPERTY(initialSnapPoint, NSString)
RCT_EXPORT_VIEW_PROPERTY(preservePositionOnSnapPointsChange, BOOL)
RCT_EXPORT_VIEW_PROPERTY(preventSwipeDismiss, BOOL)
RCT_EXPORT_VIEW_PROPERTY(interactionEnabled, BOOL)
RCT_EXPORT_VIEW_PROPERTY(animateOnMount, BOOL)
RCT_EXPORT_VIEW_PROPERTY(dismissThreshold, NSNumber)
RCT_EXPORT_VIEW_PROPERTY(snapStepThreshold, NSNumber)
RCT_EXPORT_VIEW_PROPERTY(sheetCommand, NSDictionary)
RCT_EXPORT_VIEW_PROPERTY(onSheetHostEvent, RCTDirectEventBlock)
@end
