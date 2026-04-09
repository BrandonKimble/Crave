#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
#import <React/RCTViewManager.h>

@interface RCT_EXTERN_MODULE(UIFrameSampler, RCTEventEmitter)
RCT_EXTERN_METHOD(start:(NSDictionary *)options)
RCT_EXTERN_METHOD(stop)
@end

@interface RCT_EXTERN_MODULE(SearchMapRenderController, RCTEventEmitter)
RCT_EXTERN_METHOD(attach:(NSDictionary *)payload
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(detach:(NSString *)instanceId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(setRenderFrame:(NSDictionary *)payload
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(querySourceMembership:(NSDictionary *)payload
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(queryRenderedLabelObservation:(NSDictionary *)payload
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(queryRenderedDotObservation:(NSDictionary *)payload
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(queryRenderedPressTarget:(NSDictionary *)payload
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(reset:(NSString *)instanceId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
@end

@interface RCT_EXTERN_MODULE(PresentationCommandExecutor, NSObject)
RCT_EXTERN_METHOD(executeCameraCommand:(NSDictionary *)payload
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(executeSheetCommands:(NSDictionary *)payload
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
@end

@interface RCT_EXTERN_MODULE(CraveRestaurantPanelSnapshotViewManager, RCTViewManager)
RCT_EXPORT_VIEW_PROPERTY(snapshot, NSDictionary)
RCT_EXPORT_VIEW_PROPERTY(onAction, RCTDirectEventBlock)
@end

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
RCT_EXPORT_VIEW_PROPERTY(sheetCommand, NSDictionary)
RCT_EXPORT_VIEW_PROPERTY(onSheetHostEvent, RCTDirectEventBlock)
@end
