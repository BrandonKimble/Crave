#import "TrackScrollPhysics.h"

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
/// Called when a ballistic release will arrive at the top bound, with the velocity
/// (pt/s, positive toward the edge) the flick would carry THROUGH it - UIKit's own
/// delegate velocity adjusted by the deceleration model over the remaining distance.
@property (nonatomic, copy) void (^onTopArrival)(double velocityPtsPerSecond);
/// The list-top boundary (H) in content-offset space; < 0 disables.
@property (nonatomic, assign) CGFloat ballisticEdge;
/// Releases whose native target lands below this bound get detent-targeted.
@property (nonatomic, assign) CGFloat snapRegionEnd;
@property (nonatomic, copy) NSArray<NSNumber *> *snapOffsets;
@end

@implementation TrackScrollDelegateProxy

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
  // FINGER DOWN ⇒ the full track: lift the ballistic bound so the drag can travel
  // 1:1 from deep list through H into sheet travel (the continuous grab).
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
    // velocity.y < 0 means content moving toward the top edge. UIKit gives pt/ms.
    const CGFloat vTowardEdge = -velocity.y * 1000.0; // pt/s toward the edge
    const CGFloat distance = releaseY - edge;
    const CGFloat rate = scrollView.decelerationRate;
    const CGFloat projection = vTowardEdge > 0 ? (vTowardEdge / 1000.0) * rate / (1.0 - rate) : 0;
    if (self.onTopArrival != nil && vTowardEdge > 0 && projection > distance) {
      const double arrival = vTowardEdge * sqrt(MAX(0.0, 1.0 - distance / MAX(projection, 0.0001)));
      self.onTopArrival(arrival);
    }
    // BALLISTIC PHASE, released in the list region: install the bound NOW —
    // synchronously, before UIKit configures deceleration — so H is an
    // engine-known edge and momentum arriving there bounces NATIVELY (identical
    // in kind to the bottom edge). This is the whole reason this module exists:
    // the same inset applied from JS after the end-drag event clamps instead.
    UIEdgeInsets inset = scrollView.contentInset;
    if (inset.top != -edge) {
      inset.top = -edge;
      scrollView.contentInset = inset;
    }
    // Never let the (pre-bound) native target rest inside the sheet region.
    if (targetContentOffset->y < edge) {
      targetContentOffset->y = edge;
    }
    return;
  }

  if (self.snapOffsets.count > 0 && targetContentOffset->y < self.snapRegionEnd) {
    // SHEET REGION release: detent-target via the platform's own snap API. The
    // native target already encodes velocity (UIKit's deceleration projection),
    // so "nearest detent to the target" IS the velocity-aware choice.
    CGFloat best = self.snapOffsets.firstObject.doubleValue;
    for (NSNumber *offset in self.snapOffsets) {
      if (fabs(offset.doubleValue - targetContentOffset->y) < fabs(best - targetContentOffset->y)) {
        best = offset.doubleValue;
      }
    }
    targetContentOffset->y = best;
  }
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
    } else if (scrollView.delegate != proxy) {
      // React (Fabric) re-set the delegate after we proxied — re-wrap the NEW
      // delegate so the proxy rejoins the chain. attach() is therefore
      // RE-ASSERTIVE and safe to call per-gesture from JS.
      proxy.original = scrollView.delegate;
      scrollView.delegate = proxy;
    }
    __weak TrackScrollPhysics *weakSelf = self;
    proxy.onTopArrival = ^(double velocityPtsPerSecond) {
      [weakSelf sendEventWithName:@"trackTopArrival" body:@{ @"velocity": @(velocityPtsPerSecond) }];
    };
    NSNumber *edge = config[@"ballisticEdge"];
    NSNumber *regionEnd = config[@"snapRegionEnd"];
    proxy.ballisticEdge = edge != nil ? edge.doubleValue : -1;
    proxy.snapRegionEnd = regionEnd != nil ? regionEnd.doubleValue : -1;
    proxy.snapOffsets = config[@"snapOffsets"] ?: @[];
    resolve(@(YES));
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
      scrollView.delegate = proxy.original;
      objc_setAssociatedObject(scrollView, kTrackProxyKey, nil, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    }
  }];
}

@end
