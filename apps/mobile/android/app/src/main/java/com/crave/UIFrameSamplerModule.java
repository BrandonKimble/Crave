package com.crave;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import android.content.Context;
import android.view.Display;
import android.view.Choreographer;
import android.os.Handler;
import android.os.Looper;
import android.view.WindowManager;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import java.util.ArrayList;
import java.util.Collections;

public class UIFrameSamplerModule extends ReactContextBaseJavaModule {
  private static final String MODULE_NAME = "UIFrameSampler";
  private static final String WINDOW_EVENT_NAME = "uiFrameSamplerWindow";
  private static final String STALL_EVENT_NAME = "uiFrameSamplerStall";
  private static final double DEFAULT_WINDOW_MS = 500d;
  private static final double DEFAULT_STALL_FRAME_MS = 80d;
  private static final double DEFAULT_LOG_ONLY_BELOW_FPS = 58d;
  private static final double MAX_FRAME_MS = 5000d;
  private static final double MIN_WINDOW_MS = 120d;
  private static final double MAX_WINDOW_MS = 60000d;
  private static final double MIN_FPS_THRESHOLD = 1d;
  private static final double MAX_FPS_THRESHOLD = 240d;
  private static final double MIN_STALL_FRAME_MS = 16d;

  private final Handler mainHandler = new Handler(Looper.getMainLooper());
  private final Choreographer.FrameCallback frameCallback =
    new Choreographer.FrameCallback() {
      @Override
      public void doFrame(long frameTimeNanos) {
        handleFrame(frameTimeNanos);
      }
    };

  private boolean running = false;
  private volatile int listenerCount = 0;
  private double windowMs = DEFAULT_WINDOW_MS;
  private double stallFrameMs = DEFAULT_STALL_FRAME_MS;
  private double logOnlyBelowFps = DEFAULT_LOG_ONLY_BELOW_FPS;
  private double displayHz = 60d;
  private long lastFrameTimeNanos = 0L;
  private long windowStartedAtNanos = 0L;
  private final ArrayList<Double> frameDurationsMs = new ArrayList<>();
  private int stallCount = 0;
  private double stallLongestMs = 0d;

  public UIFrameSamplerModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @NonNull
  @Override
  public String getName() {
    return MODULE_NAME;
  }

  @ReactMethod
  public void start(@Nullable ReadableMap options) {
    final double nextWindowMs =
      options != null && options.hasKey("windowMs") && !options.isNull("windowMs")
        ? clamp(options.getDouble("windowMs"), MIN_WINDOW_MS, MAX_WINDOW_MS)
        : DEFAULT_WINDOW_MS;
    final double nextStallFrameMs =
      options != null && options.hasKey("stallFrameMs") && !options.isNull("stallFrameMs")
        ? clamp(options.getDouble("stallFrameMs"), MIN_STALL_FRAME_MS, MAX_FRAME_MS)
        : DEFAULT_STALL_FRAME_MS;
    final double nextLogOnlyBelowFps =
      options != null && options.hasKey("logOnlyBelowFps") && !options.isNull("logOnlyBelowFps")
        ? clamp(options.getDouble("logOnlyBelowFps"), MIN_FPS_THRESHOLD, MAX_FPS_THRESHOLD)
        : DEFAULT_LOG_ONLY_BELOW_FPS;
    mainHandler.post(() -> startOnMain(nextWindowMs, nextStallFrameMs, nextLogOnlyBelowFps));
  }

  private void startOnMain(double nextWindowMs, double nextStallFrameMs, double nextLogOnlyBelowFps) {
    windowMs = nextWindowMs;
    stallFrameMs = nextStallFrameMs;
    logOnlyBelowFps = nextLogOnlyBelowFps;
    displayHz = resolveDisplayRefreshRate();
    resetWindow();
    if (!running) {
      running = true;
      Choreographer.getInstance().postFrameCallback(frameCallback);
    }
  }

  @ReactMethod
  public void stop() {
    mainHandler.post(this::stopOnMain);
  }

  private void stopOnMain() {
    if (!running) {
      return;
    }
    running = false;
    Choreographer.getInstance().removeFrameCallback(frameCallback);
    resetWindow();
  }

  @ReactMethod
  public void addListener(String eventName) {
    if (WINDOW_EVENT_NAME.equals(eventName) || STALL_EVENT_NAME.equals(eventName)) {
      listenerCount += 1;
    }
  }

  @ReactMethod
  public void removeListeners(double count) {
    listenerCount = Math.max(0, listenerCount - (int) count);
  }

  private void handleFrame(long frameTimeNanos) {
    if (!running) {
      return;
    }
    if (windowStartedAtNanos == 0L) {
      windowStartedAtNanos = frameTimeNanos;
    }
    if (lastFrameTimeNanos != 0L) {
      double frameMs = (frameTimeNanos - lastFrameTimeNanos) / 1_000_000d;
      if (frameMs > 0d && frameMs <= MAX_FRAME_MS && Double.isFinite(frameMs)) {
        frameDurationsMs.add(frameMs);
        if (frameMs >= stallFrameMs) {
          stallCount += 1;
          stallLongestMs = Math.max(stallLongestMs, frameMs);
          emitStall(frameTimeNanos, frameMs);
        }
      }
    }
    lastFrameTimeNanos = frameTimeNanos;
    double elapsedMs = (frameTimeNanos - windowStartedAtNanos) / 1_000_000d;
    if (elapsedMs >= windowMs && !frameDurationsMs.isEmpty()) {
      emitWindow(frameTimeNanos, elapsedMs);
      resetWindow(frameTimeNanos);
    }
    Choreographer.getInstance().postFrameCallback(frameCallback);
  }

  private void emitWindow(long nowNanos, double elapsedMs) {
    ArrayList<Double> sortedDurations = new ArrayList<>(frameDurationsMs);
    Collections.sort(sortedDurations);
    double totalFrameMs = 0d;
    double maxFrameMs = 0d;
    for (double frameMs : frameDurationsMs) {
      totalFrameMs += frameMs;
      maxFrameMs = Math.max(maxFrameMs, frameMs);
    }
    int frameCount = frameDurationsMs.size();
    double avgFrameMs = totalFrameMs / frameCount;
    double p95FrameMs = percentile(sortedDurations, 0.95d);
    double avgFps = avgFrameMs > 0d ? 1000d / avgFrameMs : 0d;
    double floorFps = maxFrameMs > 0d ? 1000d / maxFrameMs : 0d;
    if (!hasListeners() || (stallCount == 0 && avgFps >= logOnlyBelowFps && floorFps >= logOnlyBelowFps)) {
      return;
    }
    WritableMap event = Arguments.createMap();
    event.putString("event", "window");
    event.putDouble("nowMs", nowNanos / 1_000_000d);
    event.putDouble("windowMs", round1(elapsedMs));
    event.putInt("frameCount", frameCount);
    event.putDouble("avgFrameMs", round1(avgFrameMs));
    event.putDouble("avgFps", round1(avgFps));
    event.putDouble("floorFps", round1(floorFps));
    event.putDouble("p95FrameMs", round1(p95FrameMs));
    event.putDouble("p95Fps", round1(p95FrameMs > 0d ? 1000d / p95FrameMs : 0d));
    event.putDouble("maxFrameMs", round1(maxFrameMs));
    event.putInt("stallCount", stallCount);
    event.putDouble("stallLongestMs", round1(stallLongestMs));
    double expectedFrameMs = 1000d / Math.max(1d, displayHz);
    double expectedFrames = elapsedMs / expectedFrameMs;
    double droppedFrameEstimate = Math.max(0d, expectedFrames - frameCount);
    event.putDouble("droppedFrameEstimate", round1(droppedFrameEstimate));
    event.putDouble("droppedFrameRatio", round3(droppedFrameEstimate / Math.max(1d, expectedFrames)));
    event.putDouble("displayHz", round1(displayHz));
    emit(WINDOW_EVENT_NAME, event);
  }

  private void emitStall(long nowNanos, double frameMs) {
    if (!hasListeners()) {
      return;
    }
    WritableMap stallEvent = Arguments.createMap();
    stallEvent.putString("event", "stall");
    stallEvent.putDouble("nowMs", round1(nowNanos / 1_000_000d));
    stallEvent.putDouble("frameMs", round1(frameMs));
    stallEvent.putDouble("fps", round1(1000d / frameMs));
    emit(STALL_EVENT_NAME, stallEvent);
  }

  private void resetWindow() {
    resetWindow(0L);
  }

  private void resetWindow(long nextWindowStartedAtNanos) {
    windowStartedAtNanos = nextWindowStartedAtNanos;
    lastFrameTimeNanos = nextWindowStartedAtNanos;
    frameDurationsMs.clear();
    stallCount = 0;
    stallLongestMs = 0d;
  }

  private double percentile(ArrayList<Double> sortedValues, double percentile) {
    if (sortedValues.isEmpty()) {
      return 0d;
    }
    int index = (int) Math.ceil(percentile * sortedValues.size()) - 1;
    index = Math.max(0, Math.min(sortedValues.size() - 1, index));
    return sortedValues.get(index);
  }

  private double resolveDisplayRefreshRate() {
    WindowManager windowManager =
      (WindowManager) getReactApplicationContext().getSystemService(Context.WINDOW_SERVICE);
    if (windowManager != null) {
      Display display = windowManager.getDefaultDisplay();
      if (display != null && display.getRefreshRate() > 0f) {
        return display.getRefreshRate();
      }
    }
    return 60d;
  }

  private boolean hasListeners() {
    return listenerCount > 0;
  }

  private double clamp(double value, double min, double max) {
    return Math.min(max, Math.max(min, value));
  }

  private double round1(double value) {
    return Math.round(value * 10d) / 10d;
  }

  private double round3(double value) {
    return Math.round(value * 1000d) / 1000d;
  }

  private void emit(String eventName, WritableMap event) {
    ReactApplicationContext context = getReactApplicationContext();
    if (!context.hasActiveCatalystInstance()) {
      return;
    }
    context
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
      .emit(eventName, event);
  }
}
