#import "TrackScrollPhysics.h"

#import <QuartzCore/QuartzCore.h>
#import <React/RCTUIManager.h>
#import <React/RCTUIManagerUtils.h>
#import <UIKit/UIKit.h>
#import <objc/runtime.h>

#pragma mark - The delegate proxy

/// Forwarding proxy over the scroll view's existing delegate (React's component
/// view). Intercepts exactly the two lifecycle moments the track law needs and
/// forwards EVERYTHING (including those two, first) to the original so React's
/// event stream is untouched.
@interface TrackScrollDelegateProxy : NSObject <UIScrollViewDelegate>
@property (nonatomic, weak) id<UIScrollViewDelegate> original;
/// Called at the exact frame a ballistic scroll CROSSES the top bound, with the
/// measured instantaneous velocity (pt/s toward the edge, from the last two native
/// frames) and the overshoot already past the edge - so the JS rubber spring starts
/// exactly where and as fast as the engine left off (velocity-continuous bounce).
@property (nonatomic, copy) void (^onTopArrival)(double velocityPtsPerSecond, double overshootPts);
@property (nonatomic, assign) BOOL ballisticArmed;
@property (nonatomic, assign) CGFloat lastOffsetY;
@property (nonatomic, assign) CFTimeInterval lastTimestamp;
/// THE NATIVE SPRING — after the crossing, the module OWNS the offset: a
/// critically damped spring on the overscroll depth x = edge - y, driven by a
/// CADisplayLink writing contentOffset every frame. The bounce lives in the one
/// track variable itself (tau really dips below H and returns); no JS transform,
/// no bridge hop in the motion path, no edge hold.
@property (nonatomic, strong) CADisplayLink *springLink;
@property (nonatomic, weak) UIScrollView *springScrollView;
@property (nonatomic, assign) CFTimeInterval springStart;
@property (nonatomic, assign) double springTarget;
@property (nonatomic, assign) double springD0;
@property (nonatomic, assign) double springV0;
@property (nonatomic, assign) double springLastD;
/// The list-top boundary (H) in content-offset space; < 0 disables.
@property (nonatomic, assign) CGFloat ballisticEdge;
/// Releases whose native target lands below this bound get detent-targeted.
@property (nonatomic, assign) CGFloat snapRegionEnd;
@property (nonatomic, copy) NSArray<NSNumber *> *snapOffsets;
/// NATIVE GEOMETRY ARBITRATION (the second input surface, by construction):
/// a scroll pan whose touch STARTS inside the chrome band [sheetTop,
/// sheetTop+chromeHeight) is cancelled here — the JS header-grab pan owns it.
/// sheetTop derives from the track: chromeTopInset + max(0, edge − offset).
@property (nonatomic, assign) CGFloat chromeTopInset;
@property (nonatomic, assign) CGFloat chromeHeight;
- (void)startSpringOn:(UIScrollView *)scrollView
             toTarget:(double)target
                fromY:(double)y0
            velocityY:(double)v0;
@end

static void *kTrackDelegateKVOContext = &kTrackDelegateKVOContext;

@implementation TrackScrollDelegateProxy

// DURABLE ATTACH (the FlashList lesson): Fabric re-sets the scroll view's
// delegate on many commits — recyclers do it constantly, and a fast flick beats
// any JS-timed re-assert. The proxy therefore re-wraps ITSELF: it KVO-observes
// the delegate slot and rejoins the chain the instant anything replaces it.
- (void)beginObservingDelegateOf:(UIScrollView *)scrollView
{
  [scrollView addObserver:self
               forKeyPath:@"delegate"
                  options:NSKeyValueObservingOptionNew
                  context:kTrackDelegateKVOContext];
}

- (void)endObservingDelegateOf:(UIScrollView *)scrollView
{
  @try {
    [scrollView removeObserver:self forKeyPath:@"delegate" context:kTrackDelegateKVOContext];
  } @catch (__unused NSException *e) {
  }
}

- (void)observeValueForKeyPath:(NSString *)keyPath
                      ofObject:(id)object
                        change:(NSDictionary *)change
                       context:(void *)context
{
  if (context != kTrackDelegateKVOContext) {
    [super observeValueForKeyPath:keyPath ofObject:object change:change context:context];
    return;
  }
  UIScrollView *scrollView = (UIScrollView *)object;
  id<UIScrollViewDelegate> current = scrollView.delegate;
  if (current != nil && current != (id<UIScrollViewDelegate>)self) {
    self.original = current;
    scrollView.delegate = self; // re-fires KVO; the guard above ends the recursion
  }
}

- (BOOL)respondsToSelector:(SEL)aSelector
{
  return [super respondsToSelector:aSelector] || [self.original respondsToSelector:aSelector];
}

- (id)forwardingTargetForSelector:(SEL)aSelector
{
  id<UIScrollViewDelegate> original = self.original;
  if ([original respondsToSelector:aSelector]) {
    return original;
  }
  return [super forwardingTargetForSelector:aSelector];
}

- (void)scrollViewWillBeginDragging:(UIScrollView *)scrollView
{
  // GEOMETRY ARBITRATION: reject drags born on the chrome. Toggling the pan
  // recognizer cancels the in-flight gesture cleanly; the RNGH header pan
  // (observing at the root) keeps the touch.
  if (self.chromeHeight > 0) {
    UIPanGestureRecognizer *pan = scrollView.panGestureRecognizer;
    const CGPoint location = [pan locationInView:scrollView.window];
    const CGPoint translation = [pan translationInView:scrollView.window];
    const CGFloat startY = location.y - translation.y;
    const CGFloat sheetTop =
        self.chromeTopInset + MAX(0, self.ballisticEdge - scrollView.contentOffset.y);
    if (startY >= sheetTop && startY < sheetTop + self.chromeHeight) {
      pan.enabled = NO;
      pan.enabled = YES;
      return;
    }
  }
  // FINGER DOWN: full 1:1 track (the continuous grab); any armed intercept or
  // in-flight bounce dies — the finger owns the track from here.
  self.ballisticArmed = NO;
  [self stopSpring];
  if (self.ballisticEdge >= 0 && scrollView.contentInset.top != 0) {
    UIEdgeInsets inset = scrollView.contentInset;
    inset.top = 0;
    scrollView.contentInset = inset;
  }
  if ([self.original respondsToSelector:@selector(scrollViewWillBeginDragging:)]) {
    [self.original scrollViewWillBeginDragging:scrollView];
  }
}

- (void)scrollViewWillEndDragging:(UIScrollView *)scrollView
                     withVelocity:(CGPoint)velocity
              targetContentOffset:(inout CGPoint *)targetContentOffset
{
  // Forward FIRST so React's own handling (events) runs against the raw values;
  // the track law then owns the final target/bounds.
  if ([self.original respondsToSelector:@selector(scrollViewWillEndDragging:withVelocity:targetContentOffset:)]) {
    [self.original scrollViewWillEndDragging:scrollView
                                withVelocity:velocity
                         targetContentOffset:targetContentOffset];
  }

  const CGFloat edge = self.ballisticEdge;
  const CGFloat releaseY = scrollView.contentOffset.y;

  if (edge >= 0 && releaseY >= edge) {
    // BALLISTIC RELEASE IN THE LIST REGION: do NOT bound the track here — bounding
    // makes UIKit re-target and EASE into H (v->0), and any bounce synthesized after
    // that reads as settle-then-jerk. Instead ARM the crossing intercept: the decel
    // runs HOT toward its natural target, and scrollViewDidScroll catches the exact
    // frame the offset crosses H with its true instantaneous velocity.
    self.ballisticArmed = YES;
    self.lastOffsetY = releaseY;
    self.lastTimestamp = CACurrentMediaTime();
    return;
  }

  if (self.snapOffsets.count > 0 && releaseY < self.snapRegionEnd) {
    // SHEET REGION release — two laws in one move:
    //   THE BALLISTIC WALL: momentum born in the sheet region may never cross H.
    //   Riding targetContentOffset let a fast release project PAST H and pour its
    //   momentum straight into list scrolling with no finger down.
    //   THE SNAPPY SETTLE: UIKit's deceleration toward a detent is a long lazy
    //   ease; detents settle on the SAME critically damped spring as the top
    //   rubber — one physics system for every release, velocity-continuous from
    //   the finger's true release speed.
    // Velocity-aware detent choice: UIKit's own projection, clamped to <= H.
    const double projected = MIN(targetContentOffset->y, self.snapRegionEnd);
    CGFloat best = self.snapOffsets.firstObject.doubleValue;
    for (NSNumber *offset in self.snapOffsets) {
      if (fabs(offset.doubleValue - projected) < fabs(best - projected)) {
        best = offset.doubleValue;
      }
    }
    targetContentOffset->y = releaseY; // no native deceleration — the spring owns it
    [self startSpringOn:scrollView toTarget:best fromY:releaseY velocityY:velocity.y * 1000.0];
  }
}

- (void)scrollViewDidScroll:(UIScrollView *)scrollView
{
  const CGFloat edge = self.ballisticEdge;
  if (self.ballisticArmed && edge >= 0 && !scrollView.tracking && scrollView.decelerating) {
    const CGFloat y = scrollView.contentOffset.y;
    const CFTimeInterval now = CACurrentMediaTime();
    if (y < edge) {
      // THE CROSSING: measure the true instantaneous velocity from the last two
      // native frames and hand the track to the native spring FROM THIS EXACT
      // position and speed — one continuous motion through H, one variable.
      // This frame is truth (tau really is below H now), so it forwards normally.
      const CFTimeInterval dt = MAX(now - self.lastTimestamp, 1.0 / 240.0);
      const double v = (self.lastOffsetY - y) / dt; // pt/s toward the edge
      const double overshoot = edge - y;
      self.ballisticArmed = NO;
      // Unified spring: displacement d = y - H is -overshoot, dy/dt is -v (offset
      // decreasing through the edge) — the rubber return falls out of the same
      // closed form as the detent settle.
      [self startSpringOn:scrollView toTarget:edge fromY:y velocityY:-MAX(v, 0)];
      if (self.onTopArrival != nil && v > 0) {
        self.onTopArrival(v, overshoot);
      }
    } else {
      self.lastOffsetY = y;
      self.lastTimestamp = now;
    }
  }
  if ([self.original respondsToSelector:@selector(scrollViewDidScroll:)]) {
    [self.original scrollViewDidScroll:scrollView];
  }
}

#pragma mark Native rubber spring (critically damped, stiffness 170 / mass 1)

// Signed displacement d(t) = y(t) - target for a critically damped spring:
//   d(t) = (d0 + (v0 + w*d0) t) e^{-w t},  w = sqrt(stiffness/mass) = sqrt(170).
// One closed form serves both moves: the top rubber (d0 = -overshoot, v0 < 0)
// and the detent settle (d0 = release displacement, v0 = release velocity).
static const double kTrackSpringOmega = 13.038404810405298; // sqrt(170)

- (void)startSpringOn:(UIScrollView *)scrollView
             toTarget:(double)target
                fromY:(double)y0
            velocityY:(double)v0
{
  [self stopSpring];
  // KILL THE DECELERATION FIRST (probe-proven 2026-07-26): direct contentOffset
  // property writes do NOT stop a live deceleration — the engine keeps writing its
  // own curve every frame and wins after the spring ends. Only
  // setContentOffset:animated:NO kills it (decel=1 -> 0 in the trace). Same
  // offset, so the kill itself moves nothing.
  [scrollView setContentOffset:scrollView.contentOffset animated:NO];
  self.springScrollView = scrollView;
  self.springStart = CACurrentMediaTime();
  self.springTarget = target;
  self.springD0 = y0 - target;
  self.springV0 = v0;
  self.springLastD = y0 - target;
  self.springLink = [CADisplayLink displayLinkWithTarget:self selector:@selector(springTick:)];
  [self.springLink addToRunLoop:[NSRunLoop mainRunLoop] forMode:NSRunLoopCommonModes];
}

- (void)stopSpring
{
  [self.springLink invalidate];
  self.springLink = nil;
  self.springScrollView = nil;
}

- (void)springTick:(CADisplayLink *)link
{
  UIScrollView *scrollView = self.springScrollView;
  if (scrollView == nil) {
    [self stopSpring];
    return;
  }
  const double t = CACurrentMediaTime() - self.springStart;
  const double w = kTrackSpringOmega;
  const double d = (self.springD0 + (self.springV0 + w * self.springD0) * t) * exp(-w * t);
  const double speed = fabs(d - self.springLastD) / MAX(link.duration, 1.0 / 240.0);
  self.springLastD = d;
  if ((fabs(d) < 0.25 && speed < 8.0) || t > 2.0) {
    [scrollView setContentOffset:CGPointMake(scrollView.contentOffset.x, self.springTarget) animated:NO];
    [self stopSpring];
    return;
  }
  [scrollView setContentOffset:CGPointMake(scrollView.contentOffset.x, self.springTarget + d) animated:NO];
}

@end

#pragma mark - The module

static const void *kTrackProxyKey = &kTrackProxyKey;

@implementation TrackScrollPhysics

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

- (NSArray<NSString *> *)supportedEvents
{
  return @[ @"trackTopArrival" ];
}

- (dispatch_queue_t)methodQueue
{
  return RCTGetUIManagerQueue();
}

/// Depth-first search for the first UIScrollView under a React-managed view —
/// architecture-proof: Paper RCTScrollView, Fabric RCTScrollViewComponentView,
/// and any recycler that wraps a real UIScrollView all resolve the same way.
static UIScrollView *TrackFindScrollView(UIView *view)
{
  if ([view isKindOfClass:[UIScrollView class]]) {
    return (UIScrollView *)view;
  }
  for (UIView *subview in view.subviews) {
    UIScrollView *found = TrackFindScrollView(subview);
    if (found != nil) {
      return found;
    }
  }
  return nil;
}

RCT_EXPORT_METHOD(attach:(nonnull NSNumber *)reactTag
                  config:(NSDictionary *)config
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  [self.bridge.uiManager addUIBlock:^(RCTUIManager *uiManager, NSDictionary<NSNumber *, UIView *> *viewRegistry) {
    UIView *root = viewRegistry[reactTag] ?: [uiManager viewForReactTag:reactTag];
    UIScrollView *scrollView = root ? TrackFindScrollView(root) : nil;
    if (scrollView == nil) {
      reject(@"track_no_scrollview", @"No UIScrollView under the given reactTag", nil);
      return;
    }
    TrackScrollDelegateProxy *proxy = objc_getAssociatedObject(scrollView, kTrackProxyKey);
    if (proxy == nil) {
      proxy = [TrackScrollDelegateProxy new];
      proxy.original = scrollView.delegate;
      objc_setAssociatedObject(scrollView, kTrackProxyKey, proxy, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
      scrollView.delegate = proxy;
      // Durable: the proxy re-wraps itself whenever Fabric replaces the delegate
      // (recyclers replace it constantly; JS-timed re-asserts lose the race).
      [proxy beginObservingDelegateOf:scrollView];
    } else if (scrollView.delegate != proxy) {
      proxy.original = scrollView.delegate;
      scrollView.delegate = proxy;
    }
    __weak TrackScrollPhysics *weakSelf = self;
    proxy.onTopArrival = ^(double velocityPtsPerSecond, double overshootPts) {
      [weakSelf sendEventWithName:@"trackTopArrival"
                             body:@{ @"velocity": @(velocityPtsPerSecond),
                                     @"overshoot": @(overshootPts) }];
    };
    NSNumber *edge = config[@"ballisticEdge"];
    NSNumber *regionEnd = config[@"snapRegionEnd"];
    NSNumber *chromeTopInset = config[@"chromeTopInset"];
    NSNumber *chromeHeight = config[@"chromeHeight"];
    proxy.ballisticEdge = edge != nil ? edge.doubleValue : -1;
    proxy.snapRegionEnd = regionEnd != nil ? regionEnd.doubleValue : -1;
    proxy.snapOffsets = config[@"snapOffsets"] ?: @[];
    proxy.chromeTopInset = chromeTopInset != nil ? chromeTopInset.doubleValue : 0;
    proxy.chromeHeight = chromeHeight != nil ? chromeHeight.doubleValue : 0;
    resolve(@(YES));
  }];
}

// Programmatic settle: drive the SAME critically damped native spring the
// physics uses for detents/rubber — scene-switch snaps feel identical to
// gesture-born settles (and JS-side scrollToOffset through animated wrappers
// proved unreliable).
RCT_EXPORT_METHOD(snapTo:(nonnull NSNumber *)reactTag
                  offset:(nonnull NSNumber *)offset)
{
  [self.bridge.uiManager addUIBlock:^(RCTUIManager *uiManager, NSDictionary<NSNumber *, UIView *> *viewRegistry) {
    UIView *root = viewRegistry[reactTag] ?: [uiManager viewForReactTag:reactTag];
    UIScrollView *scrollView = root ? TrackFindScrollView(root) : nil;
    if (scrollView == nil) {
      return;
    }
    TrackScrollDelegateProxy *proxy = objc_getAssociatedObject(scrollView, kTrackProxyKey);
    if (proxy == nil) {
      [scrollView setContentOffset:CGPointMake(scrollView.contentOffset.x, offset.doubleValue)
                          animated:YES];
      return;
    }
    dispatch_async(dispatch_get_main_queue(), ^{
      [proxy startSpringOn:scrollView
                  toTarget:offset.doubleValue
                     fromY:scrollView.contentOffset.y
                 velocityY:0];
    });
  }];
}

// Header-grab drag channel: direct offset write (non-animated), for the JS
// header pan whose worklet scrollTo proved inert on the recycler's scroll view.
RCT_EXPORT_METHOD(setOffset:(nonnull NSNumber *)reactTag
                  offset:(nonnull NSNumber *)offset)
{
  [self.bridge.uiManager addUIBlock:^(RCTUIManager *uiManager, NSDictionary<NSNumber *, UIView *> *viewRegistry) {
    UIView *root = viewRegistry[reactTag] ?: [uiManager viewForReactTag:reactTag];
    UIScrollView *scrollView = root ? TrackFindScrollView(root) : nil;
    if (scrollView == nil) {
      return;
    }
    dispatch_async(dispatch_get_main_queue(), ^{
      [scrollView setContentOffset:CGPointMake(scrollView.contentOffset.x, offset.doubleValue)
                          animated:NO];
    });
  }];
}

RCT_EXPORT_METHOD(detach:(nonnull NSNumber *)reactTag)
{
  [self.bridge.uiManager addUIBlock:^(RCTUIManager *uiManager, NSDictionary<NSNumber *, UIView *> *viewRegistry) {
    UIView *root = viewRegistry[reactTag] ?: [uiManager viewForReactTag:reactTag];
    UIScrollView *scrollView = root ? TrackFindScrollView(root) : nil;
    if (scrollView == nil) {
      return;
    }
    TrackScrollDelegateProxy *proxy = objc_getAssociatedObject(scrollView, kTrackProxyKey);
    if (proxy != nil) {
      [proxy endObservingDelegateOf:scrollView];
      scrollView.delegate = proxy.original;
      objc_setAssociatedObject(scrollView, kTrackProxyKey, nil, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    }
  }];
}

@end
