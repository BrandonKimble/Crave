package com.crave;

import android.content.Context;
import android.graphics.RectF;
import android.view.MotionEvent;
import android.view.View;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.events.RCTEventEmitter;

import java.lang.ref.WeakReference;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;

public class SearchChromeNativeHitTargetSurface extends View {
  public static final String EVENT_TOUCH_TARGET_PRESS = "topSearchChromeNativeHitTargetPress";

  private static final ConcurrentHashMap<String, WeakReference<SearchChromeNativeHitTargetSurface>>
    SURFACES_BY_KEY = new ConcurrentHashMap<>();
  private static final ConcurrentHashMap<String, List<TouchRegion>> PENDING_REGIONS_BY_KEY =
    new ConcurrentHashMap<>();

  @NonNull private final ThemedReactContext reactContext;
  private final List<TouchRegion> regions = new ArrayList<>();

  @Nullable private String hostKey = null;
  @Nullable private String activeTargetId = null;

  private static final class TouchRegion {
    final String targetId;
    final RectF frame;
    final boolean enabled;

    TouchRegion(String targetId, RectF frame, boolean enabled) {
      this.targetId = targetId;
      this.frame = frame;
      this.enabled = enabled;
    }
  }

  public SearchChromeNativeHitTargetSurface(Context context) {
    super(context);
    reactContext = (ThemedReactContext) context;
    setWillNotDraw(true);
    setClickable(false);
    setEnabled(false);
  }

  public void setHostKey(@Nullable String nextHostKey) {
    if ((hostKey == null && nextHostKey == null) || (hostKey != null && hostKey.equals(nextHostKey))) {
      return;
    }
    unregisterHostKey();
    hostKey = nextHostKey;
    registerHostKey();
  }

  public static void syncRegions(@NonNull String hostKey, @Nullable ReadableArray payloadRegions) {
    List<TouchRegion> nextRegions = parseRegions(payloadRegions);
    PENDING_REGIONS_BY_KEY.put(hostKey, nextRegions);

    WeakReference<SearchChromeNativeHitTargetSurface> surfaceReference = SURFACES_BY_KEY.get(hostKey);
    SearchChromeNativeHitTargetSurface surface =
      surfaceReference != null ? surfaceReference.get() : null;
    if (surface != null) {
      surface.post(() -> surface.applyRegions(nextRegions));
    }
  }

  public void applyRegions(@NonNull List<TouchRegion> nextRegions) {
    regions.clear();
    regions.addAll(nextRegions);
    setEnabled(hasEnabledRegion());
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
  public boolean onTouchEvent(MotionEvent event) {
    String targetId = targetIdAt(event.getX(), event.getY());
    switch (event.getActionMasked()) {
      case MotionEvent.ACTION_DOWN:
        activeTargetId = targetId;
        return activeTargetId != null;
      case MotionEvent.ACTION_UP:
        if (activeTargetId != null && activeTargetId.equals(targetId)) {
          emitTargetPress(activeTargetId);
          activeTargetId = null;
          return true;
        }
        activeTargetId = null;
        return false;
      case MotionEvent.ACTION_CANCEL:
        activeTargetId = null;
        return false;
      default:
        return activeTargetId != null;
    }
  }

  private void registerHostKey() {
    if (hostKey == null || !isAttachedToWindow()) {
      return;
    }
    SURFACES_BY_KEY.put(hostKey, new WeakReference<>(this));
    List<TouchRegion> pendingRegions = PENDING_REGIONS_BY_KEY.get(hostKey);
    if (pendingRegions != null) {
      post(() -> applyRegions(pendingRegions));
    }
  }

  private void unregisterHostKey() {
    if (hostKey == null) {
      return;
    }
    WeakReference<SearchChromeNativeHitTargetSurface> surfaceReference = SURFACES_BY_KEY.get(hostKey);
    SearchChromeNativeHitTargetSurface surface =
      surfaceReference != null ? surfaceReference.get() : null;
    if (surface == this) {
      SURFACES_BY_KEY.remove(hostKey);
    }
  }

  private boolean hasEnabledRegion() {
    for (TouchRegion region : regions) {
      if (region.enabled) {
        return true;
      }
    }
    return false;
  }

  @Nullable
  private String targetIdAt(float x, float y) {
    for (TouchRegion region : regions) {
      if (region.enabled && region.frame.contains(x, y)) {
        return region.targetId;
      }
    }
    return null;
  }

  private void emitTargetPress(@NonNull String targetId) {
    WritableMap event = Arguments.createMap();
    event.putString("targetId", targetId);
    reactContext
      .getJSModule(RCTEventEmitter.class)
      .receiveEvent(getId(), EVENT_TOUCH_TARGET_PRESS, event);
  }

  @NonNull
  private static List<TouchRegion> parseRegions(@Nullable ReadableArray payloadRegions) {
    List<TouchRegion> nextRegions = new ArrayList<>();
    if (payloadRegions == null) {
      return nextRegions;
    }
    for (int index = 0; index < payloadRegions.size(); index += 1) {
      ReadableMap region = payloadRegions.getMap(index);
      if (region == null || !region.hasKey("targetId")) {
        continue;
      }
      String targetId = region.getString("targetId");
      if (targetId == null) {
        continue;
      }
      float x = region.hasKey("x") ? (float) region.getDouble("x") : 0f;
      float y = region.hasKey("y") ? (float) region.getDouble("y") : 0f;
      float width = region.hasKey("width") ? (float) region.getDouble("width") : 0f;
      float height = region.hasKey("height") ? (float) region.getDouble("height") : 0f;
      boolean enabled = region.hasKey("enabled") && region.getBoolean("enabled");
      nextRegions.add(
        new TouchRegion(
          targetId,
          new RectF(x, y, x + Math.max(0f, width), y + Math.max(0f, height)),
          enabled
        )
      );
    }
    return nextRegions;
  }
}
