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
RCT_EXTERN_METHOD(setCandidateCatalog:(NSDictionary *)payload
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(commitEnterStart:(NSDictionary *)payload
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(beginInteractionFadeOut:(NSDictionary *)payload
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(resetNativeApplyAttribution:(NSDictionary *)payload
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(flushNativeApplyAttribution:(NSDictionary *)payload
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(configureNativeLayerGroups:(NSDictionary *)payload
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(configureNativePressTargeting:(NSDictionary *)payload
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

@interface RCT_EXTERN_MODULE(SearchRouteSheetNavExclusionMaskViewManager, RCTViewManager)
RCT_EXPORT_VIEW_PROPERTY(maskEnabled, BOOL)
RCT_EXPORT_VIEW_PROPERTY(navBodyBoundaryVisibleY, CGFloat)
RCT_EXPORT_VIEW_PROPERTY(navBodyBoundaryHiddenY, CGFloat)
RCT_EXPORT_VIEW_PROPERTY(navBodyBoundaryTranslateY, CGFloat)
RCT_EXPORT_VIEW_PROPERTY(maskOriginY, CGFloat)
@end

@interface RCT_EXTERN_MODULE(SearchRouteNavSilhouetteHostViewManager, RCTViewManager)
RCT_EXPORT_VIEW_PROPERTY(materialEnabled, BOOL)
RCT_EXPORT_VIEW_PROPERTY(materialBlurAmount, NSNumber)
RCT_EXPORT_VIEW_PROPERTY(materialBlurType, NSString)
RCT_EXPORT_VIEW_PROPERTY(materialTintColor, UIColor)
RCT_EXPORT_VIEW_PROPERTY(navMaterialTopInset, CGFloat)
RCT_EXPORT_VIEW_PROPERTY(cutoutHeight, CGFloat)
RCT_EXPORT_VIEW_PROPERTY(cutoutRadius, CGFloat)
@end

@interface RCT_EXTERN_MODULE(SearchChromeNativeHitTargetRegistry, NSObject)
RCT_EXTERN_METHOD(syncRegions:(NSDictionary *)payload
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
@end

@interface RCT_EXTERN_MODULE(SearchChromeNativeHitTargetSurfaceManager, RCTViewManager)
RCT_EXPORT_VIEW_PROPERTY(hostKey, NSString)
RCT_EXPORT_VIEW_PROPERTY(onSearchChromeNativeHitTargetPress, RCTDirectEventBlock)
@end

@interface RCT_EXTERN_MODULE(SearchChromeScalarSurfaceRegistry, NSObject)
RCT_EXTERN_METHOD(registerSurfaceHost:(NSDictionary *)payload
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(registerPlatformOwner:(NSDictionary *)payload
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(readPlatformOwnerStatus:(NSString *)hostKey
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(registerPlatformScalarSlot:(NSDictionary *)payload
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(readPlatformScalarSlotStatus:(NSString *)hostKey
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(registerMeasuredControl:(NSDictionary *)payload
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(measureRegisteredControls:(NSString *)hostKey
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(syncScalarSnapshot:(NSDictionary *)payload
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(clearMeasuredControl:(NSDictionary *)payload
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(clearSurfaceHost:(NSString *)hostKey
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
@end
