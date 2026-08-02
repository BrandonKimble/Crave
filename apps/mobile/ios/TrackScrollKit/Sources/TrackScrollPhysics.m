#import "TrackScrollPhysics.h"
#import "TrackShellSlot.h"

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
/// THE NATIVE PIN (the scroll view IS the sheet, step 1): the chrome lives in
/// the track's CONTENT (after the spacer) so it is grabbable and shares the
/// content's motion source. While τ ≤ H it travels with content; past H it must
/// hold at the sheet's pinned top. FlashList's sticky headers are JS-driven and
/// would reintroduce the one-frame lag (the wiggle), so the pin happens HERE —
/// inside scrollViewDidScroll, the same frame as the offset change, exactly as
/// RCTScrollView implements native sticky headers.
@property (nonatomic, weak) UIView *pinnedChromeView;
// (context symbol for the clamp guard, declared file-top below)
/// ── THE SHELL (native-shell derivation, 2026-07-29) ─────────────────────────
/// Native owns POSITION, RN owns PIXELS. Every view whose position is a
/// function of τ is transformed HERE, in scrollViewDidScroll — one writer, one
/// frame, zero lag between any two shell layers:
///   frost       screen-space: translateY = sheetTop(τ)        (view laid at 0)
///   tail        screen-space: translateY = max(sheetTop, contentEnd − τ)
///   chromeView  screen-space: translateY = sheetTop(τ)        (the VISUALS —
///               a box-none overlay; its twin lives in the CONTENT for touches,
///               pinned by pinnedChromeView above)
///   band mask   rows never RENDER above sheetTop(τ) + chromeHeight. A CALayer
///               mask clips rendering ONLY, so the masked touch twin still
///               hit-tests and the scroll view keeps owning tap-vs-drag for
///               every pixel of the sheet.
@property (nonatomic, weak) UIView *shellFrostView;
@property (nonatomic, weak) UIView *shellTailView;
@property (nonatomic, weak) UIView *shellChromeView;
@property (nonatomic, strong) CALayer *shellBandMask;
/// MASK OWNERSHIP IS EXCLUSIVE (2026-08-01). Rows must not paint in the chrome
/// band, so SOMETHING must clip them — but a CALayer mask composites the whole
/// sublayer tree, so a mask on the SCROLL VIEW also clips anything inside it.
/// Hence exactly two legal modes:
///   chrome OUTSIDE the scroll view -> the SCROLL VIEW carries the band mask.
///   chrome INSIDE  the scroll view -> the ROWS carry it, and the scroll view
///                                     must carry NONE.
/// Being in both modes at once is what made the in-content chrome invisible:
/// the removal ran earlier in bindShell than the (unconditional) install.
@property (nonatomic, weak) UIView *chromeContentView;
@property (nonatomic, weak) UIView *leaderView;
@property (nonatomic, assign) CGFloat shellExpandedTop;
@property (nonatomic, assign) CGFloat shellTrackH;
@property (nonatomic, assign) CGFloat shellChromeHeight;
@property (nonatomic, assign) BOOL shellEnabled;
@property (nonatomic, assign) BOOL clampGuardInstalled;
/// THE STASH σ (transition derivation XI): the header is a HANDLE. A drag
/// beginning in the chrome band moves the EDGE instead of the state: H+σ is
/// the effective sheet/list boundary everywhere. Stash (σ += listY) at
/// header-drag begin and dissolve (σ := 0) when τ rises back to H+σ are BOTH
/// jump-free by algebra — sheetTop is unchanged at either instant, and rows,
/// being content, move with the sheet automatically. σ is written only here
/// and in didScroll: the same two hands that own τ.
@property (nonatomic, assign) CGFloat stashSigma;
@property (nonatomic, copy) void (^onSigmaChanged)(CGFloat sigma);
/// A drag that begins on the header is a POSTURE drag for its whole life:
/// the boundary becomes its scroll CEILING, expressed as an inset (law #18 —
/// bounds are insets, never per-frame writes), so an upward header drag gets
/// UIKit's own rubber band at the boundary instead of scrolling the list.
@property (nonatomic, assign) BOOL postureDragActive;
/// THE HEADER-GATED RELEASE (ported from the old resolveHeaderGatedSnapValue):
/// a drag resolves against where it STARTED, not against where it ended, so a
/// release is one deliberate step and never a nearest-detent lottery.
@property (nonatomic, assign) CGFloat dragStartTau;
/// Whether this posture drag began already at the boundary — the state in which
/// an upward pull tugs the WHOLE sheet elastically (the old
/// expandAllowTopElastic) instead of rubber-banding the rows under a pinned
/// header.
@property (nonatomic, assign) BOOL postureDragFromBoundary;
/// THE OVERSHOOT EPISODE. The tug is NOT a property of the finger — it is a
/// property of the sheet being past its boundary. Gating it on the drag made
/// the sheet's tug term snap to 0 the instant the finger lifted while tau
/// sprang home separately: the sheet "snapped back" instead of easing, and the
/// rows visibly lagged it (they ride tau; the sheet had already jumped). The
/// episode opens when a boundary-drag pushes past the boundary and closes only
/// when tau actually returns — so finger, spring, sheet and rows are one body
/// for the whole excursion.
@property (nonatomic, assign) BOOL postureOvershootActive;
/// Host scroll view (weak): lets slot registration ping a synchronous shell
/// re-apply so a freshly recreated slot is positioned in the SAME UIKit
/// transaction it appears in (the flash becomes unwritable).
@property (nonatomic, weak) UIScrollView *hostScrollView;
- (void)startSpringOn:(UIScrollView *)scrollView
             toTarget:(double)target
                fromY:(double)y0
            velocityY:(double)v0;
- (void)stopSpring;
- (void)applyRangeLawTo:(UIScrollView *)scrollView;
@end

/// ── THE POSTURE REGISTER (residents red team, 2026-08-01) ───────────────────
/// "Posture is a property of the SHEET; scroll is a property of the LEG."
/// With N resident legs there are N scroll views, and reading posture from any
/// one of them made the sheet position a side effect of whichever leg happened
/// to be attached — a fresh leg's τ=0 teleported the sheet to collapsed on a
/// switch. The register is the ONE sheet posture: written every frame by the
/// PRESENTED leg's didScroll (the same hand that owns τ and σ), read by
/// refuse() at every switch, seeded into a fresh leg before its first frame.
/// The sheet provably cannot move on a switch — again, and now for N legs.
static CGFloat gTrackPostureRegister = 0;
static __weak UIScrollView *gTrackPostureOwner = nil;
/// Geometry mirror for THE SWITCH TRANSACTION: a fresh leg has no proxy yet,
/// but the transaction must still re-aim the shell from its state. Written by
/// bindShell (the one configuration call), read only inside the transaction.
static CGFloat gTrackShellExpandedTop = 0;
static CGFloat gTrackShellTrackH = 0;

UIScrollView *TrackPresentedScrollView(void)
{
  return gTrackPostureOwner;
}

static void *kTrackDelegateKVOContext = &kTrackDelegateKVOContext;
static void *kTrackClampGuardCtx = &kTrackClampGuardCtx;

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
  if (context == kTrackClampGuardCtx) {
    // THE PRIOR-GROW (attributed live 2026-07-29: [SWITCH] target=648 →
    // tau=311). UIKit clamps contentOffset WHILE processing the new
    // contentSize — before any after-the-fact observer runs — so a guard that
    // reads τ afterwards preserves the already-clamped value. The PRIOR
    // notification fires BEFORE the change: grow the inset to cover the
    // current τ against ANY new content height (τ + viewport), so the clamp
    // never occurs; the after-notification then tightens to the exact
    // formula. Growing an inset never moves content; only shrinking can.
    if ([change[NSKeyValueChangeNotificationIsPriorKey] boolValue]) {
      // ...EXCEPT under a live posture drag, whose ceiling outranks it (see
      // applyRangeLawTo): growing here would lift maxOffset above H+sigma and
      // let the drag escape into list scrolling mid-gesture.
      if (self.postureDragActive) {
        return;
      }
      UIScrollView *prior = (UIScrollView *)object;
      const CGFloat viewport = CGRectGetHeight(prior.bounds);
      const CGFloat needed = ceil(prior.contentOffset.y + viewport);
      if (prior.contentInset.bottom < needed) {
        UIEdgeInsets insets = prior.contentInset;
        insets.bottom = needed;
        prior.contentInset = insets;
      }
      return;
    }
    // THE RANGE LAW (transition derivation VI): the ENGINE owns τ's legal
    // range, and this is its ONE writer — synchronous with every contentSize
    // change, so UIKit can never clamp τ through an async JS gap. The range
    // must always cover [0, trackH] (every posture legal ⇒ every seat
    // reachable by construction ⇒ no reachability re-assert machinery) AND
    // the current τ (a content swap must never move the sheet).
    //   reach = max(0, viewport − (contentH − trackH))
    //   keep  = max(0, τ − (contentH − viewport))
    //   insetBottom = max(reach, keep)
    if (!self.postureDragActive) {
      [self applyRangeLawTo:(UIScrollView *)object];
    }
    // THE SHELL REFRESH: with the prior-grow, a content swap no longer clamps
    // — which also means no didScroll fires, so tail/mask/chrome would hold
    // positions computed against the OLD contentSize (seen live: tail parked
    // offscreen after a swap, frost showing below the new shorter content).
    // Re-run the shell writer against the new geometry explicitly.
    [self scrollViewDidScroll:(UIScrollView *)object];
    return;
  }
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
  // NO CHROME REGION EXISTS (the scroll view IS the sheet, 2026-07-28): the
  // chrome is CONTENT inside this scroll view, so a touch on it is an ordinary
  // track touch. The old chromeGrab arbitration + its inset bound are DELETED —
  // one track, one engine, no special regions.
  // FINGER DOWN: full 1:1 track (the continuous grab); any armed intercept or
  // in-flight bounce dies — the finger owns the track from here.
  self.ballisticArmed = NO;
  [self stopSpring];
  self.dragStartTau = scrollView.contentOffset.y;
  // THE STASH: a drag that BEGINS in the chrome band is a posture drag — the
  // sheet must follow the finger immediately, list scroll preserved. σ moves
  // the boundary so that happens; the touch keeps being an ordinary scroll
  // touch (tap-vs-drag arbitration untouched).
  if (self.shellEnabled && self.ballisticEdge >= 0) {
    const CGFloat tau = scrollView.contentOffset.y;
    const CGFloat effEdge = self.ballisticEdge + self.stashSigma;
    const CGFloat listY = MAX(0.0, tau - effEdge);
    const CGFloat sheetTop = self.shellExpandedTop + MAX(0.0, (self.shellTrackH + self.stashSigma) - tau);
    // WINDOW COORDINATES, NOT SUPERVIEW (2026-08-01). sheetTop is a SCREEN y
    // (it is built from shellExpandedTop), so the touch must be measured in
    // the same space. Measuring in scrollView.superview only agrees when that
    // superview sits exactly at the screen origin — and the track's scroll
    // view is nested under the touch-carve view, the nav-exclusion mask and
    // the safe-area providers. Any offset makes this test MISS, the drag never
    // becomes a posture drag, and a header pull runs the plain continuum
    // instead: the list scrolls back to the top before the sheet moves, which
    // is the owner's "the scroll jumps to the top when I drag the sheet down".
    const CGFloat touchY = [scrollView.panGestureRecognizer locationInView:nil].y;
    if (touchY >= sheetTop - 1 && touchY <= sheetTop + self.shellChromeHeight + 1) {
      if (listY > 0.5) {
        self.stashSigma += listY;
        if (self.onSigmaChanged) {
          self.onSigmaChanged(self.stashSigma);
        }
      }
      // THE POSTURE CEILING: cap maxOffset at the boundary for this drag —
      // header drags may move the SHEET only, in both directions. Signed
      // inset: maxOffset = contentH + inset − viewport == boundary exactly.
      self.postureDragActive = YES;
      self.postureDragFromBoundary = (tau >= effEdge - 0.5);
      const CGFloat boundary = self.ballisticEdge + self.stashSigma;
      const CGFloat viewport = CGRectGetHeight(scrollView.bounds);
      UIEdgeInsets capInsets = scrollView.contentInset;
      capInsets.bottom = boundary + viewport - scrollView.contentSize.height;
      scrollView.contentInset = capInsets;
    }
  }
  if (self.ballisticEdge >= 0 && scrollView.contentInset.top != 0) {
    UIEdgeInsets inset = scrollView.contentInset;
    inset.top = 0;
    scrollView.contentInset = inset;
  }
  if ([self.original respondsToSelector:@selector(scrollViewWillBeginDragging:)]) {
    [self.original scrollViewWillBeginDragging:scrollView];
  }
}

- (void)scrollViewDidEndDragging:(UIScrollView *)scrollView willDecelerate:(BOOL)decelerate
{
  if (self.postureDragActive) {
    self.postureDragActive = NO;
    // postureOvershootActive is deliberately NOT cleared here: the episode
    // closes in didScroll when tau is actually home, so the spring back is one
    // cohesive sheet rather than a jump plus a lagging list.
    self.postureDragFromBoundary = NO;
    // Restore the range law's inset (the ceiling was drag-scoped).
    [self applyRangeLawTo:scrollView];
  }
  if ([self.original respondsToSelector:@selector(scrollViewDidEndDragging:willDecelerate:)]) {
    [self.original scrollViewDidEndDragging:scrollView willDecelerate:decelerate];
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

  const CGFloat edge = self.ballisticEdge >= 0 ? self.ballisticEdge + self.stashSigma : self.ballisticEdge;
  const CGFloat releaseY = scrollView.contentOffset.y;

  // THE TUG RETURNS: a posture drag that pulled the sheet past its boundary
  // springs back to the boundary — it is elastic, never a new posture.
  if (self.postureOvershootActive && edge >= 0 && releaseY > edge) {
    targetContentOffset->y = releaseY;
    [self startSpringOn:scrollView toTarget:edge fromY:releaseY velocityY:velocity.y * 1000.0];
    return;
  }

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

  if (self.snapOffsets.count > 0 && releaseY < self.snapRegionEnd + self.stashSigma) {
    // SHEET REGION release — two laws in one move:
    //   THE BALLISTIC WALL: momentum born in the sheet region may never cross H.
    //   Riding targetContentOffset let a fast release project PAST H and pour its
    //   momentum straight into list scrolling with no finger down.
    //   THE SNAPPY SETTLE: UIKit's deceleration toward a detent is a long lazy
    //   ease; detents settle on the SAME critically damped spring as the top
    //   rubber — one physics system for every release, velocity-continuous from
    //   the finger's true release speed.
    // Velocity-aware detent choice: UIKit's own projection, clamped to <= H.
    // Sheet-region detents live at detentTau + σ in τ-space.
    // THE HEADER-GATED RELEASE (ported verbatim in spirit from the old
    // resolveHeaderGatedSnapValue; the track had only a nearest-detent pick,
    // which is why releases stopped feeling like the old sheet):
    //   anchor on where the DRAG STARTED, project velocity 0.18s ahead, ignore
    //   travel inside a 20pt dead zone, cancel on a fast reversal, and move at
    //   most ONE detent per drag once a full gate of min(chromeHeight, 96) has
    //   been cleared. Deliberate, repeatable, and impossible to overshoot.
    const CGFloat startTau = self.dragStartTau;
    CGFloat startDetent = self.snapOffsets.firstObject.doubleValue + self.stashSigma;
    NSUInteger startIndex = 0;
    for (NSUInteger i = 0; i < self.snapOffsets.count; i++) {
      const CGFloat candidate = self.snapOffsets[i].doubleValue + self.stashSigma;
      if (fabs(candidate - startTau) < fabs(startDetent - startTau)) {
        startDetent = candidate;
        startIndex = i;
      }
    }
    const double velocityPtsPerSecond = velocity.y * 1000.0;
    const double travel = releaseY - startTau;
    const double projectedTravel = travel + velocityPtsPerSecond * 0.18;
    const double gate = MIN(self.shellChromeHeight > 0 ? self.shellChromeHeight : 96.0, 96.0);
    const BOOL reversed = (travel > 0 && velocityPtsPerSecond < 0) ||
                          (travel < 0 && velocityPtsPerSecond > 0);
    const BOOL reversalCancel =
        reversed && fabs(velocityPtsPerSecond) >= 220.0 && fabs(travel) <= 140.0;
    CGFloat best = startDetent;
    if (!reversalCancel && fabs(travel) >= 20.0 && fabs(projectedTravel) >= gate) {
      // snapOffsets ascend in tau: higher index = more expanded.
      const NSInteger step = projectedTravel > 0 ? 1 : -1;
      const NSInteger nextIndex = (NSInteger)startIndex + step;
      if (nextIndex >= 0 && nextIndex < (NSInteger)self.snapOffsets.count) {
        best = self.snapOffsets[(NSUInteger)nextIndex].doubleValue + self.stashSigma;
      }
    }
    targetContentOffset->y = releaseY; // no native deceleration — the spring owns it
    [self startSpringOn:scrollView toTarget:best fromY:releaseY velocityY:velocity.y * 1000.0];
  }
}

- (void)applyRangeLawTo:(UIScrollView *)scrollView
{
  // THE CEILING IS DRAG-SCOPED AND OUTRANKS THE RANGE LAW (header-drag red
  // team): while a posture drag is live, maxOffset must stay H+sigma. The
  // recycler changes contentSize DURING the drag (that is what dragging
  // causes), and this method plus the KVO prior-grow were rewriting the inset
  // with no knowledge of the drag — silently destroying the ceiling mid-
  // gesture and handing the rest of the drag to free list scrolling.
  if (self.postureDragActive) {
    return;
  }
  if (!self.shellEnabled) {
    return;
  }
  const CGFloat viewport = CGRectGetHeight(scrollView.bounds);
  if (viewport <= 0) {
    return;
  }
  const CGFloat contentH = scrollView.contentSize.height;
  const CGFloat tau = scrollView.contentOffset.y;
  const CGFloat reach = MAX(0.0, viewport - (contentH - self.shellTrackH));
  const CGFloat keep = MAX(0.0, tau - (contentH - viewport));
  const CGFloat target = ceil(MAX(reach, keep));
  UIEdgeInsets insets = scrollView.contentInset;
  if (fabs(insets.bottom - target) > 0.5) {
    insets.bottom = target;
    scrollView.contentInset = insets;
  }
}

- (void)scrollViewDidScroll:(UIScrollView *)scrollView
{
  // THE DISSOLVE: τ back at (or past) the effective boundary means the sheet
  // is fully expanded and the content offset IS the old scroll — σ has done
  // its job and evaporates. sheetTop is unchanged by algebra; nothing moves.
  // Never while TRACKING: at the stash instant τ == H+σ exactly, and a
  // finger-down dissolve would kill the stash at birth (seen live — the
  // header drag reverted to unscrolling). The dissolve waits for the finger
  // to lift; a rest at exactly H+σ then dissolves into "expanded at the old
  // scroll" with zero movement.
  if (self.stashSigma > 0 && !scrollView.tracking &&
      scrollView.contentOffset.y >= self.ballisticEdge + self.stashSigma - 0.5) {
    self.stashSigma = 0;
    if (self.onSigmaChanged) {
      self.onSigmaChanged(0);
    }
  }
  const CGFloat edge = self.ballisticEdge >= 0 ? self.ballisticEdge + self.stashSigma : self.ballisticEdge;
  // NO PER-FRAME CLAMP (jerk fix, 2026-07-27): forcing contentOffset back to
  // the edge every frame FIGHTS UIKit — the finger moves, the clamp yanks, the
  // engine re-syncs ("bounces back, then continues"). The prototype had no such
  // override and moved perfectly.
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
  // THE SHELL WRITER: every τ-derived position, one place, same frame.
  // OWNER-GATED (atomic-switch red team W7): a hidden leg's proxy survives
  // with shellEnabled — its clamp/KVO scrolls must not re-aim the global
  // slots to a stale τ. Only the presented leg speaks for the shell.
  // THE POSTURE REGISTER + CARVE WRITES sit OUTSIDE the shellEnabled gate: a
  // cold leg's spring must still speak for the sheet (its shell wiring may
  // trail by a beat) — only OWNERSHIP gates them, never shell state.
  if (scrollView == gTrackPostureOwner) {
    const CGFloat trackHNow = self.shellTrackH > 0 ? self.shellTrackH : gTrackShellTrackH;
    const CGFloat expandedTopNow = self.shellEnabled ? self.shellExpandedTop : gTrackShellExpandedTop;
    if (trackHNow > 0) {
      gTrackPostureRegister = MIN(MAX(0.0, scrollView.contentOffset.y - self.stashSigma), trackHNow);
    }
    gTrackCarveSheetTop = expandedTopNow + MAX(0.0, (trackHNow + self.stashSigma) - scrollView.contentOffset.y);
  }
  if (self.shellEnabled && (gTrackPostureOwner == nil || scrollView == gTrackPostureOwner)) {
    const CGFloat tau = scrollView.contentOffset.y;
    // THE ELASTIC TUG (old expandAllowTopElastic, restored): a header drag that
    // began at the boundary and pulls UP moves the WHOLE SHEET above its
    // expanded top and springs back — it must never scroll rows under a pinned
    // header. UIKit has already rubber-damped tau past the posture ceiling, so
    // the overshoot IS the damped travel; the sheet simply follows it, and rows
    // (being content at tau) stay glued to the sheet by the same algebra.
    const CGFloat tugBoundary = self.shellTrackH + self.stashSigma;
    if (self.postureDragActive && self.postureDragFromBoundary && tau > tugBoundary + 0.5) {
      self.postureOvershootActive = YES;
    } else if (self.postureOvershootActive && tau <= tugBoundary + 0.5) {
      self.postureOvershootActive = NO;
    }
    const CGFloat tug = (self.postureOvershootActive && tau > tugBoundary) ? (tau - tugBoundary) : 0.0;
    const CGFloat sheetTop = self.shellExpandedTop + MAX(0.0, tugBoundary - tau) - tug;
    // THE REAL SLOT: registry-first (self-registered, transform-sealed views);
    // the tag-bound views remain as the legacy fallback until the delete pass.
    TrackShellRegistry *registry = [TrackShellRegistry shared];
    TrackShellSlotView *frostSlot = [registry viewForRole:@"frost"];
    UIView *frost = frostSlot ?: self.shellFrostView;
    if (frost != nil) {
      const CGAffineTransform t = CGAffineTransformMakeTranslation(0, sheetTop);
      if (!CGAffineTransformEqualToTransform(frost.transform, t)) {
        if (frostSlot != nil) {
          [frostSlot trackApplyTransform:t];
        } else {
          frost.transform = t;
        }
      }
    }
    TrackShellSlotView *chromeSlot = [registry viewForRole:@"chrome"];
    UIView *chromeOverlay = chromeSlot ?: self.shellChromeView;
    if (chromeOverlay != nil) {
      const CGAffineTransform t = CGAffineTransformMakeTranslation(0, sheetTop);
      if (!CGAffineTransformEqualToTransform(chromeOverlay.transform, t)) {
        if (chromeSlot != nil) {
          [chromeSlot trackApplyTransform:t];
        } else {
          chromeOverlay.transform = t;
        }
      }
    }
    TrackShellSlotView *tailSlot = [registry viewForRole:@"tail"];
    UIView *tail = tailSlot ?: self.shellTailView;
    if (tail != nil) {
      const CGFloat contentEnd = scrollView.contentSize.height - tau;
      const CGFloat tailTop = MAX(sheetTop, contentEnd);
      const CGAffineTransform t = CGAffineTransformMakeTranslation(0, tailTop);
      if (!CGAffineTransformEqualToTransform(tail.transform, t)) {
        if (tailSlot != nil) {
          [tailSlot trackApplyTransform:t];
        } else {
          tail.transform = t;
        }
      }
    }
    // THE ROW MASKS — THE PATH RULE (rewritten 2026-08-01 after a regression).
    // The invariant is one sentence: EVERYTHING THAT IS NOT THE CHROME IS
    // CLIPPED AT THE BAND. My first cut masked only the DIRECT children of the
    // content view that did not contain the chrome — which silently masks
    // NOTHING the moment the recycler nests the header and the cells under a
    // single wrapper (that wrapper contains the chrome, so it was skipped).
    // Under Fabric interop it does exactly that, so content stopped being
    // clipped at all: rows showed through the header's cutouts and ran off the
    // top of the screen.
    //
    // Depth-independent rule instead: walk the chrome's ancestor path from the
    // content view down, and at EVERY level mask the siblings that are off the
    // path. Nothing about the recycler's internal nesting can defeat it, and
    // views ON the path have their masks cleared so a re-parent cannot leave a
    // stale clip behind.
    UIView *chromeContent = self.chromeContentView;
    if (chromeContent != nil) {
      UIView *contentView = nil;
      NSMutableArray<UIView *> *chromePath = [NSMutableArray array];
      for (UIView *node = chromeContent; node != nil; node = node.superview) {
        [chromePath insertObject:node atIndex:0];
        if (node.superview == scrollView) { contentView = node; break; }
      }
      if (contentView != nil) {
        const CGFloat bandBottom = tau + sheetTop + self.shellChromeHeight;
        const CGFloat w = CGRectGetWidth(scrollView.bounds);
        const CGFloat h = CGRectGetHeight(scrollView.bounds);
        [CATransaction begin];
        [CATransaction setDisableActions:YES];
        for (UIView *onPath in chromePath) {
          // A view on the path must never be clipped — it carries the chrome.
          if (onPath.layer.mask != nil) { onPath.layer.mask = nil; }
          // ...and the CHROME ITSELF is the end of the path: everything inside
          // it IS the chrome, so nothing in there may be clipped. Walking past
          // this masked the header's own contents and the chrome disappeared
          // while the rows clipped correctly — the boundary, not the rule.
          if (onPath == chromeContent) { continue; }
          for (UIView *sibling in onPath.subviews) {
            if ([chromePath containsObject:sibling]) { continue; }
            CALayer *rowMask = sibling.layer.mask;
            if (rowMask == nil) {
              rowMask = [CALayer layer];
              rowMask.backgroundColor = [UIColor blackColor].CGColor;
              sibling.layer.mask = rowMask;
            }
            const CGPoint origin = [sibling convertPoint:CGPointZero toView:contentView];
            const CGRect next = CGRectMake(-w, bandBottom - origin.y, w * 3.0, h * 6.0);
            if (!CGRectEqualToRect(rowMask.frame, next)) { rowMask.frame = next; }
          }
        }
        [CATransaction commit];
      }
    }
    CALayer *mask = self.shellBandMask;
    if (chromeContent == nil && mask != nil) {
      // Layer space = bounds space = contentOffset-tracked: screen y Y lives
      // at layer y (τ + Y). The band bottom is sheetTop + chromeHeight.
      const CGRect b = scrollView.bounds;
      const CGRect next = CGRectMake(0,
                                     tau + sheetTop + self.shellChromeHeight,
                                     CGRectGetWidth(b),
                                     CGRectGetHeight(b) * 6.0);
      if (!CGRectEqualToRect(mask.frame, next)) {
        [CATransaction begin];
        [CATransaction setDisableActions:YES];
        mask.frame = next;
        [CATransaction commit];
      }
    }
  }
  // THE PIN: zero-lag, same frame as the offset. translate = max(0, τ − H).
  // THE PIN, DERIVED. The chrome sits at content y = H, so its natural screen
  // y is expandedTop + H − τ while the sheet's edge is
  // expandedTop + max(0, (H+σ) − τ) − tug. The pin is the difference:
  //     pin = σ + max(0, τ − (H+σ)) − tug
  // Below the boundary it holds the chrome σ down (the stash); above it the
  // chrome sticks at the edge while rows scroll under; during an overshoot it
  // rides the tug so chrome and rows travel as one body.
  UIView *chrome = self.pinnedChromeView;
  if (chrome != nil && self.chromeContentView != nil && self.shellEnabled) {
    const CGFloat tauNow = scrollView.contentOffset.y;
    const CGFloat boundary = self.shellTrackH + self.stashSigma;
    const CGFloat tugNow =
        (self.postureOvershootActive && tauNow > boundary) ? (tauNow - boundary) : 0.0;
    const CGFloat hold = self.stashSigma + MAX(0.0, tauNow - boundary) - tugNow;
    const CGAffineTransform next = CGAffineTransformMakeTranslation(0, hold);
    if ([chrome isKindOfClass:[TrackShellSlotView class]]) {
      [(TrackShellSlotView *)chrome trackApplyTransform:next];
    } else if (!CGAffineTransformEqualToTransform(chrome.transform, next)) {
      chrome.transform = next;
    }
  } else if (chrome != nil && edge >= 0) {
    const CGFloat hold = MAX(0.0, scrollView.contentOffset.y - edge);
    const CGAffineTransform next = CGAffineTransformMakeTranslation(0, hold);
    if (!CGAffineTransformEqualToTransform(chrome.transform, next)) {
      chrome.transform = next;
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
  return @[ @"trackTopArrival", @"trackSigmaChanged", @"trackShellWarning" ];
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
    proxy.ballisticEdge = edge != nil ? edge.doubleValue : -1;
    proxy.snapRegionEnd = regionEnd != nil ? regionEnd.doubleValue : -1;
    proxy.snapOffsets = config[@"snapOffsets"] ?: @[];
    __weak typeof(self) sigmaWeakSelf = self;
    proxy.onSigmaChanged = ^(CGFloat sigma) {
      [sigmaWeakSelf sendEventWithName:@"trackSigmaChanged" body:@{ @"sigma": @(sigma) }];
    };
    // OWNERSHIP TRANSFERS ONLY ON A SWITCH — with ONE exception: BOOT.
    // Attach must not STEAL the register (it runs before the switch
    // transaction, while the incoming leg still holds its PARKED offset; one
    // stray KVO tick then overwrote the carried posture — the measured
    // collapsed->expanded teleport). But if NOBODY owns it yet, the first
    // attached leg must claim it, or the register never tracks the boot
    // scene's τ and the first switch carries posture 0 (= collapsed): the
    // owner's "polls slides up from the bottom".
    if (gTrackPostureOwner == nil || gTrackPostureOwner.window == nil) {
      gTrackPostureOwner = scrollView;
    }
    resolve(@(YES));
  }];
}

// Programmatic settle: drive the SAME critically damped native spring the
// physics uses for detents/rubber — scene-switch snaps feel identical to
// gesture-born settles (and JS-side scrollToOffset through animated wrappers
// proved unreliable).
// (short-circuit lives inside snapTo's UI block below)
RCT_EXPORT_METHOD(snapTo:(nonnull NSNumber *)reactTag
                  offset:(nonnull NSNumber *)offset)
{
  [self.bridge.uiManager addUIBlock:^(RCTUIManager *uiManager, NSDictionary<NSNumber *, UIView *> *viewRegistry) {
    UIView *root = viewRegistry[reactTag] ?: [uiManager viewForReactTag:reactTag];
    UIScrollView *scrollView = root ? TrackFindScrollView(root) : nil;
    if (scrollView == nil) {
      return;
    }
    // THE SHORT-CIRCUIT (ported from the old snap runtime): a seat within
    // 0.5pt of the current τ commands NOTHING — a same-posture switch is
    // provably zero pixels, never a spring that "confirms" the position.
    TrackScrollDelegateProxy *proxy = objc_getAssociatedObject(scrollView, kTrackProxyKey);
    // snapTo input is POSTURE-space: σ shifts it into τ-space.
    const CGFloat sigma = proxy != nil ? proxy.stashSigma : 0;
    const CGFloat target = offset.doubleValue + sigma;
    if (fabs(scrollView.contentOffset.y - target) < 0.5) {
      return;
    }
    if (proxy == nil) {
      [scrollView setContentOffset:CGPointMake(scrollView.contentOffset.x, target)
                          animated:YES];
      return;
    }
    dispatch_async(dispatch_get_main_queue(), ^{
      [proxy startSpringOn:scrollView
                  toTarget:target
                     fromY:scrollView.contentOffset.y
                 velocityY:0];
    });
  }];
}

// Header-grab drag channel: direct offset write (non-animated), for the JS
// header pan whose worklet scrollTo proved inert on the recycler's scroll view.
// THE RE-FUSE (XII red team 3): the switch formula's target is computed HERE,
// with FRESH τ/σ read inside the UI block -- the JS mirrors lag the UI thread
// (σ by an event hop), and a stale-computed target was the silently-wrong
// write. JS passes only the incoming scene's restore scroll; posture carries.
RCT_EXPORT_METHOD(refuse:(nonnull NSNumber *)reactTag
                  restore:(nonnull NSNumber *)restore)
{
  [self.bridge.uiManager addUIBlock:^(RCTUIManager *uiManager, NSDictionary<NSNumber *, UIView *> *viewRegistry) {
    UIView *root = viewRegistry[reactTag] ?: [uiManager viewForReactTag:reactTag];
    UIScrollView *scrollView = root ? TrackFindScrollView(root) : nil;
    if (scrollView == nil) {
      return;
    }
    TrackScrollDelegateProxy *proxy = objc_getAssociatedObject(scrollView, kTrackProxyKey);
    if (proxy == nil) {
      return;
    }
    // THE FINGER OWNS TAU (attributed live, 2026-08-01). refuse() is the SWITCH
    // formula — a switch-time operation. It was firing DURING a drag (FlashList
    // re-renders while you scroll, its ref fires, the engine re-attaches, and
    // the attach subscriber replayed a stale pending restore), which wiped the
    // stash sigma and yanked tau: the owner's "the scroll jumps to the top when
    // I drag the sheet down". No scene changed; nothing had the right to move
    // the track. While the user is touching it, this is a no-op — the same law
    // that already makes a seat yield to the thumb.
    if (scrollView.isTracking || scrollView.isDragging) {
      return;
    }
    const CGFloat tau = scrollView.contentOffset.y;
    const CGFloat trackH = proxy.shellTrackH;
    // THE POSTURE REGISTER READ: the incoming leg's own τ is NOT the sheet's
    // posture (a fresh leg sits at 0; a revisited leg holds its stale parked
    // offset). The register carries the ONE posture across the flip; this
    // view becomes the register's owner from here on.
    const CGFloat posture = trackH > 0 ? MIN(gTrackPostureRegister, trackH) : gTrackPostureRegister;
    gTrackPostureOwner = scrollView;
    const CGFloat target = posture + restore.doubleValue;
    if (proxy.stashSigma != 0) {
      proxy.stashSigma = 0;
      if (proxy.onSigmaChanged) {
        proxy.onSigmaChanged(0);
      }
    }
    // (No switch-time inset floor here. It was added on a WRONG attribution —
    // that the KVO prior-grow guard did not cover the child-page content
    // swap. A/B with the floor disabled proved the guard fires and tau holds:
    //   [GUARD] PRIOR tau=647.7 contentH=3744.3 inset=0.0
    //   [GUARD] AFTER tau=647.7 contentH=1430.0 inset=1434.0
    // One guard, one place. A second writer of the same inset would have been
    // a new bug class, and an inflated inset that no contentSize change came
    // to tighten would let the sheet scroll into a void.)
    if (fabs(tau - target) > 0.5) {
      [scrollView setContentOffset:CGPointMake(scrollView.contentOffset.x, target) animated:NO];
    }
  }];
}

// setOffset is τ-SPACE and RESETS σ: callers (the switch formula) re-fuse
// posture+scroll into one absolute offset, so any standing stash is stale.
RCT_EXPORT_METHOD(setOffset:(nonnull NSNumber *)reactTag
                  offset:(nonnull NSNumber *)offset)
{
  [self.bridge.uiManager addUIBlock:^(RCTUIManager *uiManager, NSDictionary<NSNumber *, UIView *> *viewRegistry) {
    UIView *root = viewRegistry[reactTag] ?: [uiManager viewForReactTag:reactTag];
    UIScrollView *scrollView = root ? TrackFindScrollView(root) : nil;
    if (scrollView == nil) {
      return;
    }
    TrackScrollDelegateProxy *fuseProxy = objc_getAssociatedObject(scrollView, kTrackProxyKey);
    if (fuseProxy != nil && fuseProxy.stashSigma != 0) {
      fuseProxy.stashSigma = 0;
      if (fuseProxy.onSigmaChanged) {
        fuseProxy.onSigmaChanged(0);
      }
    }
    // SYNCHRONOUS with this UI block (the switch formula's re-fuse): an extra
    // dispatch hop let the freshly swapped content render one frame at the
    // OLD deep tau — the owner's "content floating up in the sky" flash.
    [scrollView setContentOffset:CGPointMake(scrollView.contentOffset.x, offset.doubleValue)
                        animated:NO];
  }];
}

// ─── THE SWITCH TRANSACTION (atomic switch, 2026-08-01) ─────────────────────
// One CATransaction: seed the incoming leg's offset from the posture register,
// re-aim every shell layer, kill live springs, and flip leg visibility — no
// frame can exist where two painted copies of the sheet disagree. A switch to
// a not-yet-registered leg PENDS natively and executes inside the leg slot's
// own registering transaction: the leg's first painted frame is already
// seeded and visible.
static NSString *gTrackPendingSwitchKey = nil;
static double gTrackPendingSwitchRestore = 0;
static double gTrackPendingSwitchChromeH = 0;

/// THE LEG MUST BE LIVE INSIDE THE TRANSACTION (measured 2026-08-01): a fresh
/// leg's engine proxy is installed by the JS attach path, which lands AFTER the
/// switch. Until then that leg's scroll view has NO delegate proxy — so when
/// the seat spring animated its contentOffset, no didScroll ran the shell
/// writer: the rows rose while frost/chrome/tail stayed parked at the old
/// sheetTop (the owner's "header stranded at the bottom"). The transaction now
/// ADOPTS the incoming scroll view — proxy installed, ballistic config
/// inherited from the outgoing leg, shell wired from the config mirrors — so
/// the leg drives the shell from its very first animated frame. The later JS
/// attach/bindShell then merely re-assert.
static TrackScrollDelegateProxy *TrackAdoptScrollView(UIScrollView *scrollView, double chromeH)
{
  TrackScrollDelegateProxy *proxy = objc_getAssociatedObject(scrollView, kTrackProxyKey);
  TrackScrollDelegateProxy *donor =
      gTrackPostureOwner != nil && gTrackPostureOwner != scrollView
          ? objc_getAssociatedObject(gTrackPostureOwner, kTrackProxyKey)
          : nil;
  if (proxy == nil) {
    proxy = [TrackScrollDelegateProxy new];
    proxy.original = scrollView.delegate;
    objc_setAssociatedObject(scrollView, kTrackProxyKey, proxy, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    scrollView.delegate = proxy;
    [proxy beginObservingDelegateOf:scrollView];
  } else if (scrollView.delegate != proxy) {
    proxy.original = scrollView.delegate;
    scrollView.delegate = proxy;
  }
  // Physics config is a property of the SHEET, not of a leg: inherit it so an
  // adopted leg has the same ballistic wall and detents from frame one.
  if (donor != nil) {
    if (proxy.ballisticEdge <= 0) {
      proxy.ballisticEdge = donor.ballisticEdge;
    }
    if (proxy.snapRegionEnd <= 0) {
      proxy.snapRegionEnd = donor.snapRegionEnd;
    }
    if (proxy.snapOffsets.count == 0) {
      proxy.snapOffsets = donor.snapOffsets;
    }
    if (proxy.onTopArrival == nil) {
      proxy.onTopArrival = donor.onTopArrival;
    }
    if (proxy.onSigmaChanged == nil) {
      proxy.onSigmaChanged = donor.onSigmaChanged;
    }
  }
  if (!proxy.shellEnabled && gTrackShellTrackH > 0) {
    proxy.shellExpandedTop = gTrackShellExpandedTop;
    proxy.shellTrackH = gTrackShellTrackH;
    proxy.shellChromeHeight = chromeH;
    if (proxy.chromeContentView == nil) {
      if (proxy.shellBandMask == nil) {
        CALayer *mask = [CALayer layer];
        mask.backgroundColor = [UIColor blackColor].CGColor;
        proxy.shellBandMask = mask;
        scrollView.layer.mask = mask;
      } else if (scrollView.layer.mask != proxy.shellBandMask) {
        scrollView.layer.mask = proxy.shellBandMask;
      }
    }
    proxy.hostScrollView = scrollView;
    proxy.shellEnabled = YES;
  }
  return proxy;
}

static void TrackExecuteSwitch(NSString *legKey, double restore, double chromeH)
{
  TrackLegRegistry *legs = [TrackLegRegistry shared];
  TrackLegSlotView *rows = [legs viewForKey:legKey kind:@"rows"];
  UIScrollView *scrollView = rows != nil ? TrackFindScrollView(rows) : nil;
  if (scrollView == nil) {
    gTrackPendingSwitchKey = [legKey copy];
    gTrackPendingSwitchRestore = restore;
    gTrackPendingSwitchChromeH = chromeH;
    return;
  }
  gTrackPendingSwitchKey = nil;
  // Springs die inside the transaction: a snap launched mid-switch may not
  // animate a position this transaction is about to define.
  UIScrollView *oldOwner = gTrackPostureOwner;
  if (oldOwner != nil && oldOwner != scrollView) {
    TrackScrollDelegateProxy *oldProxy = objc_getAssociatedObject(oldOwner, kTrackProxyKey);
    [oldProxy stopSpring];
  }
  TrackScrollDelegateProxy *proxy = TrackAdoptScrollView(scrollView, chromeH);
  [proxy stopSpring];
  if (proxy != nil) {
    if (proxy.stashSigma != 0) {
      proxy.stashSigma = 0;
      if (proxy.onSigmaChanged) {
        proxy.onSigmaChanged(0);
      }
    }
    proxy.shellChromeHeight = chromeH;
  }
  proxy.shellChromeHeight = chromeH;
  // THE RANGE LAW RUNS FIRST (measured: lists->profile landed BETWEEN detents).
  // UIKit clamps contentOffset to contentH + insetBottom - viewport at write
  // time. Seeding the carried posture before the incoming leg's reachability
  // inset exists let UIKit clamp the write to wherever that leg's content
  // happened to end — a landing at no snap point at all, and (because it is a
  // clamp, not a spring) an instant one. Every posture must be REACHABLE
  // before the offset is written.
  [proxy applyRangeLawTo:scrollView];
  const CGFloat trackH = proxy != nil && proxy.shellTrackH > 0 ? proxy.shellTrackH : gTrackShellTrackH;
  const CGFloat posture = trackH > 0 ? MIN(gTrackPostureRegister, trackH) : gTrackPostureRegister;
  const CGFloat target = posture + restore;
  gTrackPostureOwner = scrollView;
  if (fabs(scrollView.contentOffset.y - target) > 0.5) {
    [scrollView setContentOffset:CGPointMake(scrollView.contentOffset.x, target) animated:NO];
  }
  // Re-aim the shell NOW, in this transaction — setContentOffset with an
  // unchanged value fires no didScroll, and a fresh leg has no proxy at all.
  if (proxy != nil && proxy.shellEnabled) {
    [proxy scrollViewDidScroll:scrollView];
  } else {
    const CGFloat expandedTop = gTrackShellExpandedTop;
    const CGFloat sheetTop = expandedTop + MAX(0.0, trackH - target);
    gTrackCarveSheetTop = sheetTop;
    TrackShellRegistry *registry = [TrackShellRegistry shared];
    const CGAffineTransform t = CGAffineTransformMakeTranslation(0, sheetTop);
    [[registry viewForRole:@"frost"] trackApplyTransform:t];
    [[registry viewForRole:@"chrome"] trackApplyTransform:t];
    const CGFloat contentEnd = scrollView.contentSize.height - target;
    [[registry viewForRole:@"tail"]
        trackApplyTransform:CGAffineTransformMakeTranslation(0, MAX(sheetTop, contentEnd))];
  }
  [legs applyAlphasForPresentedKey:legKey];
}

RCT_EXPORT_METHOD(switchTo:(nonnull NSString *)legKey
                  restore:(nonnull NSNumber *)restore
                  chromeHeight:(nonnull NSNumber *)chromeHeight)
{
  [self.bridge.uiManager addUIBlock:^(RCTUIManager *uiManager, NSDictionary<NSNumber *, UIView *> *viewRegistry) {
    TrackLegRegistry *legs = [TrackLegRegistry shared];
    if (legs.onLegRegistered == nil) {
      legs.onLegRegistered = ^(TrackLegSlotView *view) {
        if (gTrackPendingSwitchKey != nil && [view.legKind isEqualToString:@"rows"] &&
            [view.legKey isEqualToString:gTrackPendingSwitchKey]) {
          TrackExecuteSwitch(gTrackPendingSwitchKey, gTrackPendingSwitchRestore,
                             gTrackPendingSwitchChromeH);
        }
      };
    }
    TrackExecuteSwitch(legKey, restore.doubleValue, chromeHeight.doubleValue);
  }];
}

// DEV AUDIT: who owns the touch at (x,y)? Walks hitTest from the key window
// and returns the resolved view's class + ancestor chain (accessibility ids
// where present) so a touch thief can be NAMED, not guessed.
RCT_EXPORT_METHOD(auditHit:(nonnull NSNumber *)x
                  y:(nonnull NSNumber *)y
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    UIWindow *window = nil;
    for (UIScene *scene in UIApplication.sharedApplication.connectedScenes) {
      if ([scene isKindOfClass:[UIWindowScene class]]) {
        for (UIWindow *w in ((UIWindowScene *)scene).windows) {
          if (w.isKeyWindow) { window = w; break; }
        }
      }
      if (window != nil) { break; }
    }
    if (window == nil) {
      reject(@"no_window", @"no key window", nil);
      return;
    }
    CGPoint p = CGPointMake(x.doubleValue, y.doubleValue);
    UIView *hit = [window hitTest:p withEvent:nil];
    NSMutableArray<NSString *> *chain = [NSMutableArray array];
    UIView *v = hit;
    int depth = 0;
    while (v != nil && depth < 24) {
      NSString *name = NSStringFromClass(v.class);
      NSString *nid = v.accessibilityIdentifier ?: v.nativeID;
      [chain addObject:nid.length > 0 ? [NSString stringWithFormat:@"%@(%@)", name, nid] : name];
      v = v.superview;
      depth++;
    }
    resolve(@{ @"hit": hit ? NSStringFromClass(hit.class) : @"nil",
               @"legs": [[TrackLegRegistry shared] auditLegs],
               @"presentedKey": [TrackLegRegistry shared].presentedKey ?: @"nil",
               @"frame": hit ? NSStringFromCGRect([hit convertRect:hit.bounds toView:nil]) : @"",
               @"chain": chain,
               @"carveTop": @(gTrackCarveSheetTop) });
  });
}

// Register the chrome view to pin (pass chromeTag = nil to clear).
RCT_EXPORT_METHOD(pinChrome:(nonnull NSNumber *)reactTag
                  chromeTag:(nullable NSNumber *)chromeTag)
{
  [self.bridge.uiManager addUIBlock:^(RCTUIManager *uiManager, NSDictionary<NSNumber *, UIView *> *viewRegistry) {
    UIView *root = viewRegistry[reactTag] ?: [uiManager viewForReactTag:reactTag];
    UIScrollView *scrollView = root ? TrackFindScrollView(root) : nil;
    if (scrollView == nil) {
      return;
    }
    TrackScrollDelegateProxy *proxy = objc_getAssociatedObject(scrollView, kTrackProxyKey);
    if (proxy == nil) {
      return;
    }
    if (chromeTag == nil) {
      proxy.pinnedChromeView.transform = CGAffineTransformIdentity;
      proxy.pinnedChromeView = nil;
      return;
    }
    UIView *chrome = viewRegistry[chromeTag] ?: [uiManager viewForReactTag:chromeTag];
    proxy.pinnedChromeView = chrome;
  }];
}

// ── THE τ-INVARIANCE LAW (transition jank, 2026-07-29) ──────────────────────
// A scene switch swaps CONTENT; it must never move the SHEET. But in ONE TRACK
// the content height bounds τ's legal range (maxOffset = contentH + insetBottom
// − viewport), so the instant a swap mounts a shorter body UIKit clamps τ down
// — the owner's "snaps to a weird mid-high", the jerk, the non-persistent feel.
// JS cannot fix this (it reacts a frame after the clamp). The guard runs
// SYNCHRONOUSLY with the contentSize change: grow contentInset.bottom so the
// current τ stays legal. Grow-only — the JS reachability inset owns the
// baseline; the guard only ever adds headroom, and only when needed.
// ── bindShell: the one configuration call for the native shell ──────────────
// Tags are RN views (RN owns their pixels); native takes over their transforms.
// Idempotent and re-assertable (refs fire child-first; Fabric remounts) — every
// call simply re-resolves the views and re-applies the current frame.
RCT_EXPORT_METHOD(bindShell:(nonnull NSNumber *)reactTag
                  config:(NSDictionary *)config)
{
  __weak typeof(self) weakSelf2 = self;
  [self.bridge.uiManager addUIBlock:^(RCTUIManager *uiManager, NSDictionary<NSNumber *, UIView *> *viewRegistry) {
    UIView *root = viewRegistry[reactTag] ?: [uiManager viewForReactTag:reactTag];
    UIScrollView *scrollView = root ? TrackFindScrollView(root) : nil;
    if (scrollView == nil) {
      return;
    }
    TrackScrollDelegateProxy *proxy = objc_getAssociatedObject(scrollView, kTrackProxyKey);
    if (proxy == nil) {
      return;
    }
    // JS null crosses the bridge as NSNull, NOT nil — feeding it to
    // viewForReactTag: is a doesNotRecognizeSelector crash (hit live 2026-07-29).
    UIView *(^resolve)(id) = ^UIView *(id tag) {
      if (![tag isKindOfClass:[NSNumber class]]) {
        return nil;
      }
      return viewRegistry[(NSNumber *)tag] ?: [uiManager viewForReactTag:(NSNumber *)tag];
    };
    proxy.shellFrostView = resolve(config[@"frostTag"]);
    proxy.shellTailView = resolve(config[@"tailTag"]);
    proxy.shellChromeView = resolve(config[@"chromeTag"]);
    // THE NIL-ASSERT (XII red team 3): a chrome tag that fails to resolve
    // means the shell never transforms that view -- the header parks at the
    // screen top with no error anywhere. Bark loudly instead of silently.
    if (config[@"chromeTag"] != nil && ![config[@"chromeTag"] isKindOfClass:[NSNull class]] &&
        proxy.shellChromeView == nil) {
      [weakSelf2 sendEventWithName:@"trackShellWarning"
                              body:@{ @"part": @"chrome", @"tag": config[@"chromeTag"] }];
    }
    proxy.shellExpandedTop = [config[@"expandedTop"] doubleValue];
    proxy.shellTrackH = [config[@"trackH"] doubleValue];
    gTrackShellExpandedTop = proxy.shellExpandedTop;
    gTrackShellTrackH = proxy.shellTrackH;
    proxy.shellChromeHeight = [config[@"chromeHeight"] doubleValue];
    proxy.chromeContentView = resolve(config[@"chromeContentTag"]);
    proxy.leaderView = resolve(config[@"leaderTag"]);
    if (proxy.chromeContentView != nil) {
      // THE ROWS OWN THE MASK NOW. Clear any scroll-view mask this proxy
      // installed in the other mode — leaving it is what clipped the chrome.
      if (scrollView.layer.mask != nil) {
        scrollView.layer.mask = nil;
      }
    } else if (proxy.shellBandMask == nil) {
      CALayer *mask = [CALayer layer];
      mask.backgroundColor = [UIColor blackColor].CGColor;
      proxy.shellBandMask = mask;
      scrollView.layer.mask = mask;
    } else if (scrollView.layer.mask != proxy.shellBandMask) {
      scrollView.layer.mask = proxy.shellBandMask;
    }
    proxy.shellEnabled = YES;
    proxy.hostScrollView = scrollView;
    __weak TrackScrollDelegateProxy *weakProxy = proxy;
    [TrackShellRegistry shared].onSlotsChanged = ^{
      TrackScrollDelegateProxy *strongProxy = weakProxy;
      UIScrollView *host = strongProxy.hostScrollView;
      if (strongProxy != nil && host != nil) {
        [strongProxy scrollViewDidScroll:host];
      }
    };
    if (!proxy.clampGuardInstalled) {
      proxy.clampGuardInstalled = YES;
      [scrollView addObserver:(id)proxy
                   forKeyPath:@"contentSize"
                      options:NSKeyValueObservingOptionNew | NSKeyValueObservingOptionPrior
                      context:kTrackClampGuardCtx];
    }
    // Apply the current frame immediately — don't wait for the next scroll.
    if ([proxy respondsToSelector:@selector(scrollViewDidScroll:)]) {
      [proxy scrollViewDidScroll:scrollView];
    }
  }];
}

// THE SHELL AUDIT (P10, 2026-07-31): Fabric's measureInWindow answers from
// the SHADOW TREE — it is blind to transforms written natively behind React's
// back, so a JS probe of shell views reports layout fiction (barked y=0 while
// the screen was correct). Truth lives in UIKit: resolve the proxy's actual
// views and convert their PRESENTATION positions to window space.
RCT_EXPORT_METHOD(auditShell:(nonnull NSNumber *)reactTag
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  [self.bridge.uiManager addUIBlock:^(RCTUIManager *uiManager, NSDictionary<NSNumber *, UIView *> *viewRegistry) {
    UIView *root = viewRegistry[reactTag] ?: [uiManager viewForReactTag:reactTag];
    UIScrollView *scrollView = root ? TrackFindScrollView(root) : nil;
    TrackScrollDelegateProxy *proxy = scrollView ? objc_getAssociatedObject(scrollView, kTrackProxyKey) : nil;
    if (proxy == nil) {
      resolve(@{ @"ok": @NO, @"reason": @"no-proxy" });
      return;
    }
    const CGFloat tau = scrollView.contentOffset.y;
    const CGFloat sheetTop = proxy.shellExpandedTop + MAX(0.0, (proxy.shellTrackH + proxy.stashSigma) - tau);
    NSMutableDictionary *body = [NSMutableDictionary dictionary];
    body[@"ok"] = @YES;
    body[@"tau"] = @(tau);
    body[@"sigma"] = @(proxy.stashSigma);
    body[@"expectedSheetTop"] = @(sheetTop);
    TrackShellSlotView *chromeSlotAudit = [[TrackShellRegistry shared] viewForRole:@"chrome"];
    body[@"chromeIsSlot"] = @(chromeSlotAudit != nil);
    body[@"frostIsSlot"] = @([[TrackShellRegistry shared] viewForRole:@"frost"] != nil);
    body[@"tailIsSlot"] = @([[TrackShellRegistry shared] viewForRole:@"tail"] != nil);
    TrackShellSlotView *tailSlotAudit = [[TrackShellRegistry shared] viewForRole:@"tail"];
    if (tailSlotAudit != nil) {
      body[@"tailTY"] = @(tailSlotAudit.transform.ty);
    }
    TrackShellSlotView *frostSlotAudit = [[TrackShellRegistry shared] viewForRole:@"frost"];
    if (frostSlotAudit != nil) {
      body[@"frostTY"] = @(frostSlotAudit.transform.ty);
    }
    body[@"shellEnabled"] = @(proxy.shellEnabled);
    if (chromeSlotAudit != nil) {
      body[@"slotTransformTY"] = @(chromeSlotAudit.transform.ty);
      body[@"slotWindow"] = @(chromeSlotAudit.window != nil);
    }
    // The chrome is CONTENT now: audit the PINNED view, whose window y must be
    // the sheet's top edge. "Bound to the shell" is the wrong question.
    UIView *chrome = proxy.pinnedChromeView ?: (chromeSlotAudit ?: proxy.shellChromeView);
    body[@"chromeBound"] = @(chrome != nil);
    if (chrome != nil) {
      body[@"chromeAttached"] = @(chrome.window != nil);
      const CGPoint origin = [chrome convertPoint:CGPointZero toView:nil];
      body[@"chromeWindowY"] = @(origin.y);
    }
    UIView *frost = proxy.shellFrostView;
    body[@"frostBound"] = @(frost != nil);
    if (frost != nil) {
      body[@"frostWindowY"] = @([frost convertPoint:CGPointZero toView:nil].y);
    }
    TrackShellSlotView *chainSlot = [[TrackShellRegistry shared] viewForRole:@"chrome"];
    if (chainSlot != nil) {
      NSMutableArray *chain = [NSMutableArray array];
      UIView *cursor = chainSlot;
      int hops = 0;
      while (cursor != nil && hops < 10) {
        [chain addObject:[NSString stringWithFormat:@"%@ fy=%.0f ty=%.0f",
                          NSStringFromClass(cursor.class), cursor.frame.origin.y,
                          cursor.transform.ty]];
        cursor = cursor.superview;
        hops++;
      }
      body[@"chromeChain"] = chain;
    }
    // THE COVERAGE WALK: name every view that covers a probe point in the
    // map band, deepest-first — the instrument answers "WHAT is the white
    // thing" instead of us guessing layer by layer.
    UIWindow *window = scrollView.window;
    if (window != nil) {
      const CGPoint probe = CGPointMake(200, 400);
      NSMutableArray *coverage = [NSMutableArray array];
      void (^__block walk)(UIView *, int) = nil;
      void (^walkImpl)(UIView *, int);
      __block __weak void (^weakWalk)(UIView *, int) = nil;
      walkImpl = ^(UIView *view, int depth) {
        if (view.hidden || view.alpha < 0.01 || depth > 24) {
          return;
        }
        const CGRect frameInWindow = [view convertRect:view.bounds toView:nil];
        if (CGRectContainsPoint(frameInWindow, probe)) {
          UIColor *bg = view.backgroundColor;
          CGFloat white = -1, alpha = -1;
          if (bg != nil) {
            [bg getWhite:&white alpha:&alpha];
          }
          if ((bg != nil && alpha > 0.9) || [view isKindOfClass:[UIVisualEffectView class]]) {
            [coverage addObject:[NSString stringWithFormat:@"%@ y=%.0f h=%.0f w=%.2f a=%.2f",
                                 NSStringFromClass(view.class),
                                 frameInWindow.origin.y, frameInWindow.size.height, white, alpha]];
          }
        }
        for (UIView *sub in view.subviews) {
          void (^strongWalk)(UIView *, int) = weakWalk;
          if (strongWalk) {
            strongWalk(sub, depth + 1);
          }
        }
      };
      walk = walkImpl;
      weakWalk = walk;
      walk(window, 0);
      body[@"coverage"] = coverage;
    }
    resolve(body);
  }];
}

RCT_EXPORT_METHOD(detach:(nonnull NSNumber *)reactTag)
{
  [self.bridge.uiManager addUIBlock:^(RCTUIManager *uiManager, NSDictionary<NSNumber *, UIView *> *viewRegistry) {
    // (clamp-guard KVO removed below with the proxy — leak fixed 2026-07-29)
    UIView *root = viewRegistry[reactTag] ?: [uiManager viewForReactTag:reactTag];
    UIScrollView *scrollView = root ? TrackFindScrollView(root) : nil;
    if (scrollView == nil) {
      return;
    }
    TrackScrollDelegateProxy *proxy = objc_getAssociatedObject(scrollView, kTrackProxyKey);
    if (proxy != nil) {
      [proxy endObservingDelegateOf:scrollView];
      if (proxy.clampGuardInstalled) {
        @try {
          [scrollView removeObserver:(id)proxy forKeyPath:@"contentSize" context:kTrackClampGuardCtx];
        } @catch (__unused NSException *e) {
        }
        proxy.clampGuardInstalled = NO;
      }
      scrollView.delegate = proxy.original;
      objc_setAssociatedObject(scrollView, kTrackProxyKey, nil, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    }
  }];
}

@end
