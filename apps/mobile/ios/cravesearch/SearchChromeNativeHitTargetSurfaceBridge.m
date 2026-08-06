#import <React/RCTBridgeModule.h>
#import <React/RCTViewManager.h>

// Both native modules below are implemented in
// SearchChromeNativeHitTargetSurface.swift.

@interface RCT_EXTERN_MODULE(SearchChromeNativeHitTargetRegistry, NSObject)
RCT_EXTERN_METHOD(syncRegions:(NSDictionary *)payload
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
@end

@interface RCT_EXTERN_MODULE(SearchChromeNativeHitTargetSurfaceManager, RCTViewManager)
RCT_EXPORT_VIEW_PROPERTY(hostKey, NSString)
RCT_EXPORT_VIEW_PROPERTY(onSearchChromeNativeHitTargetPress, RCTDirectEventBlock)
@end
