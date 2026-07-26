#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

/// THE ONE TRACK native hatch (design doc §THE ONE TRACK / §8 "UIScrollView — the
/// bet"): the two things React Native's ScrollView wrapper hides, exposed at the
/// UIScrollView delegate level via a forwarding proxy:
///   1. THE CROSSING INTERCEPT (velocity-continuity law) — a ballistic release in
///      the list region is NEVER inset-bounded (a bound makes UIKit re-target and
///      EASE into H: settle-then-jerk). The deceleration runs HOT toward its real
///      target; scrollViewDidScroll catches the exact frame the offset crosses H,
///      measures the true instantaneous velocity from the last two native frames,
///      stops the engine dead ON the edge, and hands velocity + overshoot to the
///      JS rubber spring — one continuous motion through the edge. A short edge
///      hold keeps H authoritative against residual writers while the dip runs.
///   2. DETENT TARGETING — releases heading into the sheet region write the chosen
///      detent into targetContentOffset (the platform's own snap API), so detent
///      settles ride the native deceleration curve.
@interface TrackScrollPhysics : RCTEventEmitter <RCTBridgeModule>
@end
