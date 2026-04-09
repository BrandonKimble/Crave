package com.crave;

import android.animation.ValueAnimator;
import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.view.MotionEvent;
import android.view.VelocityTracker;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.animation.OvershootInterpolator;
import android.widget.FrameLayout;

import androidx.annotation.Nullable;
import androidx.annotation.NonNull;

import java.lang.ref.WeakReference;
import java.util.ArrayList;
import java.util.concurrent.ConcurrentHashMap;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.events.RCTEventEmitter;

public class BottomSheetHostView extends FrameLayout {
  public static final String EVENT_SHEET_HOST = "topSheetHostEvent";
  private static final Handler MAIN_HANDLER = new Handler(Looper.getMainLooper());
  private static final ConcurrentHashMap<String, WeakReference<BottomSheetHostView>> HOSTS_BY_KEY =
    new ConcurrentHashMap<>();
  private static final ConcurrentHashMap<String, PendingCommand> PENDING_COMMANDS_BY_KEY =
    new ConcurrentHashMap<>();
  private static final float STEP_SNAP_SMALL_DRAG_PX = 20f;
  private static final float STEP_SNAP_DRAG_PX = 48f;
  private static final float STEP_SNAP_SKIP_DRAG_PX = 212f;
  private static final float STEP_SNAP_VELOCITY_PX_PER_S = 820f;
  private static final float STEP_SNAP_SKIP_VELOCITY_PX_PER_S = 3200f;
  private static final float STEP_SNAP_SKIP_MIN_PROGRESS = 0.5f;
  private static final float STEP_SNAP_DIRECTION_EPSILON_PX = 4f;
  private static final float STEP_SNAP_DIRECTION_VELOCITY_EPS_PX_PER_S = 120f;
  private static final float STEP_SNAP_DIRECTION_VELOCITY_OVERRIDE_PX_PER_S = 420f;
  private static final float STEP_SNAP_REVERSAL_CANCEL_VELOCITY_PX_PER_S = 220f;
  private static final float STEP_SNAP_REVERSAL_CANCEL_DRAG_PX = 140f;
  private static final float STEP_SNAP_PROGRESS_FOR_STEP = 0.18f;
  private static final float STEP_SNAP_PROGRESS_FOR_SKIP = 1.03f;

  private final ThemedReactContext reactContext;
  private final int touchSlop;

  private float expandedSnap = 0f;
  private float middleSnap = 0f;
  private float collapsedSnap = 0f;
  private float hiddenSnap = 0f;
  private String initialSnapPoint = "middle";
  private String currentSnapPoint = "hidden";
  private boolean visible = false;
  private boolean preservePositionOnSnapPointsChange = false;
  private boolean preventSwipeDismiss = false;
  private boolean interactionEnabled = true;
  private boolean animateOnMount = false;
  @Nullable private Float dismissThreshold = null;
  @Nullable private String hostKey = null;
  private int lastCommandToken = -1;

  @Nullable private ValueAnimator animator = null;
  @Nullable private VelocityTracker velocityTracker = null;
  private boolean dragging = false;
  private float downX = 0f;
  private float downY = 0f;
  private float dragStartY = 0f;

  private static final class SnapCandidate {
    final String key;
    final float value;

    SnapCandidate(String key, float value) {
      this.key = key;
      this.value = value;
    }
  }

  private static final class PendingCommand {
    final String snapTo;
    final int token;

    PendingCommand(String snapTo, int token) {
      this.snapTo = snapTo;
      this.token = token;
    }
  }

  public BottomSheetHostView(Context context) {
    super(context);
    reactContext = (ThemedReactContext) context;
    touchSlop = ViewConfiguration.get(context).getScaledTouchSlop();
    setClipChildren(false);
  }

  public void setVisible(boolean nextVisible) {
    if (visible == nextVisible && !animateOnMount) {
      visible = nextVisible;
      applySnap(nextVisible ? currentVisibleSnapPoint() : "hidden", false);
      return;
    }
    visible = nextVisible;
    String snapPoint = nextVisible ? currentVisibleSnapPoint() : "hidden";
    currentSnapPoint = snapPoint;
    notifySnapStart(snapPoint, "programmatic");
    emitActiveEvent("settle_state", true);
    animateSheet(resolveSnapValue(snapPoint), snapPoint, "programmatic");
  }

  public void setHostKey(@Nullable String nextHostKey) {
    if ((hostKey == null && nextHostKey == null) || (hostKey != null && hostKey.equals(nextHostKey))) {
      return;
    }
    unregisterHostKey();
    hostKey = nextHostKey;
    registerHostKey();
  }

  public void setSnapPoints(@Nullable ReadableMap map) {
    if (map == null) {
      return;
    }
    if (map.hasKey("expanded")) {
      expandedSnap = (float) map.getDouble("expanded");
    }
    if (map.hasKey("middle")) {
      middleSnap = (float) map.getDouble("middle");
    }
    if (map.hasKey("collapsed")) {
      collapsedSnap = (float) map.getDouble("collapsed");
    }
    if (map.hasKey("hidden")) {
      hiddenSnap = (float) map.getDouble("hidden");
    }
    if (preservePositionOnSnapPointsChange) {
      return;
    }
    applySnap(visible ? currentVisibleSnapPoint() : "hidden", true);
  }

  public void setInitialSnapPoint(@Nullable String snapPoint) {
    if (snapPoint != null) {
      initialSnapPoint = snapPoint;
    }
  }

  public void setPreservePositionOnSnapPointsChange(boolean value) {
    preservePositionOnSnapPointsChange = value;
  }

  public void setPreventSwipeDismiss(boolean value) {
    preventSwipeDismiss = value;
  }

  public void setInteractionEnabled(boolean value) {
    interactionEnabled = value;
  }

  public void setAnimateOnMount(boolean value) {
    animateOnMount = value;
  }

  public void setDismissThreshold(@Nullable Float value) {
    dismissThreshold = value;
  }

  public void setSheetCommand(@Nullable ReadableMap command) {
    if (command == null || !command.hasKey("token") || !command.hasKey("snapTo")) {
      return;
    }
    int token = command.getInt("token");
    if (token == lastCommandToken) {
      return;
    }
    lastCommandToken = token;
    String snapTo = command.getString("snapTo");
    if (snapTo == null) {
      return;
    }
    dispatchProgrammaticCommand(snapTo, token);
  }

  public void dispatchProgrammaticCommand(@NonNull String snapTo, int token) {
    if (token == lastCommandToken) {
      return;
    }
    lastCommandToken = token;
    currentSnapPoint = snapTo;
    notifySnapStart(snapTo, "programmatic");
    emitActiveEvent("settle_state", true);
    animateSheet(resolveSnapValue(snapTo), snapTo, "programmatic");
  }

  public static void dispatchCommand(@NonNull String hostKey, @NonNull String snapTo, int token) {
    WeakReference<BottomSheetHostView> hostReference = HOSTS_BY_KEY.get(hostKey);
    BottomSheetHostView host = hostReference != null ? hostReference.get() : null;
    PENDING_COMMANDS_BY_KEY.put(hostKey, new PendingCommand(snapTo, token));
    if (host == null) {
      return;
    }
    MAIN_HANDLER.post(() -> host.dispatchProgrammaticCommand(snapTo, token));
  }

  @Override
  protected void onAttachedToWindow() {
    super.onAttachedToWindow();
    registerHostKey();
  }

  @Override
  protected void onDetachedFromWindow() {
    unregisterHostKey();
    super.onDetachedFromWindow();
  }

  @Override
  public boolean onInterceptTouchEvent(MotionEvent event) {
    if (!interactionEnabled) {
      return false;
    }
    switch (event.getActionMasked()) {
      case MotionEvent.ACTION_DOWN:
        downX = event.getRawX();
        downY = event.getRawY();
        dragStartY = getTranslationY();
        dragging = false;
        stopAnimation();
        recycleVelocityTracker();
        velocityTracker = VelocityTracker.obtain();
        velocityTracker.addMovement(event);
        return false;
      case MotionEvent.ACTION_MOVE:
        if (velocityTracker != null) {
          velocityTracker.addMovement(event);
        }
        float dx = event.getRawX() - downX;
        float dy = event.getRawY() - downY;
        boolean isExpanded = getTranslationY() <= expandedSnap + 2f;
        if (Math.abs(dy) <= touchSlop || Math.abs(dy) <= Math.abs(dx) * 1.15f) {
          return false;
        }
        if (dy < 0 && isExpanded && canScrollChildUp()) {
          return false;
        }
        if (dy > 0 && isExpanded && !isScrollableChildAtTop()) {
          return false;
        }
        dragging = true;
        emitActiveEvent("drag_state", true);
        emitActiveEvent("settle_state", false);
        getParent().requestDisallowInterceptTouchEvent(true);
        return true;
      default:
        return false;
    }
  }

  @Override
  public boolean onTouchEvent(MotionEvent event) {
    if (!interactionEnabled) {
      return false;
    }
    switch (event.getActionMasked()) {
      case MotionEvent.ACTION_DOWN:
        downX = event.getRawX();
        downY = event.getRawY();
        dragStartY = getTranslationY();
        stopAnimation();
        recycleVelocityTracker();
        velocityTracker = VelocityTracker.obtain();
        velocityTracker.addMovement(event);
        return true;
      case MotionEvent.ACTION_MOVE:
        if (velocityTracker != null) {
          velocityTracker.addMovement(event);
        }
        float nextY = clampSheetY(dragStartY + event.getRawY() - downY);
        setTranslationY(nextY);
        emitSheetY(nextY);
        return true;
      case MotionEvent.ACTION_UP:
      case MotionEvent.ACTION_CANCEL:
        float velocityY = 0f;
        if (velocityTracker != null) {
          velocityTracker.addMovement(event);
          velocityTracker.computeCurrentVelocity(1000);
          velocityY = velocityTracker.getYVelocity();
        }
        recycleVelocityTracker();
        emitActiveEvent("drag_state", false);
        String snapPoint = resolveSnapPoint(getTranslationY(), velocityY, dragStartY);
        currentSnapPoint = snapPoint;
        notifySnapStart(snapPoint, "gesture");
        emitActiveEvent("settle_state", true);
        animateSheet(resolveSnapValue(snapPoint), snapPoint, "gesture");
        dragging = false;
        return true;
      default:
        return super.onTouchEvent(event);
    }
  }

  private boolean canScrollChildUp() {
    for (int index = 0; index < getChildCount(); index += 1) {
      if (canScrollChildUp(getChildAt(index))) {
        return true;
      }
    }
    return false;
  }

  private void registerHostKey() {
    if (hostKey == null || !isAttachedToWindow()) {
      return;
    }
    HOSTS_BY_KEY.put(hostKey, new WeakReference<>(this));
    PendingCommand pendingCommand = PENDING_COMMANDS_BY_KEY.get(hostKey);
    if (pendingCommand != null) {
      MAIN_HANDLER.post(() -> dispatchProgrammaticCommand(pendingCommand.snapTo, pendingCommand.token));
    }
  }

  private void unregisterHostKey() {
    if (hostKey == null) {
      return;
    }
    WeakReference<BottomSheetHostView> hostReference = HOSTS_BY_KEY.get(hostKey);
    BottomSheetHostView host = hostReference != null ? hostReference.get() : null;
    if (host == this) {
      HOSTS_BY_KEY.remove(hostKey);
    }
  }

  private boolean canScrollChildUp(@Nullable View view) {
    if (view == null) {
      return false;
    }
    if (view.canScrollVertically(-1)) {
      return true;
    }
    if (!(view instanceof android.view.ViewGroup)) {
      return false;
    }
    android.view.ViewGroup group = (android.view.ViewGroup) view;
    for (int index = 0; index < group.getChildCount(); index += 1) {
      if (canScrollChildUp(group.getChildAt(index))) {
        return true;
      }
    }
    return false;
  }

  private boolean isScrollableChildAtTop() {
    return !canScrollChildUp();
  }

  private String currentVisibleSnapPoint() {
    return "hidden".equals(currentSnapPoint) ? initialSnapPoint : currentSnapPoint;
  }

  private float resolveSnapValue(String snapPoint) {
    if ("expanded".equals(snapPoint)) {
      return expandedSnap;
    }
    if ("middle".equals(snapPoint)) {
      return middleSnap;
    }
    if ("collapsed".equals(snapPoint)) {
      return collapsedSnap;
    }
    return hiddenSnap;
  }

  private float clampSheetY(float value) {
    float lowerBound = preventSwipeDismiss ? collapsedSnap : hiddenSnap;
    return Math.max(expandedSnap, Math.min(value, lowerBound));
  }

  private String resolveSnapPoint(float value, float velocityY, float gestureStartY) {
    if (!preventSwipeDismiss) {
      float threshold = dismissThreshold != null ? dismissThreshold : hiddenSnap - 80f;
      if (hiddenSnap > collapsedSnap && value >= threshold) {
        return "hidden";
      }
    }

    ArrayList<SnapCandidate> candidates = buildVisibleSnapCandidates();
    float targetValue =
      resolveSteppedSnapValue(clampSheetY(value), velocityY, clampSheetY(gestureStartY), candidates);
    return candidates.get(findNearestPointIndex(targetValue, candidates)).key;
  }

  private ArrayList<SnapCandidate> buildVisibleSnapCandidates() {
    ArrayList<SnapCandidate> candidates = new ArrayList<>(3);
    appendVisibleSnapCandidate(candidates, "expanded", expandedSnap);
    appendVisibleSnapCandidate(candidates, "middle", middleSnap);
    appendVisibleSnapCandidate(candidates, "collapsed", collapsedSnap);
    return candidates;
  }

  private void appendVisibleSnapCandidate(
    ArrayList<SnapCandidate> candidates,
    String key,
    float value
  ) {
    if (candidates.isEmpty()) {
      candidates.add(new SnapCandidate(key, value));
      return;
    }
    SnapCandidate previous = candidates.get(candidates.size() - 1);
    if (Math.abs(previous.value - value) < 0.5f) {
      return;
    }
    candidates.add(new SnapCandidate(key, value));
  }

  private int findNearestPointIndex(float value, ArrayList<SnapCandidate> candidates) {
    int closestIndex = 0;
    float minDistance = Math.abs(value - candidates.get(0).value);
    for (int index = 1; index < candidates.size(); index += 1) {
      float distance = Math.abs(value - candidates.get(index).value);
      if (distance < minDistance) {
        minDistance = distance;
        closestIndex = index;
      }
    }
    return closestIndex;
  }

  private float resolveSteppedSnapValue(
    float value,
    float velocityY,
    float gestureStartY,
    ArrayList<SnapCandidate> candidates
  ) {
    if (candidates.isEmpty()) {
      return value;
    }

    int lastIndex = candidates.size() - 1;
    int startIndex = findNearestPointIndex(gestureStartY, candidates);
    float dragDelta = value - gestureStartY;
    float absDragDelta = Math.abs(dragDelta);
    float absVelocity = Math.abs(velocityY);

    if (absDragDelta <= STEP_SNAP_SMALL_DRAG_PX) {
      return candidates.get(startIndex).value;
    }

    int dragDirection =
      absDragDelta >= STEP_SNAP_DIRECTION_EPSILON_PX ? (dragDelta > 0f ? 1 : -1) : 0;
    int velocityDirection =
      absVelocity >= STEP_SNAP_DIRECTION_VELOCITY_EPS_PX_PER_S ? (velocityY > 0f ? 1 : -1) : 0;

    if (
      dragDirection != 0 &&
      velocityDirection != 0 &&
      dragDirection != velocityDirection &&
      absVelocity >= STEP_SNAP_REVERSAL_CANCEL_VELOCITY_PX_PER_S &&
      absDragDelta <= STEP_SNAP_REVERSAL_CANCEL_DRAG_PX
    ) {
      return candidates.get(startIndex).value;
    }

    int direction = dragDirection;
    if (
      velocityDirection != 0 &&
      (direction == 0 || absVelocity >= STEP_SNAP_DIRECTION_VELOCITY_OVERRIDE_PX_PER_S)
    ) {
      direction = velocityDirection;
    }

    if (direction == 0) {
      return candidates.get(startIndex).value;
    }

    int nextIndex = Math.min(Math.max(startIndex + direction, 0), lastIndex);
    if (nextIndex == startIndex) {
      return candidates.get(startIndex).value;
    }

    float distanceToNext = Math.max(
      1f,
      Math.abs(candidates.get(nextIndex).value - candidates.get(startIndex).value)
    );
    float rawProgress =
      direction > 0
        ? (value - candidates.get(startIndex).value) / distanceToNext
        : (candidates.get(startIndex).value - value) / distanceToNext;
    float progressTowardDirection = Math.max(0f, rawProgress);
    boolean hasStepIntent =
      progressTowardDirection >= STEP_SNAP_PROGRESS_FOR_STEP ||
      absDragDelta >= STEP_SNAP_DRAG_PX ||
      absVelocity >= STEP_SNAP_VELOCITY_PX_PER_S;
    if (!hasStepIntent) {
      return candidates.get(startIndex).value;
    }

    boolean hasSkipIntent =
      absDragDelta >= STEP_SNAP_SKIP_DRAG_PX ||
      (progressTowardDirection >= STEP_SNAP_PROGRESS_FOR_SKIP &&
        absDragDelta >= STEP_SNAP_SKIP_DRAG_PX * 0.66f) ||
      (absVelocity >= STEP_SNAP_SKIP_VELOCITY_PX_PER_S &&
        progressTowardDirection >= STEP_SNAP_SKIP_MIN_PROGRESS &&
        absDragDelta >= STEP_SNAP_SKIP_DRAG_PX * 0.55f);
    int targetIndex = Math.min(Math.max(startIndex + direction * (hasSkipIntent ? 2 : 1), 0), lastIndex);

    return candidates.get(targetIndex).value;
  }

  private void applySnap(String snapPoint, boolean emitEvent) {
    currentSnapPoint = snapPoint;
    float y = resolveSnapValue(snapPoint);
    setTranslationY(y);
    if (emitEvent) {
      emitSheetY(y);
      emitSnapChange(snapPoint, "programmatic");
    }
  }

  private void animateSheet(float targetY, String snapPoint, String source) {
    stopAnimation();
    animator = ValueAnimator.ofFloat(getTranslationY(), targetY);
    animator.setDuration(340L);
    animator.setInterpolator(new OvershootInterpolator(0.7f));
    animator.addUpdateListener((valueAnimator) -> {
      float nextY = (float) valueAnimator.getAnimatedValue();
      setTranslationY(nextY);
    });
    animator.addListener(new android.animation.AnimatorListenerAdapter() {
      @Override
      public void onAnimationEnd(android.animation.Animator animation) {
        animator = null;
        setTranslationY(targetY);
        emitSheetY(targetY);
        emitActiveEvent("settle_state", false);
        emitSnapChange(snapPoint, source);
      }
    });
    animator.start();
  }

  private void stopAnimation() {
    if (animator != null) {
      animator.cancel();
      animator = null;
    }
  }

  private void recycleVelocityTracker() {
    if (velocityTracker == null) {
      return;
    }
    velocityTracker.recycle();
    velocityTracker = null;
  }

  private void notifySnapStart(String snapPoint, String source) {
    emitSnapStart(snapPoint, source);
  }

  private void emitSheetY(float sheetY) {
    WritableMap event = Arguments.createMap();
    event.putString("eventType", "sheet_y");
    event.putDouble("sheetY", sheetY);
    dispatchEvent(event);
  }

  private void emitSnapStart(String snapPoint, String source) {
    emitEvent("snap_start", snapPoint, source, null);
  }

  private void emitSnapChange(String snapPoint, String source) {
    emitEvent("snap_change", snapPoint, source, null);
  }

  private void emitActiveEvent(String eventType, boolean isActive) {
    emitEvent(eventType, null, null, isActive);
  }

  private void emitEvent(
    String eventType,
    @Nullable String snapPoint,
    @Nullable String source,
    @Nullable Boolean isActive
  ) {
    WritableMap event = Arguments.createMap();
    event.putString("eventType", eventType);
    if (snapPoint != null) {
      event.putString("snap", snapPoint);
    }
    if (source != null) {
      event.putString("source", source);
    }
    if (isActive != null) {
      event.putBoolean("isActive", isActive);
    }
    dispatchEvent(event);
  }

  private void dispatchEvent(WritableMap event) {
    if (getId() == NO_ID) {
      return;
    }
    reactContext
      .getJSModule(RCTEventEmitter.class)
      .receiveEvent(getId(), EVENT_SHEET_HOST, event);
  }
}
