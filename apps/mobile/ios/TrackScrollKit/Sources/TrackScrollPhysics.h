#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

/// THE ONE TRACK native hatch (design doc §THE ONE TRACK / §8 "UIScrollView — the
/// bet"): the two things React Native's ScrollView wrapper hides, exposed at the
/// UIScrollView delegate level via a forwarding proxy:
///   1. THE PHASE-DEPENDENT BOUND — the ballistic lower bound (the list top, H) is
///      installed inside scrollViewWillEndDragging, BEFORE deceleration is
///      configured, so the engine treats H as a known edge and bounces NATIVELY
///      (the JS-timed inset flip arrived post-configuration and clamped instead).
///      The bound lifts again on willBeginDragging so a finger-down drag keeps the
///      full 1:1 track through H (the continuous grab).
///   2. DETENT TARGETING — releases heading into the sheet region write the chosen
///      detent into targetContentOffset (the platform's own snap API), so detent
///      settles ride the native deceleration curve.
@interface TrackScrollPhysics : RCTEventEmitter <RCTBridgeModule>
@end
