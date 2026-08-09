#import "TrackScrollPhysics.h"
#import "TrackDomainRange.h"
#import "TrackEngineFacts.h"
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
/// ── THE LEGITIMACY FILTER (2026-08-02) ──────────────────────────────────────
/// The one-number fusion (sheet travel IS contentOffset) is the foundation:
/// it is what makes the handoff seamless and lets scroll momentum carry into
/// the sheet. Its price is that UIKit co-owns the number — it clamps
/// contentOffset synchronously when content/insets/bounds change, and every
/// jerk this arc has chased was one of those clamps escaping a per-path
/// guard. The filter states the law ONCE instead: τ may only change under a
/// finger, momentum, a live spring, or an explicit engine write. Any other
/// change is reverted inside the same transaction — before paint — and barks,
/// so a missed prevention path becomes a logged non-event instead of a jerk.
@property (nonatomic, assign) CGFloat lastLegitimateTau;
@property (nonatomic, assign) NSInteger engineWriteDepth;
/// ── THE DOMAIN AUTHORITY's two pieces of proxy state ─────────────────────────
/// The bottom inset an owner OUTSIDE the engine needs (keyboard avoidance, a
/// reachability baseline). REGISTERED through setExternalBottomInset, never
/// inferred from the current inset — an inferred baseline would read the
/// engine's own last write back as an external need and ratchet forever. The
/// authority composes it with max(); it is the only way anything other than the
/// authority influences contentInset.bottom.
@property (nonatomic, assign) CGFloat externalBottomInset;
/// Applying insets can re-enter didScroll synchronously (that is the whole
/// reason the clamp class exists); the authority is not re-entrant and does not
/// need to be — the inputs it reads are already committed when it runs.
@property (nonatomic, assign) BOOL applyingDomain;
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
/// ── THE HIDDEN EXCURSION (G-HIDDEN, R4 / amendment A1) ──────────────────────
/// The SECOND motion primitive: τ-DOMAIN EXTENSION below collapsed. Every
/// derivation (sheetTop, frost, tail, pin, masks) is already linear for τ < 0
/// — sheetTop = expandedTop + (H+σ−τ) keeps growing past the screen edge — so
/// the sheet leaves the screen on the SAME spring, same variable, same writer.
/// The only blocker was UIScrollView's domain floor (offset ≥ −contentInset
/// .top): while an excursion is engaged, contentInset.top = |target| extends
/// the domain; it collapses back to 0 when τ returns to ≥ 0 at rest. The
/// finger still owns τ throughout (a touch mid-excursion kills the spring and
/// drags the same track).
@property (nonatomic, assign) BOOL hiddenEngaged;
/// τ-space excursion target (negative). Meaningful only while hiddenEngaged.
@property (nonatomic, assign) CGFloat hiddenTargetTau;
/// One-shot per excursion: the screen-edge fact (τ reached the target).
@property (nonatomic, assign) BOOL hiddenEdgeFired;
/// Monotonic excursion counter — every hidden arm mints a new generation and
/// the edge event carries it, so a consumer that armed generation N can
/// reject an edge born of any other excursion (a stale hiddenTargetTau must
/// never read as a real boundary).
@property (nonatomic, assign) NSInteger hiddenGeneration;
/// Fires the frame the sheet clears the screen edge — the deferred content
/// swap (A2) and the hide's settle both key on it. Carries the generation of
/// the excursion whose edge this is.
@property (nonatomic, copy) void (^onHiddenEdgeCleared)(NSInteger generation);
/// ── THE SETTLE FACT (deep red team item 5 / abstraction finding 5) ──────────
/// The engine knows the frame motion ENDS — the spring's closed form completes,
/// UIKit's deceleration ends, a drag lifts with no deceleration behind it. JS
/// used to INFER it by sampling τ for stability near a detent, which could not
/// see a rest that was not on a detent (a hidden rest, a clamped rest, a park
/// between detents) and suppressed a return to the SAME detent to avoid
/// re-firing. The engine states the fact instead, ONCE per motion episode.
///
/// The episode is what makes "once" expressible: every motion START (drag
/// begin, spring start) mints a generation and arms the pending flag; the first
/// end-of-motion callback to arrive consumes it. A second callback for the same
/// episode (didEndDecelerating chasing a spring that already reported) finds
/// the flag down and says nothing — the same one-shot discipline the excursion
/// edge uses, for the same reason.
@property (nonatomic, assign) NSInteger settleGeneration;
@property (nonatomic, assign) BOOL settlePending;
/// Carries the whole rest fact: identity, resting τ/posture, and whether that
/// rest is at a detent (DATA in the fact — never a gate on emitting it).
@property (nonatomic, copy) void (^onSettled)(NSDictionary *body);
/// Host scroll view (weak): lets slot registration ping a synchronous shell
/// re-apply so a freshly recreated slot is positioned in the SAME UIKit
/// transaction it appears in (the flash becomes unwritable).
@property (nonatomic, weak) UIScrollView *hostScrollView;
- (void)armMotionEpisode;
- (void)reportSettleOn:(UIScrollView *)scrollView cause:(NSString *)cause;
- (void)startSpringOn:(UIScrollView *)scrollView
             toTarget:(double)target
                fromY:(double)y0
            velocityY:(double)v0;
- (void)stopSpring;
- (void)closeHiddenExcursionOn:(UIScrollView *)scrollView;
- (void)applyDomainTo:(UIScrollView *)scrollView;
- (void)applyDomainTo:(UIScrollView *)scrollView
                phase:(TrackDomainPhase)phase
                  tau:(CGFloat)tau;
- (void)engineWrite:(UIScrollView *)scrollView offsetY:(CGFloat)offsetY;
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
/// THE PIXEL-GRID LAW (ported from the old system, 2026-08-02). The old one
/// writer rounded its translate to the pixel grid — its comment: it "keeps the
/// chrome from shimmering sub-pixel against the body". Our native writers
/// applied RAW FLOATS (transforms bypass UIKit pixel snapping), so any two
/// edges — one snapped, one not — stepped past each other per frame: the
/// owner's gap that WIGGLES when the sheet moves. Every native position
/// writer snaps here, so all edges land on the same grid and move in the
/// same steps.
static CGFloat TrackPixelSnap(CGFloat value)
{
  static CGFloat scale = 0;
  if (scale <= 0) {
    scale = UIScreen.mainScreen.scale > 0 ? UIScreen.mainScreen.scale : 3.0;
  }
  return round(value * scale) / scale;
}

static CGFloat gTrackPostureRegister = 0;
static __weak UIScrollView *gTrackPostureOwner = nil;
/// Geometry mirror for THE SWITCH TRANSACTION: a fresh leg has no proxy yet,
/// but the transaction must still re-aim the shell from its state. Written by
/// bindShell (the one configuration call), read only inside the transaction.
static CGFloat gTrackShellExpandedTop = 0;
static CGFloat gTrackShellTrackH = 0;

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
    // CONTENTSIZE IS AN INPUT TO THE DOMAIN AUTHORITY, in both KVO phases.
    // PRIOR (attributed live 2026-07-29: [SWITCH] target=648 → tau=311): UIKit
    // clamps contentOffset WHILE processing the new contentSize, before any
    // after-the-fact observer runs, so prevention must happen here — the
    // authority's prior phase grows the bottom inset to cover τ against ANY new
    // content height. It runs under a posture drag too: no touch is delivered
    // between the paired notifications, so a momentarily-high maxOffset cannot
    // be scrolled into, whereas a momentarily-low one clamps τ for real.
    // SETTLED then tightens to the exact domain — including the drag ceiling,
    // which the authority recomputes from the NEW contentH.
    if ([change[NSKeyValueChangeNotificationIsPriorKey] boolValue]) {
      UIScrollView *prior = (UIScrollView *)object;
      [self applyDomainTo:prior
                    phase:TrackDomainPhasePrior
                      tau:prior.contentOffset.y];
      return;
    }
    [self applyDomainTo:(UIScrollView *)object];
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
  // THE FINGER OPENS A MOTION EPISODE. Whatever was in flight is dead (the
  // stopSpring above), and the rest this drag eventually reaches is a NEW fact
  // with a new identity — which is precisely what the old JS sampler could not
  // express, and why a drag that returned to the detent it started from never
  // reported anything.
  [self armMotionEpisode];
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
      // THE POSTURE CEILING is now a STATE, not a write: declaring the drag
      // is the whole act, and the authority expresses the ceiling as an inset
      // on this call and on every input change for the drag's whole life.
      self.postureDragActive = YES;
      self.postureDragFromBoundary = (tau >= effEdge - 0.5);
    }
  }
  // G-HIDDEN: a finger capturing an ON-SCREEN sheet resolves the excursion —
  // the drag now owns τ and the excursion episode is over. Below 0 the
  // domain must survive the grab: collapsing the inset would clamp τ up
  // under the finger (the exact jerk class the legitimacy filter exists to
  // kill), so there the release spring's completion closes it instead.
  if (self.hiddenEngaged && scrollView.contentOffset.y >= -0.5) {
    [self closeHiddenExcursionOn:scrollView];
  }
  // DRAG BEGIN IS AN INPUT CHANGE (posture-drag state, σ, excursion state all
  // just moved): state the domain once, here. The old floor-collapse write
  // that lived at this point is subsumed — the authority already returns
  // insetTop 0 for an on-screen τ with no excursion engaged, and unlike that
  // write it refuses to collapse a floor still holding τ below 0.
  [self applyDomainTo:scrollView];
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
    // Drag end is an input change: the ceiling was drag-scoped, so the same
    // authority now states the resting domain (range law + external baseline).
    [self applyDomainTo:scrollView];
  }
  // DRAG END WITHOUT DECELERATION IS A REST. willEndDragging ran first and may
  // have handed the track to the spring (a detent settle, the rubber return);
  // if it did, the spring owns the rest fact and reports it at completion. Only
  // a lift that leaves NOTHING moving settles here.
  if (!decelerate && self.springLink == nil) {
    [self reportSettleOn:scrollView cause:@"dragEnd"];
  }
  if ([self.original respondsToSelector:@selector(scrollViewDidEndDragging:willDecelerate:)]) {
    [self.original scrollViewDidEndDragging:scrollView willDecelerate:decelerate];
  }
}

- (void)scrollViewDidEndDecelerating:(UIScrollView *)scrollView
{
  // UIKit's own deceleration ran out. The crossing intercept may have taken the
  // track over mid-decel, in which case the spring is live and owns the rest.
  if (self.springLink == nil) {
    [self reportSettleOn:scrollView cause:@"decelerate"];
  }
  if ([self.original respondsToSelector:@selector(scrollViewDidEndDecelerating:)]) {
    [self.original scrollViewDidEndDecelerating:scrollView];
  }
}

// ONE MOTION EPISODE, ONE SETTLE. Minted at every motion start; the first
// end-of-motion callback consumes the pending flag.
- (void)armMotionEpisode
{
  self.settleGeneration += 1;
  self.settlePending = YES;
}

- (void)reportSettleOn:(UIScrollView *)scrollView cause:(NSString *)cause
{
  if (!self.settlePending || scrollView == nil) {
    return;
  }
  self.settlePending = NO;
  if (self.onSettled == nil) {
    return;
  }
  const NSUInteger count = self.snapOffsets.count;
  double detents[16];
  const int detentCount = (int)MIN(count, (NSUInteger)16);
  for (int i = 0; i < detentCount; i++) {
    detents[i] = self.snapOffsets[(NSUInteger)i].doubleValue;
  }
  // 2pt: the SAME tolerance the deleted JS sampler used, now applied to a rest
  // the engine already proved rather than to a sampled frame that might still
  // be moving.
  const TrackSettleReading reading = TrackResolveSettleReading(
      scrollView.contentOffset.y, self.stashSigma, detents, detentCount, 2.0);
  self.onSettled(@{
    @"generation": @(self.settleGeneration),
    @"tau": @(scrollView.contentOffset.y),
    @"posture": @(reading.posture),
    @"atDetent": reading.atDetent ? @YES : @NO,
    @"detentTau": reading.atDetent ? (id)@(reading.detentTau) : (id)[NSNull null],
    @"cause": cause,
    // A rest reached while the excursion is still engaged is an OFF-SCREEN
    // rest: the hidden domain holds it there by design, and no detent applies.
    @"hiddenEngaged": self.hiddenEngaged ? @YES : @NO,
    @"hiddenGeneration": @(self.hiddenGeneration),
  });
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

// THE DOMAIN AUTHORITY, applied. The pure function states the domain; this is
// the ONE hand that writes it onto the scroll view. Every former partial writer
// calls here instead of computing an inset of its own.
- (void)applyDomainTo:(UIScrollView *)scrollView
{
  [self applyDomainTo:scrollView
                phase:TrackDomainPhaseSettled
                  tau:scrollView.contentOffset.y];
}

// tau is a PARAMETER because the clamp backstops repair toward the last
// legitimate τ, not the clamped one they are looking at.
- (void)applyDomainTo:(UIScrollView *)scrollView
                phase:(TrackDomainPhase)phase
                  tau:(CGFloat)tau
{
  if (self.applyingDomain) {
    return;
  }
  const CGFloat viewport = CGRectGetHeight(scrollView.bounds);
  if (viewport <= 0) {
    return;
  }
  const UIEdgeInsets insetsNow = scrollView.contentInset;
  TrackDomainState state;
  state.contentH = scrollView.contentSize.height;
  state.viewport = viewport;
  state.trackH = self.shellTrackH;
  state.boundary = (self.ballisticEdge >= 0 ? self.ballisticEdge : self.shellTrackH) +
      self.stashSigma;
  state.sigma = self.stashSigma;
  state.tau = tau;
  state.insetTopNow = insetsNow.top;
  state.insetBottomNow = insetsNow.bottom;
  state.externalBottomBaseline = self.externalBottomInset;
  state.hiddenTargetTau = self.hiddenTargetTau;
  state.postureDragActive = self.postureDragActive ? 1 : 0;
  state.hiddenEngaged = self.hiddenEngaged ? 1 : 0;
  state.shellEnabled = self.shellEnabled ? 1 : 0;
  state.phase = phase;
  const TrackDomainInsets next = TrackDomainLegalRange(state);
  if (fabs(insetsNow.top - next.insetTop) <= 0.5 &&
      fabs(insetsNow.bottom - next.insetBottom) <= 0.5) {
    return;
  }
  UIEdgeInsets insets = insetsNow;
  insets.top = next.insetTop;
  insets.bottom = next.insetBottom;
  // An inset write is an ENGINE write: it can re-enter didScroll in the same
  // transaction, and the clamp backstop must not read its own authority's work
  // as somebody else's clamp.
  self.applyingDomain = YES;
  self.engineWriteDepth += 1;
  scrollView.contentInset = insets;
  self.engineWriteDepth -= 1;
  self.applyingDomain = NO;
}

- (void)engineWrite:(UIScrollView *)scrollView offsetY:(CGFloat)offsetY
{
  self.engineWriteDepth += 1;
  [scrollView setContentOffset:CGPointMake(scrollView.contentOffset.x, offsetY) animated:NO];
  self.engineWriteDepth -= 1;
}

- (void)scrollViewDidScroll:(UIScrollView *)scrollView
{
  // THE LEGITIMACY FILTER, refined by its own red team (2026-08-02).
  //
  // The first cut enumerated legitimate WRITERS (finger / momentum / spring /
  // engine) and reverted everything else. That inverted the burden: it also
  // reverted UIKit's OWN legitimate writers we had not thought to list — the
  // keyboard scrolling a focused TextInput into view (create-poll, the DM
  // composer, edit-profile all have inputs), VoiceOver's three-finger scroll,
  // any future OS-animated scroll. A revert there is worse than the bug: the
  // field stays under the keyboard and the engine fights the OS every frame.
  //
  // The disease was never "a writer we did not list". It is THE CLAMP: UIKit
  // pinning tau to the reachability bound in a single frame because the
  // content shrank underneath it. So classify by the CLAMP'S SIGNATURE, which
  // no legitimate writer produces:
  //   (1) tau lands exactly AT the reachable maximum (that is what a clamp IS),
  //   (2) it is a DROP of real size (> 8pt — larger than any scroll step),
  //   (3) no finger is down and we are not inside an engine write.
  // Momentum is deliberately NOT trusted as a blessing here: a clamp during
  // deceleration was slipping through the old classifier unbarked.
  const CGFloat tauIn = scrollView.contentOffset.y;
  const CGFloat maxOffsetNow = scrollView.contentSize.height +
      scrollView.contentInset.bottom - CGRectGetHeight(scrollView.bounds);
  const BOOL clampShaped = fabs(tauIn - maxOffsetNow) < 0.5 &&
      (self.lastLegitimateTau - tauIn) > 8.0 && self.engineWriteDepth == 0 &&
      !scrollView.isTracking && !scrollView.isDragging;
  if (clampShaped) {
    // Re-state the domain AT the last legitimate τ — the authority's keep term
    // is exactly "τ stays legal", so asking it for the domain that τ belongs to
    // IS the repair — then put the sheet back before paint, and bark so the
    // missing PREVENTION path gets named. (Prevention is the authority invoked
    // at the contentSize prior phase; this is the backstop that closes the
    // class, and it no longer carries a second copy of the domain arithmetic.)
    [self applyDomainTo:scrollView
                  phase:TrackDomainPhaseSettled
                    tau:self.lastLegitimateTau];
    NSLog(@"[TRACKFILTER] reverted CLAMP tau %.1f -> %.1f (contentH=%.1f inset=%.1f)",
          tauIn, self.lastLegitimateTau, scrollView.contentSize.height,
          scrollView.contentInset.bottom);
    [self engineWrite:scrollView offsetY:self.lastLegitimateTau];
    return;
  }
  // THE MIN EDGE (G-HIDDEN / A1): the legitimacy filter learns the FLOOR. A
  // clamp at the hidden domain's minimum has the max-edge signature, mirrored:
  // τ lands exactly AT −contentInset.top, it is a RISE of real size (> 8pt),
  // no finger is down and we are not inside an engine write. No legitimate
  // writer produces that; revert it before paint and bark.
  const CGFloat minOffsetNow = -scrollView.contentInset.top;
  const BOOL minClampShaped = self.hiddenEngaged && fabs(tauIn - minOffsetNow) < 0.5 &&
      (tauIn - self.lastLegitimateTau) > 8.0 && self.engineWriteDepth == 0 &&
      !scrollView.isTracking && !scrollView.isDragging;
  if (minClampShaped) {
    // Same backstop, same authority: the floor term IS "a τ below 0 keeps its
    // own floor", so the domain at the last legitimate τ is the repair.
    [self applyDomainTo:scrollView
                  phase:TrackDomainPhaseSettled
                    tau:self.lastLegitimateTau];
    NSLog(@"[TRACKFILTER] reverted MIN-edge CLAMP tau %.1f -> %.1f (insetTop=%.1f)",
          tauIn, self.lastLegitimateTau, scrollView.contentInset.top);
    [self engineWrite:scrollView offsetY:self.lastLegitimateTau];
    return;
  }
  self.lastLegitimateTau = tauIn;
  // THE SCREEN-EDGE FACT (G-HIDDEN). The edge fires ONCE per excursion, the
  // frame τ reaches the target (sheetTop == screen bottom by algebra) — the
  // deferred content swap and the hide's settle key on it, stamped with the
  // excursion's generation so a stale target can never speak for a later one.
  // The excursion CLOSES event-driven (spring completion / drag capture /
  // superseding snapTo·refuse — see closeHiddenExcursionOn); the rest check
  // below is only the liveness backstop for a rest no event produced.
  if (self.hiddenEngaged) {
    if (!self.hiddenEdgeFired && tauIn <= self.hiddenTargetTau + 0.5) {
      self.hiddenEdgeFired = YES;
      if (self.onHiddenEdgeCleared) {
        self.onHiddenEdgeCleared(self.hiddenGeneration);
      }
    }
    if (tauIn >= -0.5 && !scrollView.isTracking && !scrollView.isDragging &&
        !scrollView.isDecelerating && self.springLink == nil) {
      [self closeHiddenExcursionOn:scrollView];
    }
  }
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
    // σ is a domain input (it moves the boundary): the dissolve is an input
    // change like any other. At rest with no drag this is a no-op in practice
    // — which is the point: the authority proves it rather than the dissolve
    // assuming it.
    [self applyDomainTo:scrollView];
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
    // SNAP ONLY AT REST (red team #2): during motion every layer rides the
    // same raw tau, so raw floats mean ZERO relative motion — snapping a
    // transform inside unsnapped content made the chrome dither ±1/(2·scale)
    // against the rows. At rest, snap for crisp grid-aligned edges.
    const BOOL inMotion = scrollView.isTracking || scrollView.isDragging ||
        scrollView.isDecelerating || self.springLink != nil;
    const CGFloat sheetTopRaw = self.shellExpandedTop + MAX(0.0, tugBoundary - tau) - tug;
    const CGFloat sheetTop = inMotion ? sheetTopRaw : TrackPixelSnap(sheetTopRaw);
    // THE REAL SLOT: registry-first (self-registered, transform-sealed views);
    // the tag-bound views remain as the legacy fallback until the delete pass.
    TrackShellRegistry *registry = [TrackShellRegistry shared];
    // NATIVE EDIT (strip choreography fix 3, 2026-08-08): the band's chrome
    // height PREFERS the commit-clocked slot prop (set inside the Fabric
    // mounting transaction that flips the chrome pixels; its setter re-runs
    // this writer synchronously) over bindShell's addUIBlock-carried value —
    // so the mask below and the chrome pixels change in the SAME frame on a
    // none<->strip switch. bindShell remains the fallback carrier. MASK
    // OWNERSHIP and THE PATH RULE are untouched: only WHEN the height lands
    // changes, never who masks.
    TrackShellSlotView *chromeHeightSlot = [registry viewForRole:@"chromeContent"];
    const CGFloat effectiveChromeHeight =
        (chromeHeightSlot != nil && chromeHeightSlot.hasTrackChromeHeight)
            ? chromeHeightSlot.trackChromeHeight
            : self.shellChromeHeight;
    TrackShellSlotView *frostSlot = [registry viewForRole:@"frost"];
    UIView *frost = frostSlot;
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
    TrackShellSlotView *tailSlot = [registry viewForRole:@"tail"];
    UIView *tail = tailSlot;
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
        const CGFloat bandBottom = tau + sheetTop + effectiveChromeHeight;
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
            // PIXEL-ALIGNED EDGE (same-edge law, native half): the reveal
            // boundary is built from unrounded floats (tau, sheetTop, the
            // fractional 68.25), so left raw it lands MID-PIXEL and the row
            // white fades in over a partial pixel — a hairline of frost under
            // the header. Snap the edge to the device grid.
            const CGFloat edgeYRaw = bandBottom - origin.y;
            const CGFloat edgeY = inMotion ? edgeYRaw : TrackPixelSnap(edgeYRaw);
            const CGRect next = CGRectMake(-w, edgeY, w * 3.0, h * 6.0);
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
                                     tau + sheetTop + effectiveChromeHeight,
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
    const CGFloat holdRaw = self.stashSigma + MAX(0.0, tauNow - boundary) - tugNow;
    const BOOL pinInMotion = scrollView.isTracking || scrollView.isDragging ||
        scrollView.isDecelerating || self.springLink != nil;
    const CGFloat hold = pinInMotion ? holdRaw : TrackPixelSnap(holdRaw);
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
  [self engineWrite:scrollView offsetY:scrollView.contentOffset.y];
  // A SPRING IS A MOTION EPISODE. Starting one supersedes whatever episode was
  // running (a drag that just released into this settle, a prior spring a
  // command interrupted): the superseded episode's rest is never reported,
  // exactly as the motion authority's reducer already treats a supersession —
  // one rest fact per continuous stretch of motion, at its true end.
  [self armMotionEpisode];
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

// THE EXCURSION CLOSE — one exit, event-driven (G-HIDDEN native red team):
// disarm + collapse the extended domain. Callers guarantee τ ≥ 0 (spring
// completion on an on-screen target, drag capture of an on-screen sheet, a
// superseding refuse after its write, the didScroll rest backstop) — a close
// at τ < 0 would clamp the sheet back on screen in one frame.
- (void)closeHiddenExcursionOn:(UIScrollView *)scrollView
{
  self.hiddenEngaged = NO;
  self.hiddenEdgeFired = NO;
  // The floor collapses because the excursion state changed, not because this
  // method knows how to write insets: the authority derives insetTop 0 from
  // "no excursion engaged, τ on screen". A caller that violates the τ ≥ 0
  // precondition now gets a floor that HOLDS instead of a clamp.
  [self applyDomainTo:scrollView];
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
    [self engineWrite:scrollView offsetY:self.springTarget];
    // THE SPRING KNOWS WHEN IT FINISHES: an excursion whose spring lands
    // on-screen closes HERE, at the completion event — the terminal
    // engineWrite runs with springLink still live, so a sampled rest check
    // in didScroll can never see this frame. A hide's spring (negative
    // target) leaves the excursion engaged: the sheet RESTS off-screen and
    // the domain must hold it there.
    const BOOL landedOnScreen = self.springTarget >= -0.5;
    [self stopSpring];
    if (self.hiddenEngaged && landedOnScreen) {
      [self closeHiddenExcursionOn:scrollView];
    }
    // THE SETTLE FACT, at the frame the spring actually finished — reported
    // AFTER the excursion close so the fact carries the settled state, not the
    // state one line before it. A hide's spring lands off-screen and still
    // settles here: its rest is real, it is simply not at a detent.
    [self reportSettleOn:scrollView cause:@"spring"];
    return;
  }
  [self engineWrite:scrollView offsetY:self.springTarget + d];
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
  return @[ @"trackTopArrival", @"trackSigmaChanged", @"trackShellWarning",
            @"trackHiddenEdgeCleared", @"trackDidSettle" ];
}

// ─── THE CONTRACT HANDSHAKE ──────────────────────────────────────────────────
// A JS bundle is reloaded in seconds; the binary under it is rebuilt and
// reinstalled by hand. When they diverge, EVERY symptom is a silence: commands
// resolve to nothing, the settle event never arrives, the fence never restores,
// reveals wait out their deadline. The app limps, which is worse than a crash
// because nothing names the cause. So the binary STATES what it speaks, JS
// checks it at attach, and a mismatch is a loud dev-time failure with the fix
// in the message. There is deliberately NO compatibility shim: an old binary is
// a thing to reinstall, not a thing to support.
// The capability list is not decoration — it is what makes the failure
// ACTIONABLE (which surface is missing), and it is the reason the version and
// the constant that carries it can never be dead-stripped: constantsToExport is
// the module's own export path.
- (NSDictionary *)constantsToExport
{
  return @{
    @"contractVersion": @(TRACK_SCROLL_CONTRACT_VERSION),
    @"capabilities": @[
      @"snapToOutcome",        // snapTo resolves {refused, targetTau, hiddenGeneration?}
      @"hiddenIntent",         // snapToHidden — the engine derives the depth
      @"settleEvent",          // trackDidSettle
      @"generationStampedEdge",// trackHiddenEdgeCleared carries its generation
      @"externalBottomInset",  // the domain authority's external baseline seam
    ],
  };
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
      proxy.lastLegitimateTau = scrollView.contentOffset.y;
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
    __weak typeof(self) settleWeakSelf = self;
    proxy.onSettled = ^(NSDictionary *body) {
      [settleWeakSelf sendEventWithName:@"trackDidSettle" body:body];
    };
    __weak typeof(self) hiddenWeakSelf = self;
    proxy.onHiddenEdgeCleared = ^(NSInteger generation) {
      [hiddenWeakSelf sendEventWithName:@"trackHiddenEdgeCleared"
                                   body:@{ @"generation": @(generation) }];
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
// (the short-circuit and the excursion arm live in TrackPerformSnap below)
// THE ONE SNAP BODY. Both entry points — a detent command (posture number from
// JS) and the hidden INTENT (posture derived natively, below) — are the same
// operation on the same spring; only where the target came from differs. They
// share this function so a law added to one can never be missing from the
// other.
static void TrackPerformSnap(UIScrollView *scrollView,
                             CGFloat postureTarget,
                             RCTPromiseResolveBlock resolve)
{
  TrackScrollDelegateProxy *proxy = objc_getAssociatedObject(scrollView, kTrackProxyKey);
  // THE FINGER OWNS TAU (native red team): a command landing mid-drag would
  // fight the pan frame-by-frame — and a negative one would arm an excursion
  // UNDER the finger. The user's posture choice supersedes the command
  // intent; the refusal is a FACT the caller sees (refused: YES), never a
  // silent drop it retries into.
  if (proxy != nil && (scrollView.isTracking || scrollView.isDragging)) {
    resolve(@{ @"refused": @YES });
    return;
  }
  // THE SHORT-CIRCUIT (ported from the old snap runtime): a seat within
  // 0.5pt of the current τ commands NOTHING — a same-posture switch is
  // provably zero pixels, never a spring that "confirms" the position.
  // snapTo input is POSTURE-space: σ shifts it into τ-space.
  const CGFloat sigma = proxy != nil ? proxy.stashSigma : 0;
  const CGFloat target = postureTarget + sigma;
  // targetTau rides EVERY resolve. The caller's retry loop measures |τ − target|
  // to decide whether the command landed, and with the hidden target now
  // derived natively the caller no longer knows that number — so the engine
  // that chose it says it. (For a detent command it is the same number JS sent,
  // shifted by the σ only native holds.)
  if (fabs(scrollView.contentOffset.y - target) < 0.5) {
    resolve(@{ @"refused": @NO, @"targetTau": @(target) });
    return;
  }
  // G-HIDDEN (R4): a negative target is the HIDDEN EXCURSION — arm the
  // one-shot screen-edge fact under a fresh generation, extend the τ domain
  // (contentInset.top = |target|) so UIKit cannot clamp the glide at 0, and
  // start the spring — ONE synchronous block, so no manual didScroll can
  // slip between the arm and the flight. Growing the top inset never moves
  // content; the excursion closes event-driven (spring completion / drag
  // capture / superseding command). The glide itself is the SAME critically
  // damped spring as every detent settle (OA5: every sheet glides).
  // The target is NEGATIVE-BY-DERIVATION now (snapToHidden computes it from the
  // live bounds); this test stays the sole arming condition so the excursion
  // has exactly one birth, whichever entry point commanded it.
  if (proxy != nil && target < -0.5) {
    proxy.hiddenGeneration += 1;
    proxy.hiddenEngaged = YES;
    proxy.hiddenEdgeFired = NO;
    proxy.hiddenTargetTau = target;
    // Arming the excursion IS the domain input; the floor falls out of it.
    [proxy applyDomainTo:scrollView];
  } else if (proxy != nil && proxy.hiddenEngaged) {
    // A positive snap SUPERSEDES a live excursion: consume the one-shot so
    // the stale hiddenTargetTau can never fire an edge for a hide that is
    // no longer happening. The extended domain survives the return glide
    // (collapsing it at τ < 0 would clamp); the spring's completion closes.
    proxy.hiddenEdgeFired = YES;
  }
  if (proxy == nil) {
    [scrollView setContentOffset:CGPointMake(scrollView.contentOffset.x, target)
                        animated:YES];
    resolve(@{ @"refused": @NO, @"targetTau": @(target) });
    return;
  }
  [proxy startSpringOn:scrollView
              toTarget:target
                 fromY:scrollView.contentOffset.y
             velocityY:0];
  if (target < -0.5) {
    resolve(@{ @"refused": @NO,
               @"targetTau": @(target),
               @"hiddenGeneration": @(proxy.hiddenGeneration) });
  } else {
    resolve(@{ @"refused": @NO, @"targetTau": @(target) });
  }
}

RCT_EXPORT_METHOD(snapTo:(nonnull NSNumber *)reactTag
                  offset:(nonnull NSNumber *)offset
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  [self.bridge.uiManager addUIBlock:^(RCTUIManager *uiManager, NSDictionary<NSNumber *, UIView *> *viewRegistry) {
    UIView *root = viewRegistry[reactTag] ?: [uiManager viewForReactTag:reactTag];
    UIScrollView *scrollView = root ? TrackFindScrollView(root) : nil;
    if (scrollView == nil) {
      resolve(@{ @"refused": @NO });
      return;
    }
    TrackPerformSnap(scrollView, offset.doubleValue, resolve);
  }];
}

// ─── THE HIDDEN INTENT (ratified item 5: native hidden depth) ────────────────
// JS says WHAT it wants ('hidden'); the engine says WHERE that is. The depth
// used to be computed in JS from Dimensions.get('window') — a module-scope
// screen snapshot commanding a pixel target against live UIKit bounds, which is
// G-ROTATE's staleness with an address: after a bounds change the sheet would
// glide to a depth derived from the previous screen and rest short of (or past)
// the edge, and the screen-edge fact it arms would fire at the wrong τ.
// Here the depth is read from the geometry the engine was BOUND with plus the
// live window, in the same UI block that starts the spring — it cannot be
// stale by construction. Everything else is preserved verbatim because it is
// TrackPerformSnap: glide-only on the same critically damped spring (OA5), the
// generation stamp, the one-shot edge, the deferred swap's boundary, and the R4
// excursion floor stated by the domain authority.
RCT_EXPORT_METHOD(snapToHidden:(nonnull NSNumber *)reactTag
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  [self.bridge.uiManager addUIBlock:^(RCTUIManager *uiManager, NSDictionary<NSNumber *, UIView *> *viewRegistry) {
    UIView *root = viewRegistry[reactTag] ?: [uiManager viewForReactTag:reactTag];
    UIScrollView *scrollView = root ? TrackFindScrollView(root) : nil;
    if (scrollView == nil) {
      resolve(@{ @"refused": @NO });
      return;
    }
    TrackScrollDelegateProxy *proxy = objc_getAssociatedObject(scrollView, kTrackProxyKey);
    // The shell geometry the engine holds; the module-scope mirror covers the
    // window where bindShell has run but this proxy has not been configured.
    const CGFloat expandedTop =
        (proxy != nil && proxy.shellEnabled) ? proxy.shellExpandedTop : gTrackShellExpandedTop;
    const CGFloat trackH =
        (proxy != nil && proxy.shellTrackH > 0) ? proxy.shellTrackH : gTrackShellTrackH;
    // THE LIVE BOUNDS: the window this scroll view is actually in, falling back
    // to the main screen only when it is not in one yet.
    UIWindow *window = scrollView.window;
    const CGFloat screenH = window != nil ? CGRectGetHeight(window.bounds)
                                          : CGRectGetHeight(UIScreen.mainScreen.bounds);
    const CGFloat postureTarget =
        TrackHiddenPostureTargetForBounds(expandedTop, trackH, screenH);
    TrackPerformSnap(scrollView, postureTarget, resolve);
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
    // ANY τ-AUTHORITY TRANSFER TERMINATES THE CURRENT MOTION EPISODE (native
    // red team): a live spring's closed form is position-independent — left
    // running, its next display-link tick overwrites this switch's write.
    // Same kill willBeginDragging performs when the finger takes τ, and the
    // same disarm: a pending ballistic intercept belongs to the dead episode.
    [proxy stopSpring];
    proxy.ballisticArmed = NO;
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
      [proxy engineWrite:scrollView offsetY:target];
    }
    // refuse() SUPERSEDES any live excursion: its write just landed the sheet
    // at an on-screen posture (the register is clamped ≥ 0), so the excursion
    // episode is over — close it here, after the write, never before (a
    // collapse at τ < 0 would clamp ahead of the write).
    if (proxy.hiddenEngaged) {
      [proxy closeHiddenExcursionOn:scrollView];
    } else {
      // σ went to 0 and τ moved: two domain inputs changed, so the domain is
      // re-stated — by the authority, not by a switch-time inset floor of its
      // own. (The floor this call used to be tempted into is the one the
      // A/B above proved unnecessary; the authority makes "one writer, one
      // place" structural instead of a comment.)
      [proxy applyDomainTo:scrollView];
    }
  }];
}


// ─── THE SWITCH TRANSACTION (atomic switch, 2026-08-01) ─────────────────────
// One CATransaction: seed the incoming leg's offset from the posture register,
// re-aim every shell layer, kill live springs, and flip leg visibility — no
// frame can exist where two painted copies of the sheet disagree. A switch to
// a not-yet-registered leg PENDS natively and executes inside the leg slot's
// own registering transaction: the leg's first painted frame is already
// seeded and visible.

// (THE SWITCH TRANSACTION machinery deleted 2026-08-02 — the collapse made
// switches a data swap on ONE track; refuse() is the only switch-time write.)


// ── THE EXTERNAL BOTTOM BASELINE (the F7 arbitration) ───────────────────────
// contentInset.bottom is ONE scalar with two legitimate claimants: the engine's
// τ-domain need, and whoever must keep content clear of something drawn over
// the bottom of the sheet (keyboard avoidance on an input-bearing page, a
// reachability baseline). Before the authority, the range law simply SET the
// scalar — two writers, no arbitration, and the external claim silently lost
// whenever a contentSize change happened to fire.
// The claim is REGISTERED here and composed by max() inside the authority. It
// is never inferred from the current inset: inferring would read the engine's
// own last write back as an external need and ratchet the domain open forever.
RCT_EXPORT_METHOD(setExternalBottomInset:(nonnull NSNumber *)reactTag
                  inset:(nonnull NSNumber *)inset)
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
    proxy.externalBottomInset = MAX(0.0, inset.doubleValue);
    [proxy applyDomainTo:scrollView];
  }];
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
// JS cannot fix this (it reacts a frame after the clamp). The law is discharged
// by the DOMAIN AUTHORITY, invoked synchronously with the contentSize change:
// its keep term is "τ stays legal", and its prior phase prevents the clamp
// before the new height is even known. An external bottom baseline is composed,
// never assumed — see setExternalBottomInset.
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
    // SHELL CONFIGURATION IS A DOMAIN INPUT (trackH and the shell gate both
    // feed the reach term): state the domain before the first frame is drawn,
    // so "every posture legal" is true from configuration onward rather than
    // from the first contentSize change onward.
    [proxy applyDomainTo:scrollView];
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
