#import <React/RCTView.h>
#import <React/RCTViewManager.h>

NS_ASSUME_NONNULL_BEGIN

/// THE REAL SLOT (transition derivation XIII). A shell layer whose POSITION
/// belongs to the engine alone:
///  - SELF-REGISTERING: the view announces itself to the registry inside its
///    own UIKit lifecycle (didMoveToWindow) — no tag, no interop lookup, no
///    JS timing. A React recreation registers the replacement in the same
///    UIKit transaction it appears, and the engine positions it before it can
///    ever be drawn unpositioned: the detach FLASH is unwritable.
///  - TRANSFORM-SEALED: setTransform is a no-op for every caller except the
///    engine's private setter. React cannot move this view; the commit-proof
///    re-assert dance becomes unnecessary for slots.
@interface TrackShellSlotView : RCTView
@property (nonatomic, copy, nullable) NSString *slotRole;
- (void)trackApplyTransform:(CGAffineTransform)transform;
@end

/// Role → live slot view (weak). The engine reads it every shell frame and is
/// pinged synchronously on registration so a fresh slot is positioned within
/// the registering transaction.
@interface TrackShellRegistry : NSObject
+ (instancetype)shared;
@property (nonatomic, copy, nullable) void (^onSlotsChanged)(void);
- (void)registerView:(TrackShellSlotView *)view;
- (void)unregisterView:(TrackShellSlotView *)view;
- (nullable TrackShellSlotView *)viewForRole:(NSString *)role;
@end

@interface TrackShellSlotViewManager : RCTViewManager
@end

/// THE CARVE (responsibility audit #2, ported from CraveBottomSheetHostView's
/// pointInside). The track scroll views fill the screen, but the sheet only
/// OWNS from sheetTop down — a touch above it belongs to the map. The engine
/// publishes the live sheetTop (screen-space, σ-aware) every shell frame; this
/// wrapper's hitTest releases everything above it. Paint-only masking never
/// carved touches (P7) — this is the missing half.
extern CGFloat gTrackCarveSheetTop;

/// The presented leg's scroll view (the engine's posture-register owner).
/// THE SINGLE PAINTED CHROME needs it to redirect header drags into the track.
UIScrollView *_Nullable TrackPresentedScrollView(void);

/// ── THE LEG SLOTS (atomic switch, 2026-08-01) ───────────────────────────────
/// Scene presentation is ENGINE-OWNED, not React-owned. Each resident leg's
/// rows and its visual chrome mount inside a TrackLegSlotView; the engine's
/// switch transaction flips alphas, seeds the incoming offset, and re-aims the
/// shell inside ONE CATransaction — a frame where two painted copies of the
/// sheet disagree is unwritable. React mounts content and never expresses
/// presentation (no opacity in leg styles — a React opacity would multiply the
/// engine's alpha on the interop wrapper and fight the transaction).
@interface TrackLegSlotView : RCTView
@property (nonatomic, copy, nullable) NSString *legKey;
@property (nonatomic, copy, nullable) NSString *legKind; // "rows" | "chrome"
@property (nonatomic, assign) BOOL initialPresented;
@end

@interface TrackLegRegistry : NSObject
+ (instancetype)shared;
@property (nonatomic, copy, nullable) NSString *presentedKey;
/// Set by the physics module; called (main thread, inside the registering
/// UIKit transaction) when a leg slot registers while a switch is pending for
/// its key — the leg's very first painted frame is already seeded and visible.
@property (nonatomic, copy, nullable) void (^onLegRegistered)(TrackLegSlotView *view);
- (void)registerView:(TrackLegSlotView *)view;
- (void)unregisterView:(TrackLegSlotView *)view;
- (nullable TrackLegSlotView *)viewForKey:(NSString *)key kind:(NSString *)kind;
- (void)applyAlphasForPresentedKey:(NSString *)key;
- (NSArray<NSDictionary *> *)auditLegs;
@end

@interface TrackLegSlotViewManager : RCTViewManager
@end

@interface TrackTouchCarveView : RCTView
@end

@interface TrackTouchCarveViewManager : RCTViewManager
@end

NS_ASSUME_NONNULL_END
