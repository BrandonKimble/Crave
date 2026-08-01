#import "TrackShellSlot.h"

@implementation TrackShellRegistry {
  NSMapTable<NSString *, TrackShellSlotView *> *_viewsByRole;
}

+ (instancetype)shared
{
  static TrackShellRegistry *instance;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    instance = [TrackShellRegistry new];
  });
  return instance;
}

- (instancetype)init
{
  if ((self = [super init])) {
    _viewsByRole = [NSMapTable strongToWeakObjectsMapTable];
  }
  return self;
}

- (void)registerView:(TrackShellSlotView *)view
{
  if (view.slotRole == nil) {
    return;
  }
  [_viewsByRole setObject:view forKey:view.slotRole];
  if (self.onSlotsChanged) {
    self.onSlotsChanged();
  }
}

- (void)unregisterView:(TrackShellSlotView *)view
{
  if (view.slotRole != nil && [_viewsByRole objectForKey:view.slotRole] == view) {
    [_viewsByRole removeObjectForKey:view.slotRole];
  }
}

- (TrackShellSlotView *)viewForRole:(NSString *)role
{
  return [_viewsByRole objectForKey:role];
}

@end

/// A chrome subtree JS marked as INTERACTIVE. Everything else in the chrome is
/// sheet surface, and a touch on sheet surface belongs to the track.
static NSString *const kTrackChromeControlMarker = @"track-chrome-control";

/// Fabric and Paper expose RN's nativeID under DIFFERENT ObjC properties
/// (`nativeId` on RCTViewComponentView vs the `nativeID` category), and a
/// marker read through the wrong one silently matches nothing — which reads as
/// "the buttons stopped working" rather than as a lookup bug. Test every
/// spelling plus accessibilityIdentifier (testID), so the mark cannot be
/// missed by architecture.
static BOOL TrackViewCarriesMarker(UIView *node)
{
  if ([node.accessibilityIdentifier isEqualToString:kTrackChromeControlMarker]) {
    return YES;
  }
  for (NSString *key in @[ @"nativeId", @"nativeID" ]) {
    if ([node respondsToSelector:NSSelectorFromString(key)]) {
      id value = [node valueForKey:key];
      if ([value isKindOfClass:[NSString class]] &&
          [(NSString *)value isEqualToString:kTrackChromeControlMarker]) {
        return YES;
      }
    }
  }
  return NO;
}

static BOOL TrackViewIsChromeControl(UIView *view, UIView *stopAt)
{
  UIView *node = view;
  while (node != nil && node != stopAt) {
    if (TrackViewCarriesMarker(node)) {
      return YES;
    }
    node = node.superview;
  }
  return NO;
}

@implementation TrackShellSlotView {
  CGRect _layoutFrame;
  CGFloat _shellOffsetY;
  BOOL _hasLayoutFrame;
}

/// THE SINGLE PAINTED CHROME (2026-08-01). The header used to exist TWICE: a
/// touch twin inside the scroll content (so every header pixel is a scroll
/// touch) and a visual twin here — because the band mask lives on the SCROLL
/// VIEW's layer and so clips everything inside it, the in-content chrome
/// included. Two paint-capable copies meant any desync read as TWO SHEETS, and
/// during a stash they diverge by exactly sigma: the header's controls sat
/// sigma points from where they were painted.
///
/// ONE chrome now: here, outside the scroll view, unmasked, painted, moved by
/// the one writer. Grabbability comes back by REDIRECTING THE HIT — a touch
/// that is not on a marked control resolves to the presented leg's scroll
/// view, so UIKit puts that scroll view's pan recognizer in the delivery chain
/// and the drag is an ordinary track drag: same engine, same
/// delaysContentTouches tap-vs-drag arbitration, no second writer, and no
/// contentOffset write (P8, and the v3 drag channel this repo already deleted).
- (UIView *)hitTest:(CGPoint)point withEvent:(UIEvent *)event
{
  UIView *inner = [super hitTest:point withEvent:event];
  if (![self.slotRole isEqualToString:@"chrome"]) {
    return inner;
  }
  if (inner != nil && inner != self && TrackViewIsChromeControl(inner, self)) {
    return inner;
  }
  UIScrollView *host = TrackPresentedScrollView();
  if (host == nil || host.window == nil) {
    return inner;
  }
  UIView *redirected = [host hitTest:[self convertPoint:point toView:host] withEvent:event];
  return redirected ?: host;
}

// THE COMPOSED-FRAME SEAL (P11, 2026-07-31, measured live): setting a frame on
// a TRANSFORMED view re-solves the view's position so the final frame matches
// the setter — silently cancelling the translation while transform.ty still
// READS as set (observed: ty=70, rendered at 0; the interop wrapper re-lays
// out the slot with frame=bounds on every pass). Transforms on any
// externally-laid-out view are therefore doomed. The seal lives one level
// down instead: POSITION = LAYOUT ⊕ SHELL OFFSET, composed inside setFrame —
// every external layout write re-applies the engine's offset by construction.
- (void)setFrame:(CGRect)frame
{
  _layoutFrame = frame;
  _hasLayoutFrame = YES;
  [super setFrame:CGRectOffset(frame, 0, _shellOffsetY)];
}

- (void)setTransform:(CGAffineTransform)transform
{
  // Dropped by design — position belongs to the engine (via the offset).
}

- (void)trackApplyTransform:(CGAffineTransform)transform
{
  const CGFloat offsetY = transform.ty;
  if (fabs(offsetY - _shellOffsetY) < 0.01) {
    return;
  }
  _shellOffsetY = offsetY;
  if (_hasLayoutFrame) {
    [super setFrame:CGRectOffset(_layoutFrame, 0, _shellOffsetY)];
  }
}

- (void)setSlotRole:(NSString *)slotRole
{
  _slotRole = [slotRole copy];
  if (self.window != nil) {
    [[TrackShellRegistry shared] registerView:self];
  }
}

- (void)didMoveToWindow
{
  [super didMoveToWindow];
  if (self.window != nil) {
    [[TrackShellRegistry shared] registerView:self];
  } else {
    [[TrackShellRegistry shared] unregisterView:self];
  }
}

@end

@implementation TrackShellSlotViewManager

RCT_EXPORT_MODULE(TrackShellSlot)
RCT_EXPORT_VIEW_PROPERTY(slotRole, NSString)

- (UIView *)view
{
  return [TrackShellSlotView new];
}

@end


// ─── THE CARVE ───────────────────────────────────────────────────────────────
// Written by the engine's shell writer (TrackScrollPhysics didScroll — the one
// writer, same frame as every other shell position). Seeded high so a boot
// frame before the first shell write carves everything above the collapsed
// sheet rather than nothing.
CGFloat gTrackCarveSheetTop = 0;

@implementation TrackTouchCarveView

- (nullable UIView *)hitTest:(CGPoint)point withEvent:(nullable UIEvent *)event
{
  // Points are in this view's coordinates; the carve view is mounted
  // full-screen at the page root, so y IS screen y. Above the sheet's live
  // top edge the sheet does not exist for touches — the map underneath owns
  // them (exactly CraveBottomSheetHostView's interactive-frame law).
  if (gTrackCarveSheetTop > 0 && point.y < gTrackCarveSheetTop) {
    return nil;
  }
  return [super hitTest:point withEvent:event];
}

@end

@implementation TrackTouchCarveViewManager

RCT_EXPORT_MODULE(TrackTouchCarve)

- (UIView *)view
{
  return [TrackTouchCarveView new];
}

@end


// ─── THE LEG SLOTS ───────────────────────────────────────────────────────────

@implementation TrackLegRegistry {
  NSMapTable<NSString *, TrackLegSlotView *> *_views;
}

+ (instancetype)shared
{
  static TrackLegRegistry *shared;
  static dispatch_once_t once;
  dispatch_once(&once, ^{ shared = [TrackLegRegistry new]; });
  return shared;
}

- (instancetype)init
{
  if ((self = [super init])) {
    _views = [NSMapTable strongToWeakObjectsMapTable];
  }
  return self;
}

static NSString *TrackLegMapKey(NSString *key, NSString *kind)
{
  return [NSString stringWithFormat:@"%@|%@", key, kind];
}

- (void)registerView:(TrackLegSlotView *)view
{
  if (view.legKey == nil || view.legKind == nil) {
    return;
  }
  [_views setObject:view forKey:TrackLegMapKey(view.legKey, view.legKind)];
  // Seed presentation at boot: the first slot claiming initialPresented while
  // no presented key exists becomes it (both its kinds share the key).
  if (self.presentedKey == nil && view.initialPresented) {
    self.presentedKey = view.legKey;
  }
  view.alpha = [view.legKey isEqualToString:self.presentedKey] ? 1.0 : 0.0;
  if (self.onLegRegistered != nil) {
    self.onLegRegistered(view);
  }
}

- (void)unregisterView:(TrackLegSlotView *)view
{
  if (view.legKey == nil || view.legKind == nil) {
    return;
  }
  NSString *key = TrackLegMapKey(view.legKey, view.legKind);
  if ([_views objectForKey:key] == view) {
    [_views removeObjectForKey:key];
  }
}

- (nullable TrackLegSlotView *)viewForKey:(NSString *)key kind:(NSString *)kind
{
  return [_views objectForKey:TrackLegMapKey(key, kind)];
}

- (void)applyAlphasForPresentedKey:(NSString *)key
{
  self.presentedKey = key;
  for (NSString *mapKey in [[_views keyEnumerator] allObjects]) {
    TrackLegSlotView *view = [_views objectForKey:mapKey];
    if (view != nil) {
      view.alpha = [view.legKey isEqualToString:key] ? 1.0 : 0.0;
    }
  }
}

- (NSArray<NSDictionary *> *)auditLegs
{
  NSMutableArray *out = [NSMutableArray array];
  for (NSString *mapKey in [[_views keyEnumerator] allObjects]) {
    TrackLegSlotView *view = [_views objectForKey:mapKey];
    if (view == nil) {
      continue;
    }
    CGRect winFrame = [view convertRect:view.bounds toView:nil];
    [out addObject:@{
      @"key": mapKey,
      @"alpha": @(view.alpha),
      @"y": @(CGRectGetMinY(winFrame)),
      @"hidden": @(view.isHidden),
      @"windowNil": @(view.window == nil),
    }];
  }
  return out;
}

@end

@implementation TrackLegSlotView

- (void)didMoveToWindow
{
  [super didMoveToWindow];
  if (self.window != nil) {
    [[TrackLegRegistry shared] registerView:self];
  } else {
    [[TrackLegRegistry shared] unregisterView:self];
  }
}

@end

@implementation TrackLegSlotViewManager

RCT_EXPORT_MODULE(TrackLegSlot)
RCT_EXPORT_VIEW_PROPERTY(legKey, NSString)
RCT_EXPORT_VIEW_PROPERTY(legKind, NSString)
RCT_EXPORT_VIEW_PROPERTY(initialPresented, BOOL)

- (UIView *)view
{
  return [TrackLegSlotView new];
}

@end
