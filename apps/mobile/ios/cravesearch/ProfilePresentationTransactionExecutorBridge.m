#import <React/RCTBridgeModule.h>

// Bridges PresentationCommandExecutor, implemented in
// ProfilePresentationTransactionExecutor.swift.
@interface RCT_EXTERN_MODULE(PresentationCommandExecutor, NSObject)
RCT_EXTERN_METHOD(executeSheetCommands:(NSDictionary *)payload
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
@end
