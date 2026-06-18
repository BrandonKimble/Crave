package com.crave;

import androidx.annotation.NonNull;

import android.graphics.RectF;
import android.view.MotionEvent;
import android.view.View;
import android.os.Handler;
import android.os.Looper;

import com.mapbox.common.Cancelable;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.ReadableMapKeySetIterator;
import com.facebook.react.bridge.ReadableType;
import com.facebook.react.bridge.UIManager;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import com.facebook.react.uimanager.UIManagerHelper;
import com.facebook.react.uimanager.common.UIManagerType;
import com.mapbox.bindgen.Value;
import com.mapbox.bindgen.Expected;
import com.mapbox.geojson.Feature;
import com.mapbox.geojson.FeatureCollection;
import com.mapbox.geojson.Point;
import com.mapbox.maps.CameraChanged;
import com.mapbox.maps.CameraChangedCallback;
import com.mapbox.maps.CoordinateBounds;
import com.mapbox.maps.SourceDataLoaded;
import com.mapbox.maps.SourceDataLoadedCallback;
import com.mapbox.maps.StyleLoadedCallback;
import com.mapbox.maps.Style;
import com.mapbox.maps.QueriedRenderedFeature;
import com.mapbox.maps.QueryRenderedFeaturesCallback;
import com.mapbox.maps.RenderedQueryGeometry;
import com.mapbox.maps.RenderedQueryOptions;
import com.mapbox.maps.ScreenBox;
import com.mapbox.maps.ScreenCoordinate;
import com.mapbox.maps.MapboxMap;
import com.mapbox.maps.plugin.delegates.listeners.OnMapIdleListener;
import com.rnmapbox.rnmbx.components.mapview.RNMBXMapView;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonNull;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.google.gson.JsonPrimitive;

import org.json.JSONArray;
import org.json.JSONObject;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.util.AbstractMap;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeSet;
import java.util.concurrent.ConcurrentHashMap;

public class SearchMapRenderControllerModule extends ReactContextBaseJavaModule {
  private static final long FNV1A64_OFFSET_BASIS = 0xcbf29ce484222325L;
  private static final long FNV1A64_PRIME = 0x100000001b3L;
  private static final String MODULE_NAME = "SearchMapRenderController";
  private static final String EVENT_NAME = "searchMapRenderControllerEvent";
  private static final boolean ENABLE_VISUAL_DIAGNOSTICS = false;
  private static final long REVEAL_SETTLE_DELAY_MS = 300L;
  private static final long DISMISS_SETTLE_DELAY_MS = 300L;
  private static final double NATIVE_PRESS_CANCEL_MOVEMENT_THRESHOLD_PX = 10d;

  private static final class LabelTapHitboxConfig {
    final double textSize;
    final double radialXEm;
    final double radialYEm;
    final double radialTopEm;
    final double upShiftEm;
    final double charWidthFactor;
    final double lineHeightFactor;
    final double paddingPx;
    final double minWidthPx;
    final double maxWidthPx;

    LabelTapHitboxConfig(
      double textSize,
      double radialXEm,
      double radialYEm,
      double radialTopEm,
      double upShiftEm,
      double charWidthFactor,
      double lineHeightFactor,
      double paddingPx,
      double minWidthPx,
      double maxWidthPx
    ) {
      this.textSize = textSize;
      this.radialXEm = radialXEm;
      this.radialYEm = radialYEm;
      this.radialTopEm = radialTopEm;
      this.upShiftEm = upShiftEm;
      this.charWidthFactor = charWidthFactor;
      this.lineHeightFactor = lineHeightFactor;
      this.paddingPx = paddingPx;
      this.minWidthPx = minWidthPx;
      this.maxWidthPx = maxWidthPx;
    }
  }

  private static final class NativePressTargetConfig {
    boolean enabled = false;
    ArrayList<String> pinLayerIds = new ArrayList<>();
    ArrayList<String> labelLayerIds = new ArrayList<>();
    LabelTapHitboxConfig labelTapHitbox = null;
    ArrayList<String> dotLayerIds = new ArrayList<>();
    double dotTapIntentRadiusPx = 0d;
  }

  private static final class NativePressContext {
    final String instanceId;
    final InstanceState state;
    final NativePressTargetConfig config;

    NativePressContext(String instanceId, InstanceState state, NativePressTargetConfig config) {
      this.instanceId = instanceId;
      this.state = state;
      this.config = config;
    }
  }

  private static final class NativePressSession {
    final int sequence;
    final String instanceId;
    final double startedAtMs;
    final double startX;
    final double startY;
    double latestX;
    double latestY;
    WritableMap resolvedTarget;
    boolean didResolve = false;
    boolean didRelease = false;
    boolean didCancel = false;

    NativePressSession(int sequence, String instanceId, double startedAtMs, double startX, double startY) {
      this.sequence = sequence;
      this.instanceId = instanceId;
      this.startedAtMs = startedAtMs;
      this.startX = startX;
      this.startY = startY;
      this.latestX = startX;
      this.latestY = startY;
    }
  }

  private interface PressTargetResolutionCallback {
    void resolve(WritableMap target);
    void reject(String code, String message, Throwable error);
  }
  private static final long FRAME_SETTLE_FALLBACK_DELAY_MS = 96L;
  private static final long SOURCE_RECOVERY_RETRY_DELAY_MS = 32L;
  private static final long LIVE_PIN_TRANSITION_DURATION_MS = 300L;
  private static final long DEFERRED_DISMISS_SOURCE_CLEANUP_DELAY_MS = 760L;
  private static final double REVEAL_PREROLL_PLACEMENT_OPACITY = 0.001d;
  private static final double SLOW_ACTION_THRESHOLD_MS = 40d;
  private static final double NATIVE_VIEWPORT_EVENT_THROTTLE_MS = 16d;
  private static final String VISUAL_SOURCE_HIDDEN = "hidden";
  private static final String VISUAL_SOURCE_PREPARING_REVEAL = "preparingReveal";
  private static final String VISUAL_SOURCE_REVEALING = "revealing";
  private static final String VISUAL_SOURCE_VISIBLE = "visible";
  private static final String VISUAL_SOURCE_DISMISSING = "dismissing";
  private static final Set<String> TRANSIENT_VISUAL_PROPERTY_KEYS = Collections.unmodifiableSet(
    new HashSet<>(
      Arrays.asList(
        "nativeDotOpacity",
        "nativeHighlighted",
        "nativeLabelOpacity",
        "nativeLodOpacity",
        "nativeLodRankOpacity",
        "nativePresentationOpacity"
      )
    )
  );

  private enum SourceLifecyclePhase {
    UNINITIALIZED,
    INCREMENTAL
  }

  private enum SourceMutationMode {
    NONE,
    BASELINE_REPLACE,
    INCREMENTAL_PATCH
  }

  private static final class SourceState {
    SourceLifecyclePhase lifecyclePhase = SourceLifecyclePhase.UNINITIALIZED;
    String sourceRevision = "";
    String featureStateRevision = "";
    final Map<String, String> featureStateEntryRevisionById = new HashMap<>();
    final Set<String> featureStateChangedIds = new LinkedHashSet<>();
    final ArrayList<String> idsInOrder = new ArrayList<>();
    final Set<String> featureIds = new LinkedHashSet<>();
    final ArrayList<String> addedFeatureIdsInOrder = new ArrayList<>();
    final ArrayList<String> updatedFeatureIdsInOrder = new ArrayList<>();
    final Set<String> removedFeatureIds = new LinkedHashSet<>();
    final Map<String, String> diffKeyById = new HashMap<>();
    final Map<String, String> markerKeyByFeatureId = new HashMap<>();
    final Map<String, HashMap<String, Value>> featureStateById = new HashMap<>();
  }

  private static final class MutationSummary {
    final int addCount;
    final int updateCount;
    final int removeCount;
    final String dataId;
    final List<String> addedFeatureIds;

    MutationSummary(int addCount, int updateCount, int removeCount, String dataId, List<String> addedFeatureIds) {
      this.addCount = addCount;
      this.updateCount = updateCount;
      this.removeCount = removeCount;
      this.dataId = dataId;
      this.addedFeatureIds = addedFeatureIds;
    }

    boolean hasMutations() {
      return addCount > 0 || updateCount > 0 || removeCount > 0;
    }
  }

  private static final class AppliedSourceUpdate {
    final SourceState sourceState;
    final MutationSummary mutationSummary;

    AppliedSourceUpdate(SourceState sourceState, MutationSummary mutationSummary) {
      this.sourceState = sourceState;
      this.mutationSummary = mutationSummary;
    }
  }

  private static final class ParsedCollectionApplyPlan {
    final String sourceId;
    final ParsedFeatureCollection next;
    final SourceState previousSourceState;
    final Map<String, HashMap<String, Value>> previousFeatureStateById;
    final String previousFeatureStateRevision;
    final boolean forceReplaceSourceData;

    ParsedCollectionApplyPlan(
      String sourceId,
      ParsedFeatureCollection next,
      SourceState previousSourceState,
      Map<String, HashMap<String, Value>> previousFeatureStateById,
      String previousFeatureStateRevision
    ) {
      this(sourceId, next, previousSourceState, previousFeatureStateById, previousFeatureStateRevision, false);
    }

    ParsedCollectionApplyPlan(
      String sourceId,
      ParsedFeatureCollection next,
      SourceState previousSourceState,
      Map<String, HashMap<String, Value>> previousFeatureStateById,
      String previousFeatureStateRevision,
      boolean forceReplaceSourceData
    ) {
      this.sourceId = sourceId;
      this.next = next;
      this.previousSourceState = previousSourceState;
      this.previousFeatureStateById = previousFeatureStateById;
      this.previousFeatureStateRevision = previousFeatureStateRevision;
      this.forceReplaceSourceData = forceReplaceSourceData;
    }
  }

  private static final class ResolvedParsedCollectionApplyPlan {
    final String sourceId;
    final ParsedFeatureCollection next;
    final SourceLifecyclePhase previousSourceLifecyclePhase;
    final String previousSourceRevision;
    final Map<String, HashMap<String, Value>> previousFeatureStateById;
    final String previousFeatureStateRevision;
    final SourceState nextSourceState;
    final boolean forceReplaceSourceData;

    ResolvedParsedCollectionApplyPlan(
      String sourceId,
      ParsedFeatureCollection next,
      SourceLifecyclePhase previousSourceLifecyclePhase,
      String previousSourceRevision,
      Map<String, HashMap<String, Value>> previousFeatureStateById,
      String previousFeatureStateRevision,
      SourceState nextSourceState,
      boolean forceReplaceSourceData
    ) {
      this.sourceId = sourceId;
      this.next = next;
      this.previousSourceLifecyclePhase = previousSourceLifecyclePhase;
      this.previousSourceRevision = previousSourceRevision;
      this.previousFeatureStateById = previousFeatureStateById;
      this.previousFeatureStateRevision = previousFeatureStateRevision;
      this.nextSourceState = nextSourceState;
      this.forceReplaceSourceData = forceReplaceSourceData;
    }
  }

  private static final class ResolvedSourceMutationPlan {
    final String sourceId;
    final SourceLifecyclePhase previousSourceLifecyclePhase;
    final String previousSourceRevision;
    final ParsedFeatureCollection next;
    final SourceMutationMode mutationMode;
    final MutationSummary mutationSummary;
    final String dataId;

    ResolvedSourceMutationPlan(
      String sourceId,
      SourceLifecyclePhase previousSourceLifecyclePhase,
      String previousSourceRevision,
      ParsedFeatureCollection next,
      SourceMutationMode mutationMode,
      MutationSummary mutationSummary,
      String dataId
    ) {
      this.sourceId = sourceId;
      this.previousSourceLifecyclePhase = previousSourceLifecyclePhase;
      this.previousSourceRevision = previousSourceRevision;
      this.next = next;
      this.mutationMode = mutationMode;
      this.mutationSummary = mutationSummary;
      this.dataId = dataId;
    }
  }

  private static final class PreparedDerivedPinAndLabelOutput {
    final List<ParsedCollectionApplyPlan> plans;
    final List<String> pinSourceIds;
    final long pinStartedAtNs;

    PreparedDerivedPinAndLabelOutput(
      List<ParsedCollectionApplyPlan> plans,
      List<String> pinSourceIds,
      long pinStartedAtNs
    ) {
      this.plans = plans;
      this.pinSourceIds = pinSourceIds;
      this.pinStartedAtNs = pinStartedAtNs;
    }
  }

  private static final class FeatureStateApply {
    final String sourceId;
    final String featureId;
    final HashMap<String, Value> state;

    FeatureStateApply(String sourceId, String featureId, HashMap<String, Value> state) {
      this.sourceId = sourceId;
      this.featureId = featureId;
      this.state = state;
    }
  }

  private static final class PreparedDerivedDotOutput {
    final List<ParsedCollectionApplyPlan> plans;
    final String dotSourceId;

    PreparedDerivedDotOutput(List<ParsedCollectionApplyPlan> plans, String dotSourceId) {
      this.plans = plans;
      this.dotSourceId = dotSourceId;
    }
  }

  private static final class DerivedFamilyState {
    final ParsedFeatureCollection desiredCollection = new ParsedFeatureCollection();
    final ParsedFeatureCollection collection = new ParsedFeatureCollection();
    SourceState sourceState = new SourceState();
    final Map<String, HashMap<String, Value>> transientFeatureStateById = new HashMap<>();
    final PinFamilyRuntimeState pinRuntime = new PinFamilyRuntimeState();
    final DotFamilyRuntimeState dotRuntime = new DotFamilyRuntimeState();
    final LabelFamilyObservationState labelObservation = new LabelFamilyObservationState();
    final DesiredPinSnapshotState lastDesiredPinSnapshot = pinRuntime.lastDesiredSnapshot;
    final ParsedFeatureCollection lastDesiredCollection = dotRuntime.lastDesiredCollection;
    final Map<String, LivePinTransition> livePinTransitionsByMarkerKey = pinRuntime.liveTransitionsByMarkerKey;
    final Map<String, LiveDotTransition> liveDotTransitionsByMarkerKey = dotRuntime.liveTransitionsByMarkerKey;
    final Set<String> settledVisibleFeatureIds = labelObservation.settledVisibleFeatureIds;
  }

  private static final class PinFamilyRuntimeState {
    final DesiredPinSnapshotState lastDesiredSnapshot = new DesiredPinSnapshotState();
    final Map<String, LivePinTransition> liveTransitionsByMarkerKey = new HashMap<>();
  }

  private static final class DotFamilyRuntimeState {
    final ParsedFeatureCollection lastDesiredCollection = new ParsedFeatureCollection();
    final Map<String, LiveDotTransition> liveTransitionsByMarkerKey = new HashMap<>();
  }

  private static final class LabelFamilyObservationState {
    final Set<String> settledVisibleFeatureIds = new LinkedHashSet<>();
    boolean observationEnabled = false;
    boolean commitVisibleLabelHits = false;
    double refreshMsIdle = 0d;
    double refreshMsMoving = 0d;
    String configuredResetRequestKey = null;
    final ArrayList<String> lastVisibleLabelFeatureIds = new ArrayList<>();
    int lastLayerRenderedFeatureCount = 0;
    int lastEffectiveRenderedFeatureCount = 0;
    boolean hasCommittedObservationForConfiguredRequest = false;
    String lastResetRequestKey = null;
    boolean isRefreshInFlight = false;
    Double queuedRefreshDelayMs = null;
    int movingNoopRefreshStreak = 0;
    double movingAdaptiveRefreshMs = 0d;
  }

  private static final class ExecutionBatchRef {
    final String requestKey;
    final String batchId;
    final String generationId;

    ExecutionBatchRef(String requestKey, String batchId, String generationId) {
      this.requestKey = requestKey;
      this.batchId = batchId;
      this.generationId = generationId;
    }
  }

  private static final class EnterLaneState {
    String requestedRequestKey;
    ExecutionBatchRef mountedHidden;
    ExecutionBatchRef armed;
    ExecutionBatchRef entering;
    ExecutionBatchRef liveBaseline;
  }

  private static final class InstanceState {
    int mapTag;
    String pinSourceId;
    String pinInteractionSourceId;
    String dotSourceId;
    String labelSourceId;
    String labelCollisionSourceId;
    ArrayList<String> pinSlotSourceIds = new ArrayList<>();
    ArrayList<String> labelLayerIds = new ArrayList<>();
    ArrayList<String> labelCollisionLayerIds = new ArrayList<>();
    int lastPinCount;
    int lastDotCount;
    int lastLabelCount;
    String lastPresentationBatchPhase;
    String lastEnterRequestKey;
    EnterLaneState enterLane = new EnterLaneState();
    Double lastEnterStartToken;
    String lastEnterStartedRequestKey;
    String lastEnterSettledRequestKey;
    String lastDismissRequestKey;
    String currentPresentationRenderPhase;
    String visualSourceLifecycleState;
    boolean labelCollisionObstacleLayersVisible;
    String lastPresentationStateJson;
    String activeFrameGenerationId;
    String activeExecutionBatchId;
    String sourceReadyFrameGenerationId;
    String sourceReadyExecutionBatchId;
    String residentSourceFrameKey;
    String residentSourceDataKey;
    String highlightedMarkerKey;
    final Set<String> highlightedMarkerKeys = new LinkedHashSet<>();
    String highlightedRestaurantId;
    String interactionMode;
    NativePressTargetConfig nativePressTargetConfig = new NativePressTargetConfig();
    int ownerEpoch;
    boolean isOwnerInvalidated;
    boolean allowEmptyEnter = true;
    boolean keepSourcesHiddenUntilEnter = true;
    double currentPresentationOpacityTarget;
    double currentPresentationOpacityValue;
    long nextSourceCommitSequence;
    String pendingPresentationSettleRequestKey;
    String pendingPresentationSettleKind;
    String blockedEnterStartRequestKey;
    String blockedPresentationSettleRequestKey;
    String blockedPresentationSettleKind;
    final Map<String, Set<String>> blockedEnterStartCommitFenceDataIdsBySourceId = new HashMap<>();
    final Map<String, Set<String>> blockedPresentationCommitFenceDataIdsBySourceId = new HashMap<>();
    final Map<String, Set<String>> pendingSourceCommitDataIdsBySourceId = new HashMap<>();
    final Map<String, DerivedFamilyState> derivedFamilyStates = new HashMap<>();
    final Map<String, ParsedFeatureCollection> residentDesiredSourceCacheBySourceId = new HashMap<>();
    boolean currentViewportIsMoving = false;
    boolean isAwaitingSourceRecovery;
    boolean isReplayingSourceRecovery;
    Double sourceRecoveryPausedAtMs;
  }

  private static final class VisualFrameTransaction {
    String kind;
    String presentationPhase;
    String requestKey;
    String visualCycleKey;
    String readinessKey;
    String shortcutCoverageRequestKey;
    String markersRenderKey;
    String sourceFrameKey;
    String sourceDataKey;
    String sourceSnapshotKind;
  }

  private static final class VisualFrameSnapshotApplyResult {
    boolean didSyncResidentFrame;
    String sourceAdmissionOutcome;

    VisualFrameSnapshotApplyResult(boolean didSyncResidentFrame, String sourceAdmissionOutcome) {
      this.didSyncResidentFrame = didSyncResidentFrame;
      this.sourceAdmissionOutcome = sourceAdmissionOutcome;
    }
  }

  private static boolean sameExecutionBatch(ExecutionBatchRef left, ExecutionBatchRef right) {
    return
      left == right ||
      (
        left != null &&
        right != null &&
        Objects.equals(left.requestKey, right.requestKey) &&
        Objects.equals(left.batchId, right.batchId) &&
        Objects.equals(left.generationId, right.generationId)
      );
  }

  private static final class DesiredPinSnapshotState {
    String inputRevision = "";
    final ArrayList<String> pinIdsInOrder = new ArrayList<>();
    final Map<String, Feature> pinFeatureByMarkerKey = new HashMap<>();
    final Map<String, String> pinFeatureRevisionByMarkerKey = new HashMap<>();
    final Map<String, Feature> pinInteractionFeatureByMarkerKey = new HashMap<>();
    final Map<String, String> pinInteractionFeatureRevisionByMarkerKey = new HashMap<>();
    final Map<String, Integer> pinLodZByMarkerKey = new HashMap<>();
    final Map<String, ArrayList<FeatureRecord>> labelFeaturesByMarkerKey = new HashMap<>();
    final Map<String, String> labelMarkerKeyByFeatureId = new HashMap<>();
    final Map<String, String> labelFeatureRevisionByMarkerKey = new HashMap<>();
    final Map<String, Feature> labelCollisionFeatureByMarkerKey = new HashMap<>();
    final Map<String, String> labelCollisionFeatureRevisionByMarkerKey = new HashMap<>();
    final Set<String> dirtyPinMarkerKeys = new LinkedHashSet<>();
    final Set<String> dirtyPinInteractionMarkerKeys = new LinkedHashSet<>();
    final Set<String> dirtyLabelMarkerKeys = new LinkedHashSet<>();
    final Set<String> dirtyLabelCollisionMarkerKeys = new LinkedHashSet<>();
  }

  private static final class LivePinTransition {
    double startOpacity;
    double targetOpacity;
    double startedAtMs;
    double durationMs;
    boolean isAwaitingSourceCommit;
    String awaitingSourceDataId;
    Feature pinFeature;
    ArrayList<FeatureRecord> labelFeatures = new ArrayList<>();
    Feature pinInteractionFeature;
    int lodZ;
    int orderHint;
  }

  private static final class LiveDotTransition {
    double startOpacity;
    double targetOpacity;
    double startedAtMs;
    double durationMs;
    boolean isAwaitingSourceCommit;
    String awaitingSourceDataId;
    Feature dotFeature;
    int orderHint;
  }

  private static final class ParsedFeatureCollection {
    String baseSourceRevision = "";
    String baseFeatureStateRevision = "";
    String sourceRevision = "";
    String featureStateRevision = "";
    final Set<String> dirtyGroupIds = new LinkedHashSet<>();
    final Set<String> orderChangedGroupIds = new LinkedHashSet<>();
    final Set<String> removedGroupIds = new LinkedHashSet<>();
    final Map<String, String> featureStateEntryRevisionById = new HashMap<>();
    final Set<String> featureStateChangedIds = new LinkedHashSet<>();
    final Set<String> featureIds = new LinkedHashSet<>();
    final ArrayList<String> addedFeatureIdsInOrder = new ArrayList<>();
    final ArrayList<String> updatedFeatureIdsInOrder = new ArrayList<>();
    final Set<String> removedFeatureIds = new LinkedHashSet<>();
    final ArrayList<String> removedFeatureIdsInOrder = new ArrayList<>();
    final ArrayList<String> idsInOrder = new ArrayList<>();
    final Map<String, ArrayList<String>> groupedFeatureIdsByGroup = new HashMap<>();
    final ArrayList<String> groupOrder = new ArrayList<>();
    final Map<String, Feature> featureById = new HashMap<>();
    final Map<String, String> diffKeyById = new HashMap<>();
    final Map<String, HashMap<String, Value>> featureStateById = new HashMap<>();
    final Map<String, String> markerKeyByFeatureId = new HashMap<>();
    final ArrayList<Feature> addedFeatures = new ArrayList<>();
    final ArrayList<Feature> updatedFeatures = new ArrayList<>();
  }

  private static final class ParsedFeatureCollectionDelta {
    final String sourceId;
    final String mode;
    final ArrayList<String> nextFeatureIdsInOrder;
    final Set<String> removeIds;
    final Set<String> dirtyGroupIds;
    final Set<String> orderChangedGroupIds;
    final Set<String> removedGroupIds;
    final ParsedFeatureCollection upsertCollection;

    ParsedFeatureCollectionDelta(
      String sourceId,
      String mode,
      ArrayList<String> nextFeatureIdsInOrder,
      Set<String> removeIds,
      Set<String> dirtyGroupIds,
      Set<String> orderChangedGroupIds,
      Set<String> removedGroupIds,
      ParsedFeatureCollection upsertCollection
    ) {
      this.sourceId = sourceId;
      this.mode = mode;
      this.nextFeatureIdsInOrder = nextFeatureIdsInOrder;
      this.removeIds = removeIds;
      this.dirtyGroupIds = dirtyGroupIds;
      this.orderChangedGroupIds = orderChangedGroupIds;
      this.removedGroupIds = removedGroupIds;
      this.upsertCollection = upsertCollection;
    }
  }

  private static final class FeatureRecord {
    final String id;
    final Feature feature;

    FeatureRecord(String id, Feature feature) {
      this.id = id;
      this.feature = feature;
    }
  }

  private static final class LabelObservationResult {
    final ArrayList<String> visibleLabelFeatureIds = new ArrayList<>();
  }

  private interface StyleOperation {
    void run(Style style) throws Exception;
  }

  private interface StyleResultOperation<T> {
    T run(Style style) throws Exception;
  }

  private abstract static class ChainedPromise implements Promise {
    protected final Promise outerPromise;

    ChainedPromise(Promise outerPromise) {
      this.outerPromise = outerPromise;
    }

    @Override
    public void reject(String code, String message) {
      outerPromise.reject(code, message);
    }

    @Override
    public void reject(String code, Throwable throwable) {
      outerPromise.reject(code, throwable);
    }

    @Override
    public void reject(String code, String message, Throwable throwable) {
      outerPromise.reject(code, message, throwable);
    }

    @Override
    public void reject(Throwable throwable) {
      outerPromise.reject(throwable);
    }

    @Override
    public void reject(Throwable throwable, WritableMap userInfo) {
      outerPromise.reject(throwable, userInfo);
    }

    @Override
    public void reject(String code, WritableMap userInfo) {
      outerPromise.reject(code, userInfo);
    }

    @Override
    public void reject(String code, Throwable throwable, WritableMap userInfo) {
      outerPromise.reject(code, throwable, userInfo);
    }

    @Override
    public void reject(String code, String message, WritableMap userInfo) {
      outerPromise.reject(code, message, userInfo);
    }

    @Override
    public void reject(String code, String message, Throwable throwable, WritableMap userInfo) {
      outerPromise.reject(code, message, throwable, userInfo);
    }

    @Override
    @Deprecated
    public void reject(String message) {
      outerPromise.reject(message);
    }
  }

  private final Map<String, InstanceState> instances = new ConcurrentHashMap<>();
  private final Map<String, Runnable> enterSettleRunnables = new ConcurrentHashMap<>();
  private final Map<String, Runnable> dismissSettleRunnables = new ConcurrentHashMap<>();
  private final Map<String, Runnable> revealFrameFallbackRunnables = new ConcurrentHashMap<>();
  private final Map<String, Runnable> dismissFrameFallbackRunnables = new ConcurrentHashMap<>();
  private final Map<String, Runnable> deferredDismissSourceCleanupRunnables = new ConcurrentHashMap<>();
  private final Map<String, Runnable> sourceRecoveryRunnables = new ConcurrentHashMap<>();
  private final Map<String, Runnable> livePinTransitionRunnables = new ConcurrentHashMap<>();
  private final Map<String, Runnable> labelObservationRefreshRunnables = new ConcurrentHashMap<>();
  private final Map<String, Cancelable> sourceDataLoadedSubscriptions = new ConcurrentHashMap<>();
  private final Map<String, Cancelable> styleLoadedSubscriptions = new ConcurrentHashMap<>();
  private final Map<String, Cancelable> cameraChangedSubscriptions = new ConcurrentHashMap<>();
  private final Map<String, OnMapIdleListener> mapIdleListeners = new ConcurrentHashMap<>();
  private final Map<String, View.OnTouchListener> nativePressTouchListeners = new ConcurrentHashMap<>();
  private final Map<String, NativePressSession> nativePressSessions = new ConcurrentHashMap<>();
  private final Map<String, Integer> nativePressSequences = new ConcurrentHashMap<>();
  private final Map<String, String> lastNativeCameraDiagSignatureByMapKey = new ConcurrentHashMap<>();
  private int nextOwnerEpoch = 1;
  private final Map<String, Double> lastNativeCameraDiagAtMsByMapKey = new ConcurrentHashMap<>();
  private final Handler mainHandler = new Handler(Looper.getMainLooper());

  public SearchMapRenderControllerModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @NonNull
  @Override
  public String getName() {
    return MODULE_NAME;
  }

  private synchronized int allocateOwnerEpoch() {
    return nextOwnerEpoch++;
  }

  private void invalidateRenderOwner(String instanceId, InstanceState state, String reason) {
    if (state.isOwnerInvalidated) {
      return;
    }
    state.ownerEpoch = allocateOwnerEpoch();
    state.isOwnerInvalidated = true;
    state.activeFrameGenerationId = null;
    state.activeExecutionBatchId = null;
    state.sourceReadyFrameGenerationId = null;
    state.sourceReadyExecutionBatchId = null;
    state.residentSourceFrameKey = null;
    state.residentSourceDataKey = null;
    instances.put(instanceId, state);
    WritableMap event = Arguments.createMap();
    event.putString("type", "render_owner_invalidated");
    event.putString("instanceId", instanceId);
    event.putInt("ownerEpoch", state.ownerEpoch);
    event.putString("reason", reason);
    event.putDouble("invalidatedAtMs", nowMs());
    emit(event);
  }

  @ReactMethod
  public void attach(ReadableMap payload, Promise promise) {
    String instanceId = payload.hasKey("instanceId") ? payload.getString("instanceId") : null;
    if (instanceId == null) {
      promise.reject("search_map_render_controller_attach_invalid", "missing instanceId");
      return;
    }
    if (
      !payload.hasKey("mapTag") ||
      !payload.hasKey("pinSourceId") ||
      !payload.hasKey("pinInteractionSourceId") ||
      !payload.hasKey("dotSourceId") ||
      !payload.hasKey("labelSourceId") ||
      !payload.hasKey("labelCollisionSourceId")
    ) {
      promise.reject("search_map_render_controller_attach_invalid", "missing source ids");
      return;
    }
    ArrayList<String> pinSlotSourceIds = parseStringArray(payload, "pinSlotSourceIds");
    ArrayList<String> labelLayerIds = parseStringArray(payload, "labelLayerIds");
    ArrayList<String> labelCollisionLayerIds = parseStringArray(payload, "labelCollisionLayerIds");
    if (
      pinSlotSourceIds.isEmpty() ||
      labelLayerIds.isEmpty() ||
      labelCollisionLayerIds.isEmpty()
    ) {
      promise.reject("search_map_render_controller_attach_invalid", "missing promoted slot layer ids");
      return;
    }
    InstanceState state = new InstanceState();
    state.mapTag = payload.getInt("mapTag");
    state.pinSourceId = payload.getString("pinSourceId");
    state.pinInteractionSourceId = payload.getString("pinInteractionSourceId");
    state.dotSourceId = payload.getString("dotSourceId");
    state.labelSourceId = payload.getString("labelSourceId");
    state.labelCollisionSourceId = payload.getString("labelCollisionSourceId");
    state.pinSlotSourceIds = pinSlotSourceIds;
    state.labelLayerIds = labelLayerIds;
    state.labelCollisionLayerIds = labelCollisionLayerIds;
    initializeDerivedFamilyStates(state);
    state.lastPinCount = 0;
    state.lastDotCount = 0;
    state.lastLabelCount = 0;
    state.lastPresentationBatchPhase = "idle";
    state.lastEnterRequestKey = null;
    state.enterLane = new EnterLaneState();
    state.lastEnterStartToken = null;
    state.lastEnterStartedRequestKey = null;
    state.lastEnterSettledRequestKey = null;
    state.lastDismissRequestKey = null;
    state.currentPresentationRenderPhase = "idle";
    state.visualSourceLifecycleState = VISUAL_SOURCE_HIDDEN;
    state.labelCollisionObstacleLayersVisible = false;
    state.lastPresentationStateJson = null;
    state.activeFrameGenerationId = null;
    state.activeExecutionBatchId = null;
    state.sourceReadyFrameGenerationId = null;
    state.sourceReadyExecutionBatchId = null;
    state.residentSourceFrameKey = null;
    state.residentSourceDataKey = null;
    state.highlightedMarkerKey = null;
    state.interactionMode = "enabled";
    state.ownerEpoch = allocateOwnerEpoch();
    state.isOwnerInvalidated = false;
    state.keepSourcesHiddenUntilEnter = true;
    state.currentPresentationOpacityTarget = 1;
    state.currentPresentationOpacityValue = 0;
    state.nextSourceCommitSequence = 0L;
    state.pendingPresentationSettleRequestKey = null;
    state.pendingPresentationSettleKind = null;
    state.blockedEnterStartRequestKey = null;
    state.blockedPresentationSettleRequestKey = null;
    state.blockedPresentationSettleKind = null;
    instances.put(instanceId, state);
    try {
      ensureMapSubscriptions(state);
    } catch (Exception error) {
      instances.remove(instanceId);
      promise.reject(
        "search_map_render_controller_attach_failed",
        error.getMessage() != null ? error.getMessage() : "attach failed",
        error
      );
      return;
    }

    WritableMap event = Arguments.createMap();
    event.putString("type", "attached");
    event.putString("instanceId", instanceId);
    event.putInt("mapTag", state.mapTag);
    event.putInt("ownerEpoch", state.ownerEpoch);
    emit(event);
    promise.resolve(null);
  }

  @ReactMethod
  public void detach(String instanceId, Promise promise) {
    InstanceState removedState = instances.get(instanceId);
    Runnable pendingRevealRunnable = enterSettleRunnables.remove(instanceId);
    if (pendingRevealRunnable != null) {
      mainHandler.removeCallbacks(pendingRevealRunnable);
    }
    Runnable revealFrameFallback = revealFrameFallbackRunnables.remove(instanceId);
    if (revealFrameFallback != null) {
      mainHandler.removeCallbacks(revealFrameFallback);
    }
    Runnable pendingRunnable = dismissSettleRunnables.remove(instanceId);
    if (pendingRunnable != null) {
      mainHandler.removeCallbacks(pendingRunnable);
    }
    Runnable dismissFrameFallback = dismissFrameFallbackRunnables.remove(instanceId);
    if (dismissFrameFallback != null) {
      mainHandler.removeCallbacks(dismissFrameFallback);
    }
    Runnable deferredDismissSourceCleanup = deferredDismissSourceCleanupRunnables.remove(instanceId);
    if (deferredDismissSourceCleanup != null) {
      mainHandler.removeCallbacks(deferredDismissSourceCleanup);
    }
    Runnable sourceRecoveryRunnable = sourceRecoveryRunnables.remove(instanceId);
    if (sourceRecoveryRunnable != null) {
      mainHandler.removeCallbacks(sourceRecoveryRunnable);
    }
    Runnable labelObservationRefreshRunnable = labelObservationRefreshRunnables.remove(instanceId);
    if (labelObservationRefreshRunnable != null) {
      mainHandler.removeCallbacks(labelObservationRefreshRunnable);
    }
    cancelLivePinTransitionAnimation(instanceId);
    instances.remove(instanceId);
    if (removedState != null) {
      cleanupMapSubscriptionsIfUnused(removedState.mapTag);
    }
    WritableMap event = Arguments.createMap();
    event.putString("type", "detached");
    event.putString("instanceId", instanceId);
    emit(event);
    promise.resolve(null);
  }

  @ReactMethod
  public void setRenderFrame(ReadableMap payload, Promise promise) {
    String instanceId = payload.hasKey("instanceId") ? payload.getString("instanceId") : null;
    int ownerEpoch = payload.hasKey("ownerEpoch") ? payload.getInt("ownerEpoch") : -1;
    String frameGenerationId =
      payload.hasKey("frameGenerationId") ? payload.getString("frameGenerationId") : null;
    String executionBatchId =
      payload.hasKey("executionBatchId") ? payload.getString("executionBatchId") : null;
    if (
      instanceId == null ||
      ownerEpoch < 0 ||
      frameGenerationId == null ||
      executionBatchId == null ||
      !instances.containsKey(instanceId)
    ) {
      promise.reject("search_map_render_controller_frame_invalid", "unknown instance or frame");
      return;
    }
    InstanceState activeState = instances.get(instanceId);
    if (activeState == null || activeState.ownerEpoch != ownerEpoch) {
      promise.reject("search_map_render_controller_stale_owner_epoch", "stale owner epoch");
      return;
    }
    final long actionStartedAt = System.nanoTime();
    try {
      ReadableArray sourceDeltas =
        payload.hasKey("sourceDeltas") && !payload.isNull("sourceDeltas")
          ? payload.getArray("sourceDeltas")
          : null;
      ReadableMap markerRoleFrame =
        payload.hasKey("markerRoleFrame") && !payload.isNull("markerRoleFrame")
          ? payload.getMap("markerRoleFrame")
          : null;
        String presentationStateJson =
          payload.hasKey("presentationStateJson") ? payload.getString("presentationStateJson") : null;
        VisualFrameTransaction visualFrameTransaction = parseVisualFrameTransaction(payload);
        boolean hasSourcePayload =
          (sourceDeltas != null && sourceDeltas.size() > 0) || markerRoleFrame != null;
        boolean sourceFrameIsReady =
          "ready".equals(visualFrameTransaction.sourceSnapshotKind) ||
          "empty".equals(visualFrameTransaction.sourceSnapshotKind);
        boolean shouldApplySourcePayload =
          hasSourcePayload &&
          sourceFrameIsReady &&
          !"dismiss".equals(visualFrameTransaction.kind) &&
          !"clear_hidden".equals(visualFrameTransaction.kind);
        boolean didSyncResidentFrame;
        String sourceAdmissionOutcome;
        if ("dismiss".equals(visualFrameTransaction.kind)) {
          markFrameSourceAdmission(
            instanceId,
            frameGenerationId,
            executionBatchId,
            visualFrameTransaction,
            true
          );
          applyPresentationPayload(instanceId, presentationStateJson);
          didSyncResidentFrame = true;
          sourceAdmissionOutcome = hasSourcePayload
            ? "source_apply_blocked_dismissing"
            : "presentation_only_dismiss";
        } else if ("clear_hidden".equals(visualFrameTransaction.kind)) {
          markFrameSourceAdmission(
            instanceId,
            frameGenerationId,
            executionBatchId,
            visualFrameTransaction,
            true
          );
          applyPresentationPayload(instanceId, presentationStateJson);
          InstanceState state = instances.get(instanceId);
          if (
            state != null &&
            VISUAL_SOURCE_HIDDEN.equals(state.visualSourceLifecycleState) &&
            "idle".equals(state.currentPresentationRenderPhase) &&
            state.keepSourcesHiddenUntilEnter
          ) {
            clearHiddenResidentSourceState(instanceId, state, "clear_hidden_transaction");
          }
          didSyncResidentFrame = true;
          sourceAdmissionOutcome = hasSourcePayload
            ? "sources_cleared_hidden"
            : "presentation_only_clear_hidden";
        } else if ("enter".equals(visualFrameTransaction.kind)) {
          markFrameSourceAdmission(
            instanceId,
            frameGenerationId,
            executionBatchId,
            visualFrameTransaction,
            false
          );
          applyPresentationPayload(instanceId, presentationStateJson);
          if (sourceFrameIsReady) {
            VisualFrameSnapshotApplyResult result = applyRenderFrameSnapshotPayload(
                instanceId,
                frameGenerationId,
                executionBatchId,
                visualFrameTransaction,
                shouldApplySourcePayload ? sourceDeltas : null,
                shouldApplySourcePayload ? markerRoleFrame : null,
                !shouldApplySourcePayload
              );
            didSyncResidentFrame = result.didSyncResidentFrame;
            sourceAdmissionOutcome = result.sourceAdmissionOutcome;
          } else {
            didSyncResidentFrame = true;
            sourceAdmissionOutcome = "source_pending";
          }
        } else if (
          "hidden_preload".equals(visualFrameTransaction.kind) ||
          "bootstrap".equals(visualFrameTransaction.kind) ||
          "live_update".equals(visualFrameTransaction.kind)
        ) {
          if (sourceFrameIsReady) {
            applyPresentationPayload(instanceId, presentationStateJson);
            VisualFrameSnapshotApplyResult result = applyRenderFrameSnapshotPayload(
              instanceId,
              frameGenerationId,
              executionBatchId,
              visualFrameTransaction,
              shouldApplySourcePayload ? sourceDeltas : null,
              shouldApplySourcePayload ? markerRoleFrame : null,
              false
            );
            didSyncResidentFrame = result.didSyncResidentFrame;
            sourceAdmissionOutcome = result.sourceAdmissionOutcome;
          } else {
            markFrameSourceAdmission(
              instanceId,
              frameGenerationId,
              executionBatchId,
              visualFrameTransaction,
              false
            );
            applyPresentationPayload(instanceId, presentationStateJson);
            didSyncResidentFrame = true;
            sourceAdmissionOutcome = "source_pending";
          }
        } else {
          throw new IllegalArgumentException(
            "unsupported visual frame transaction kind: " + visualFrameTransaction.kind
          );
        }
      applyInteractionModePayload(
        instanceId,
        payload.hasKey("interactionMode") ? payload.getString("interactionMode") : "enabled"
      );
      applyHighlightedMarkerPayload(
        instanceId,
        payload.hasKey("highlightedMarkerKey") && !payload.isNull("highlightedMarkerKey")
          ? payload.getString("highlightedMarkerKey")
          : null,
        parseStringSet(payload, "highlightedMarkerKeys"),
        payload.hasKey("highlightedRestaurantId") && !payload.isNull("highlightedRestaurantId")
          ? payload.getString("highlightedRestaurantId")
          : null
      );
      InstanceState state = instances.get(instanceId);
      if (didSyncResidentFrame && state != null) {
        WritableMap event = Arguments.createMap();
        event.putString("type", "render_frame_synced");
        event.putString("instanceId", instanceId);
        event.putString("frameGenerationId", frameGenerationId);
        event.putString("executionBatchId", executionBatchId);
        event.putInt("ownerEpoch", state.ownerEpoch);
        event.putInt("pinCount", state.lastPinCount);
        event.putInt("dotCount", state.lastDotCount);
        event.putInt("labelCount", state.lastLabelCount);
        event.putString("sourceAdmissionOutcome", sourceAdmissionOutcome);
        event.putString("sourceFrameKey", visualFrameTransaction.sourceFrameKey);
        event.putString("sourceDataKey", visualFrameTransaction.sourceDataKey);
        WritableMap sourceRevisions = Arguments.createMap();
        sourceRevisions.putString("pins", sourceRevisionForSyncedFrame(state, state.pinSourceId));
        sourceRevisions.putString("pinInteractions", sourceRevisionForSyncedFrame(state, state.pinInteractionSourceId));
        sourceRevisions.putString("dots", sourceRevisionForSyncedFrame(state, state.dotSourceId));
        sourceRevisions.putString("labels", sourceRevisionForSyncedFrame(state, state.labelSourceId));
        sourceRevisions.putString("labelCollisions", sourceRevisionForSyncedFrame(state, state.labelCollisionSourceId));
        event.putMap("sourceRevisions", sourceRevisions);
        emit(event);
        if (
          hasSourcePayload &&
          VISUAL_SOURCE_HIDDEN.equals(state.visualSourceLifecycleState) &&
          "idle".equals(state.currentPresentationRenderPhase) &&
          state.keepSourcesHiddenUntilEnter &&
          state.lastDismissRequestKey != null
        ) {
          scheduleDeferredDismissSourceCleanup(
            instanceId,
            state.lastDismissRequestKey,
            "dismiss_hidden_source_frame"
          );
        }
        maybeElectMountedHiddenExecutionBatch(instanceId, state);
        maybeEmitExecutionBatchArmed(instanceId, state);
        InstanceState readyState = instances.get(instanceId);
        if (readyState != null) {
          startEnterPresentationIfReady(instanceId, readyState, null, null);
        }
        double totalDurationMs = (System.nanoTime() - actionStartedAt) / 1_000_000.0;
        if (totalDurationMs >= SLOW_ACTION_THRESHOLD_MS) {
          emitError(
            "__native_diag__",
            "slow_action action=setRenderFrame phase=" +
            state.lastPresentationBatchPhase +
            " totalMs=" +
            Math.round(totalDurationMs) +
            " pins=" +
            state.lastPinCount +
            " dots=" +
            state.lastDotCount +
            " labels=" +
            state.lastLabelCount
          );
        }
      }
      promise.resolve(null);
    } catch (Exception error) {
      promise.reject(
        "search_map_render_controller_frame_apply_failed",
        error.getMessage() != null ? error.getMessage() : "frame apply failed",
        error
      );
    }
  }

  private void markFrameSourceAdmission(
    String instanceId,
    String generationId,
    String executionBatchId,
    VisualFrameTransaction visualFrameTransaction,
    boolean sourceReady
  ) {
    InstanceState state = instances.get(instanceId);
    if (state == null) {
      return;
    }
    state.activeFrameGenerationId = generationId;
    state.activeExecutionBatchId = executionBatchId;
    if (sourceReady) {
      state.sourceReadyFrameGenerationId = generationId;
      state.sourceReadyExecutionBatchId = executionBatchId;
      state.residentSourceFrameKey = visualFrameTransaction.sourceFrameKey;
      state.residentSourceDataKey = visualFrameTransaction.sourceDataKey;
    } else {
      state.sourceReadyFrameGenerationId = null;
      state.sourceReadyExecutionBatchId = null;
    }
    instances.put(instanceId, state);
  }

  private static String transportFeatureId(ReadableMap rawFeature) {
    if (rawFeature == null || !rawFeature.hasKey("id") || rawFeature.isNull("id")) {
      return null;
    }
    String id = rawFeature.getString("id");
    return id != null && !id.isEmpty() ? id : null;
  }

  private static ArrayList<ReadableMap> roleFrameFeatureRecords(ReadableMap row, String key) {
    ArrayList<ReadableMap> records = new ArrayList<>();
    if (row == null || !row.hasKey(key) || row.isNull(key)) {
      return records;
    }
    if (row.getType(key) == ReadableType.Map) {
      ReadableMap feature = row.getMap(key);
      if (feature != null) {
        records.add(feature);
      }
      return records;
    }
    if (row.getType(key) == ReadableType.Array) {
      ReadableArray features = row.getArray(key);
      if (features == null) {
        return records;
      }
      for (int index = 0; index < features.size(); index += 1) {
        if (features.isNull(index)) {
          continue;
        }
        ReadableMap feature = features.getMap(index);
        if (feature != null) {
          records.add(feature);
        }
      }
    }
    return records;
  }

  private static WritableArray writableFeatureArray(List<ReadableMap> records) {
    WritableArray array = Arguments.createArray();
    for (ReadableMap record : records) {
      array.pushMap(record);
    }
    return array;
  }

  private static ArrayList<String> existingFeatureIdsForMarker(
    InstanceState state,
    String sourceId,
    String markerKey
  ) {
    DerivedFamilyState familyState = derivedFamilyState(state, sourceId);
    ArrayList<String> desiredIds = familyState.desiredCollection.groupedFeatureIdsByGroup.get(markerKey);
    if (desiredIds != null) {
      return new ArrayList<>(desiredIds);
    }
    ArrayList<String> collectionIds = familyState.collection.groupedFeatureIdsByGroup.get(markerKey);
    return collectionIds != null ? new ArrayList<>(collectionIds) : new ArrayList<>();
  }

  private static void applyMarkerRoleFamilyDelta(
    InstanceState state,
    String sourceId,
    ArrayList<String> nextFeatureIdsInOrder,
    Set<String> dirtyGroupIds,
    Set<String> removedGroupIds,
    List<ReadableMap> rawUpsertFeatures
  ) throws Exception {
    DerivedFamilyState familyState = derivedFamilyState(state, sourceId);
    ParsedFeatureCollection upsertCollection =
      rawUpsertFeatures.isEmpty() ? null : parseTransportFeatures(writableFeatureArray(rawUpsertFeatures));
    Set<String> orderChangedGroupIds = new LinkedHashSet<>(dirtyGroupIds);
    orderChangedGroupIds.addAll(removedGroupIds);
    ParsedFeatureCollectionDelta delta = new ParsedFeatureCollectionDelta(
      sourceId,
      "patch",
      nextFeatureIdsInOrder,
      Collections.emptySet(),
      dirtyGroupIds,
      orderChangedGroupIds,
      removedGroupIds,
      upsertCollection
    );
    copyParsedFeatureCollection(
      applyParsedCollectionDelta(delta, parsedCollectionBase(familyState.sourceState)),
      familyState.desiredCollection
    );
  }

  private void applyMarkerRoleFrame(ReadableMap payload, InstanceState state) throws Exception {
    ArrayList<String> nextPinnedMarkerKeys = assertUniqueOrderedFeatureIds(
      parseStringArray(payload, "nextPinnedMarkerKeysInOrder"),
      "marker role frame nextPinnedMarkerKeysInOrder"
    );
    ArrayList<String> nextDotMarkerKeys = assertUniqueOrderedFeatureIds(
      parseStringArray(payload, "nextDotMarkerKeysInOrder"),
      "marker role frame nextDotMarkerKeysInOrder"
    );
    Set<String> dirtyMarkerKeys = assertUniqueStringSet(
      parseStringArray(payload, "dirtyMarkerKeys"),
      "marker role frame dirtyMarkerKeys"
    );
    Set<String> removedMarkerKeys = assertUniqueStringSet(
      parseStringArray(payload, "removedMarkerKeys"),
      "marker role frame removedMarkerKeys"
    );
    Set<String> nextPinnedMarkerKeySet = new LinkedHashSet<>(nextPinnedMarkerKeys);
    Set<String> nextDotMarkerKeySet = new LinkedHashSet<>(nextDotMarkerKeys);
    Set<String> overlap = new LinkedHashSet<>(nextPinnedMarkerKeySet);
    overlap.retainAll(nextDotMarkerKeySet);
    if (!overlap.isEmpty()) {
      throw new Exception("Marker role frame has settled dot/pin overlap");
    }

    HashMap<String, ReadableMap> rowsByMarkerKey = new HashMap<>();
    ReadableArray rawRows =
      payload.hasKey("upsertRoles") && !payload.isNull("upsertRoles")
        ? payload.getArray("upsertRoles")
        : null;
    if (rawRows != null) {
      for (int index = 0; index < rawRows.size(); index += 1) {
        ReadableMap row = rawRows.isNull(index) ? null : rawRows.getMap(index);
        if (row == null || !row.hasKey("markerKey") || row.isNull("markerKey")) {
          throw new Exception("Marker role row missing markerKey");
        }
        String markerKey = row.getString("markerKey");
        if (markerKey == null || markerKey.isEmpty()) {
          throw new Exception("Marker role row missing markerKey");
        }
        if (rowsByMarkerKey.put(markerKey, row) != null) {
          throw new Exception("Duplicate marker role row " + markerKey);
        }
      }
    }

    ArrayList<ReadableMap> pinUpserts = new ArrayList<>();
    ArrayList<ReadableMap> pinInteractionUpserts = new ArrayList<>();
    ArrayList<ReadableMap> labelUpserts = new ArrayList<>();
    ArrayList<ReadableMap> labelCollisionUpserts = new ArrayList<>();
    ArrayList<ReadableMap> dotUpserts = new ArrayList<>();

    for (String markerKey : dirtyMarkerKeys) {
      ReadableMap row = rowsByMarkerKey.get(markerKey);
      if (row == null) {
        if (removedMarkerKeys.contains(markerKey)) {
          continue;
        }
        throw new Exception("Dirty marker role " + markerKey + " missing row");
      }
      String role = row.hasKey("role") && !row.isNull("role") ? row.getString("role") : null;
      if ("pin".equals(role)) {
        ArrayList<ReadableMap> pinFeatures = roleFrameFeatureRecords(row, "pinFeature");
        ArrayList<ReadableMap> pinInteractionFeatures =
          roleFrameFeatureRecords(row, "pinInteractionFeature");
        ArrayList<ReadableMap> labelFeatures = roleFrameFeatureRecords(row, "labelFeatures");
        ArrayList<ReadableMap> labelCollisionFeatures =
          roleFrameFeatureRecords(row, "labelCollisionFeature");
        if (
          !nextPinnedMarkerKeySet.contains(markerKey) ||
          pinFeatures.size() != 1 ||
          pinInteractionFeatures.size() != 1 ||
          labelFeatures.size() != 4 ||
          labelCollisionFeatures.size() != 1
        ) {
          throw new Exception("Promoted marker " + markerKey + " missing pin/interaction/label/collision role payload");
        }
        pinUpserts.addAll(pinFeatures);
        pinInteractionUpserts.addAll(pinInteractionFeatures);
        labelUpserts.addAll(labelFeatures);
        labelCollisionUpserts.addAll(labelCollisionFeatures);
      } else if ("dot".equals(role)) {
        ArrayList<ReadableMap> dotFeatures = roleFrameFeatureRecords(row, "dotFeature");
        if (!nextDotMarkerKeySet.contains(markerKey) || dotFeatures.size() != 1) {
          throw new Exception("Demoted marker " + markerKey + " missing dot role payload");
        }
        dotUpserts.addAll(dotFeatures);
      } else {
        throw new Exception("Marker " + markerKey + " has unsupported role " + role);
      }
    }

    ArrayList<String> nextLabelFeatureIdsInOrder = new ArrayList<>();
    ArrayList<String> nextLabelCollisionFeatureIdsInOrder = new ArrayList<>();
    for (String markerKey : nextPinnedMarkerKeys) {
      ReadableMap row = rowsByMarkerKey.get(markerKey);
      ArrayList<String> labelIds = new ArrayList<>();
      if (row != null) {
        for (ReadableMap rawFeature : roleFrameFeatureRecords(row, "labelFeatures")) {
          String id = transportFeatureId(rawFeature);
          if (id != null) {
            labelIds.add(id);
          }
        }
      }
      if (labelIds.isEmpty()) {
        labelIds = existingFeatureIdsForMarker(state, state.labelSourceId, markerKey);
      }
      nextLabelFeatureIdsInOrder.addAll(labelIds);
      String collisionId = markerKey;
      if (row != null) {
        ArrayList<ReadableMap> collisionFeatures = roleFrameFeatureRecords(row, "labelCollisionFeature");
        if (!collisionFeatures.isEmpty()) {
          String id = transportFeatureId(collisionFeatures.get(0));
          if (id != null) {
            collisionId = id;
          }
        }
      }
      nextLabelCollisionFeatureIdsInOrder.add(collisionId);
    }

    Set<String> dirtyAndRemovedMarkerKeys = new LinkedHashSet<>(dirtyMarkerKeys);
    dirtyAndRemovedMarkerKeys.addAll(removedMarkerKeys);
    applyMarkerRoleFamilyDelta(
      state,
      state.pinSourceId,
      nextPinnedMarkerKeys,
      dirtyAndRemovedMarkerKeys,
      removedMarkerKeys,
      pinUpserts
    );
    applyMarkerRoleFamilyDelta(
      state,
      state.pinInteractionSourceId,
      nextPinnedMarkerKeys,
      dirtyAndRemovedMarkerKeys,
      removedMarkerKeys,
      pinInteractionUpserts
    );
    applyMarkerRoleFamilyDelta(
      state,
      state.dotSourceId,
      nextDotMarkerKeys,
      dirtyAndRemovedMarkerKeys,
      removedMarkerKeys,
      dotUpserts
    );
    applyMarkerRoleFamilyDelta(
      state,
      state.labelSourceId,
      nextLabelFeatureIdsInOrder,
      dirtyAndRemovedMarkerKeys,
      removedMarkerKeys,
      labelUpserts
    );
    applyMarkerRoleFamilyDelta(
      state,
      state.labelCollisionSourceId,
      nextLabelCollisionFeatureIdsInOrder,
      dirtyAndRemovedMarkerKeys,
      removedMarkerKeys,
      labelCollisionUpserts
    );
  }

  private VisualFrameSnapshotApplyResult applyRenderFrameSnapshotPayload(
    String instanceId,
    String generationId,
    String executionBatchId,
    VisualFrameTransaction visualFrameTransaction,
    ReadableArray sourceDeltas,
    ReadableMap markerRoleFrame,
    boolean allowResidentSourceCacheRestore
  ) throws Exception {
    InstanceState state = instances.get(instanceId);
    if (state == null) {
      throw new IllegalStateException("unknown instance");
    }
    if (isVisualSourceDismissing(state)) {
      state.activeFrameGenerationId = generationId;
      state.activeExecutionBatchId = executionBatchId;
      state.sourceReadyFrameGenerationId = generationId;
      state.sourceReadyExecutionBatchId = executionBatchId;
      instances.put(instanceId, state);
      emitVisualDiag(
        instanceId,
        "frame_snapshot_bypass reason=dismiss_in_progress phase=" +
        state.lastPresentationBatchPhase
      );
      return new VisualFrameSnapshotApplyResult(true, "source_apply_blocked_dismissing");
    }
    emitVisualDiag(
      instanceId,
      "frame_begin phase=" +
      state.lastPresentationBatchPhase +
      " opacity=" +
      state.currentPresentationOpacityTarget +
      " revealRequest=" +
      (state.lastEnterRequestKey != null ? state.lastEnterRequestKey : "nil") +
      " revealStarted=" +
      (state.lastEnterStartedRequestKey != null ? state.lastEnterStartedRequestKey : "nil") +
      " revealSettled=" +
      (state.lastEnterSettledRequestKey != null ? state.lastEnterSettledRequestKey : "nil") +
      " dismissRequest=" +
      (state.lastDismissRequestKey != null ? state.lastDismissRequestKey : "nil")
    );
    boolean isLiveMarkerRoleOnlyFrame =
      markerRoleFrame != null &&
      (sourceDeltas == null || sourceDeltas.size() == 0) &&
      "live_update".equals(visualFrameTransaction.kind) &&
      "live".equals(visualFrameTransaction.presentationPhase);
    if (sourceDeltas != null) {
      for (ParsedFeatureCollectionDelta delta : parseSourceDeltas(sourceDeltas)) {
        DerivedFamilyState familyState = derivedFamilyState(state, delta.sourceId);
        copyParsedFeatureCollection(
          applyParsedCollectionDelta(delta, parsedCollectionBase(familyState.sourceState)),
          familyState.desiredCollection
        );
      }
    }
    if (markerRoleFrame != null) {
      applyMarkerRoleFrame(markerRoleFrame, state);
    }
    String sourceAdmissionOutcome;
    if (
      allowResidentSourceCacheRestore &&
      markerRoleFrame == null &&
      (sourceDeltas == null || sourceDeltas.size() == 0)
    ) {
      boolean didRestoreResidentSources = restoreResidentDesiredSourceCacheForEnter(state);
      if (didRestoreResidentSources) {
        emitVisualDiag(
          instanceId,
          "resident_source_cache_restored frame=" +
          generationId +
          " cacheSources=" +
          state.residentDesiredSourceCacheBySourceId.size()
        );
      }
      sourceAdmissionOutcome = "sources_reused_resident";
    } else if ((sourceDeltas != null && sourceDeltas.size() > 0) || markerRoleFrame != null) {
      sourceAdmissionOutcome = "hidden_preload".equals(visualFrameTransaction.kind)
        ? "sources_applied_hidden"
        : "sources_applied_visible";
    } else {
      sourceAdmissionOutcome = "sources_reused_resident";
    }
    ParsedFeatureCollection retainedPins = derivedFamilyState(state, state.pinSourceId).desiredCollection;
    ParsedFeatureCollection retainedDots = derivedFamilyState(state, state.dotSourceId).desiredCollection;
    ParsedFeatureCollection retainedLabels = derivedFamilyState(state, state.labelSourceId).desiredCollection;
    state.lastPinCount = retainedPins != null ? retainedPins.idsInOrder.size() : 0;
    state.lastDotCount = retainedDots != null ? retainedDots.idsInOrder.size() : 0;
    state.lastLabelCount = retainedLabels != null ? retainedLabels.idsInOrder.size() : 0;
    state.activeFrameGenerationId = generationId;
    state.activeExecutionBatchId = executionBatchId;
    state.sourceReadyFrameGenerationId = null;
    state.sourceReadyExecutionBatchId = null;
    state.residentSourceFrameKey = visualFrameTransaction.sourceFrameKey;
    state.residentSourceDataKey = visualFrameTransaction.sourceDataKey;
    instances.put(instanceId, state);
    applyDesiredFrameSnapshots(instanceId);
    state = instances.get(instanceId);
    if (state != null && state.isAwaitingSourceRecovery) {
      emitVisualDiag(
        instanceId,
        "frame_apply_deferred reason=source_recovery phase=" + state.lastPresentationBatchPhase
      );
      instances.put(instanceId, state);
      return new VisualFrameSnapshotApplyResult(false, "source_pending");
    }
    emitVisualDiag(
      instanceId,
      "frame_after_reconcile phase=" +
      state.lastPresentationBatchPhase +
      " opacity=" +
      state.currentPresentationOpacityTarget +
      " revealRequest=" +
      (state.lastEnterRequestKey != null ? state.lastEnterRequestKey : "nil") +
      " revealStarted=" +
      (state.lastEnterStartedRequestKey != null ? state.lastEnterStartedRequestKey : "nil") +
      " revealSettled=" +
      (state.lastEnterSettledRequestKey != null ? state.lastEnterSettledRequestKey : "nil") +
      " dismissRequest=" +
      (state.lastDismissRequestKey != null ? state.lastDismissRequestKey : "nil")
    );
    if (
      !isLiveMarkerRoleOnlyFrame ||
      !state.highlightedMarkerKeys.isEmpty() ||
      state.highlightedRestaurantId != null
    ) {
      applyHighlightedMarkerState(state);
    }
    if (shouldSuppressInteractions(state)) {
      applyInteractionSuppression(state);
    }
    if (!isLiveMarkerRoleOnlyFrame) {
      applyPresentationOpacity(state, state.currentPresentationOpacityTarget);
    }
    state.sourceReadyFrameGenerationId = generationId;
    state.sourceReadyExecutionBatchId = executionBatchId;
    instances.put(instanceId, state);
    InstanceState latestState = instances.get(instanceId);
    if (
      latestState != null &&
      (
        !stringEquals(latestState.lastPresentationBatchPhase, state.lastPresentationBatchPhase) ||
        latestState.currentPresentationOpacityTarget != state.currentPresentationOpacityTarget ||
        !stringEquals(latestState.lastEnterStartedRequestKey, state.lastEnterStartedRequestKey) ||
        !stringEquals(latestState.lastEnterSettledRequestKey, state.lastEnterSettledRequestKey)
      )
    ) {
      emitVisualDiag(
        instanceId,
        "frame_final_write_mismatch localPhase=" +
        state.lastPresentationBatchPhase +
        " localOpacity=" +
        state.currentPresentationOpacityTarget +
        " localRevealStarted=" +
        (state.lastEnterStartedRequestKey != null ? state.lastEnterStartedRequestKey : "nil") +
        " localRevealSettled=" +
        (state.lastEnterSettledRequestKey != null ? state.lastEnterSettledRequestKey : "nil") +
        " latestPhase=" +
        latestState.lastPresentationBatchPhase +
        " latestOpacity=" +
        latestState.currentPresentationOpacityTarget +
        " latestRevealStarted=" +
        (latestState.lastEnterStartedRequestKey != null ? latestState.lastEnterStartedRequestKey : "nil") +
        " latestRevealSettled=" +
        (latestState.lastEnterSettledRequestKey != null ? latestState.lastEnterSettledRequestKey : "nil")
      );
    }
    return new VisualFrameSnapshotApplyResult(true, sourceAdmissionOutcome);
  }

  private void applyPresentationPayload(String instanceId, String presentationStateJson) throws Exception {
    InstanceState state = instances.get(instanceId);
    if (state == null) {
      throw new IllegalStateException("unknown instance");
    }
    if (stringEquals(state.lastPresentationStateJson, presentationStateJson)) {
      instances.put(instanceId, state);
      return;
    }
    String previousPresentationBatchPhase = state.lastPresentationBatchPhase;
    double previousPresentationOpacityTarget = state.currentPresentationOpacityTarget;
    String nextPresentationBatchPhase = readPresentationBatchPhase(presentationStateJson);
    String revealRequestKey = readEnterRequestKey(presentationStateJson);
    String dismissRequestKey = readDismissRequestKey(presentationStateJson);
    boolean shouldSupersedeDismissWithReveal =
      VISUAL_SOURCE_DISMISSING.equals(state.visualSourceLifecycleState) &&
      revealRequestKey != null &&
      dismissRequestKey == null;
    if (
      VISUAL_SOURCE_DISMISSING.equals(state.visualSourceLifecycleState) &&
      !shouldSupersedeDismissWithReveal &&
      dismissRequestKey == null
    ) {
      instances.put(instanceId, state);
      return;
    }
    state.lastPresentationStateJson = presentationStateJson;
    state.lastPresentationBatchPhase = nextPresentationBatchPhase;
    String revealStatus = readEnterStatus(presentationStateJson);
    Double revealStartToken = readEnterStartToken(presentationStateJson);
    state.allowEmptyEnter = readAllowEmptyEnter(presentationStateJson);
    if (shouldSupersedeDismissWithReveal && state.lastDismissRequestKey != null) {
      clearDismissLifecycleRequestForEnter(instanceId, state);
    }
    if (!stringEquals(state.lastEnterRequestKey, revealRequestKey)) {
      Runnable pendingRevealRunnable = enterSettleRunnables.remove(instanceId);
      if (pendingRevealRunnable != null) {
        mainHandler.removeCallbacks(pendingRevealRunnable);
      }
      state.lastEnterRequestKey = revealRequestKey;
      state.enterLane = new EnterLaneState();
      state.lastEnterStartToken = null;
      state.lastEnterStartedRequestKey = null;
      state.lastEnterSettledRequestKey = null;
      state.pendingPresentationSettleRequestKey = null;
      state.pendingPresentationSettleKind = null;
      state.sourceReadyFrameGenerationId = null;
      state.sourceReadyExecutionBatchId = null;
      state.blockedEnterStartRequestKey = null;
      state.blockedEnterStartCommitFenceDataIdsBySourceId.clear();
      state.blockedPresentationSettleRequestKey = null;
      state.blockedPresentationSettleKind = null;
      state.blockedPresentationCommitFenceDataIdsBySourceId.clear();
      if (revealRequestKey != null) {
        beginRevealVisualLifecycle(instanceId, state, "new_reveal_request");
        instances.put(instanceId, state);
        applyDesiredFrameSnapshots(instanceId);
        state = instances.get(instanceId);
        applyPresentationOpacity(state, REVEAL_PREROLL_PLACEMENT_OPACITY);
        Map<String, Set<String>> commitFence = capturePendingVisualSourceCommitFence(state);
        if (hasPendingCommitFence(commitFence)) {
          state.blockedEnterStartRequestKey = revealRequestKey;
          state.blockedEnterStartCommitFenceDataIdsBySourceId.clear();
          state.blockedEnterStartCommitFenceDataIdsBySourceId.putAll(commitFence);
          state.currentPresentationRenderPhase = "enter_wait_commit";
          instances.put(instanceId, state);
          emitVisualDiag(
            instanceId,
            "reveal_start_commit_fence_blocked pending=" + describeCommitFence(commitFence)
          );
        } else {
        }
        emitVisualDiag(
          instanceId,
          "reveal_generation_ready frame=" +
          (state.activeFrameGenerationId != null ? state.activeFrameGenerationId : "nil") +
          " phase=" +
          state.currentPresentationRenderPhase
        );
      }
    }
    state.enterLane.requestedRequestKey = revealRequestKey;
    maybeElectMountedHiddenExecutionBatch(instanceId, state);
    if (
      revealRequestKey != null &&
      revealStartToken != null &&
      "entering".equals(revealStatus) &&
      "entering".equals(state.lastPresentationBatchPhase) &&
      stringEquals(state.enterLane.requestedRequestKey, revealRequestKey) &&
      state.enterLane.mountedHidden != null &&
      !doubleEquals(state.lastEnterStartToken, revealStartToken) &&
      !stringEquals(state.lastEnterStartedRequestKey, revealRequestKey) &&
      state.blockedEnterStartRequestKey == null
    ) {
      startEnterPresentation(
        instanceId,
        revealRequestKey,
        revealStartToken.doubleValue(),
        previousPresentationBatchPhase,
        Double.valueOf(previousPresentationOpacityTarget)
      );
      state = instances.get(instanceId);
    }
    String previousDismissRequestKey = state.lastDismissRequestKey;
    if (!stringEquals(state.lastDismissRequestKey, dismissRequestKey)) {
      Runnable pendingRevealRunnable = enterSettleRunnables.remove(instanceId);
      if (pendingRevealRunnable != null) {
        mainHandler.removeCallbacks(pendingRevealRunnable);
      }
      Runnable revealFrameFallback = revealFrameFallbackRunnables.remove(instanceId);
      if (revealFrameFallback != null) {
        mainHandler.removeCallbacks(revealFrameFallback);
      }
      state.pendingPresentationSettleRequestKey = null;
      state.pendingPresentationSettleKind = null;
      state.blockedPresentationSettleRequestKey = null;
      state.blockedPresentationSettleKind = null;
      state.blockedPresentationCommitFenceDataIdsBySourceId.clear();
      Runnable pendingRunnable = dismissSettleRunnables.remove(instanceId);
      if (pendingRunnable != null) {
        mainHandler.removeCallbacks(pendingRunnable);
      }
      Runnable dismissFrameFallback = dismissFrameFallbackRunnables.remove(instanceId);
      if (dismissFrameFallback != null) {
        mainHandler.removeCallbacks(dismissFrameFallback);
      }
      state.lastDismissRequestKey = dismissRequestKey;
      if (dismissRequestKey != null) {
        beginDismissVisualLifecycle(instanceId, state);
        applyPresentationOpacity(state, state.currentPresentationOpacityTarget);

        WritableMap startedEvent = Arguments.createMap();
        startedEvent.putString("type", "presentation_exit_started");
        startedEvent.putString("instanceId", instanceId);
        startedEvent.putString("requestKey", dismissRequestKey);
        startedEvent.putString("frameGenerationId", state.activeFrameGenerationId);
        startedEvent.putDouble("startedAtMs", nowMs());
        emit(startedEvent);
        emitVisualDiag(
          instanceId,
          "presentation_transition previousPhase=" +
          previousPresentationBatchPhase +
          " nextPhase=" +
          state.lastPresentationBatchPhase +
          " previousOpacity=" +
          previousPresentationOpacityTarget +
          " nextOpacity=" +
          state.currentPresentationOpacityTarget +
          " revealRequest=" +
          (state.lastEnterRequestKey != null ? state.lastEnterRequestKey : "nil") +
          " dismissRequest=" +
          dismissRequestKey
        );

        Runnable settledRunnable = () -> {
          dismissSettleRunnables.remove(instanceId);
          InstanceState latestState = instances.get(instanceId);
          if (latestState == null) {
            return;
          }
          if (!stringEquals(latestState.lastDismissRequestKey, dismissRequestKey)) {
            return;
          }
          Map<String, Set<String>> commitFence = capturePendingVisualSourceCommitFence(latestState);
          if (hasPendingCommitFence(commitFence)) {
            latestState.blockedPresentationSettleRequestKey = dismissRequestKey;
            latestState.blockedPresentationSettleKind = "exit";
            latestState.currentPresentationRenderPhase = "exit_preroll";
            latestState.blockedPresentationCommitFenceDataIdsBySourceId.clear();
            latestState.blockedPresentationCommitFenceDataIdsBySourceId.putAll(commitFence);
            emitVisualDiag(
              instanceId,
              "dismiss_commit_fence_blocked pending=" + describeCommitFence(commitFence)
            );
          } else {
            latestState.currentPresentationRenderPhase = "exiting";
            latestState.pendingPresentationSettleRequestKey = dismissRequestKey;
            latestState.pendingPresentationSettleKind = "exit";
            armNativeDismissSettle(instanceId, dismissRequestKey);
          }
          instances.put(instanceId, latestState);
        };
        dismissSettleRunnables.put(instanceId, settledRunnable);
        mainHandler.postDelayed(settledRunnable, DISMISS_SETTLE_DELAY_MS);
      } else if (previousDismissRequestKey != null) {
        if (VISUAL_SOURCE_HIDDEN.equals(state.visualSourceLifecycleState)) {
          state.currentPresentationRenderPhase = "idle";
          state.keepSourcesHiddenUntilEnter = true;
          state.currentPresentationOpacityTarget = 0;
          state.currentPresentationOpacityValue = 0;
          instances.put(instanceId, state);
          emitVisualDiag(
            instanceId,
            "dismiss_clear_already_hidden request=" + previousDismissRequestKey
          );
        } else {
          state.currentPresentationRenderPhase = "idle".equals(state.lastPresentationBatchPhase) ? "live" : "idle";
          state.visualSourceLifecycleState = VISUAL_SOURCE_VISIBLE;
          instances.put(instanceId, state);
          applyDesiredFrameSnapshots(instanceId);
          state = instances.get(instanceId);
          double restoredOpacity = state.keepSourcesHiddenUntilEnter
            ? 0
            : ("idle".equals(state.lastPresentationBatchPhase) ? 1 : state.currentPresentationOpacityTarget);
          state.currentPresentationOpacityTarget = restoredOpacity;
          instances.put(instanceId, state);
          applyPresentationOpacity(state, restoredOpacity);
        }
      }
    }
    if (
      state.lastDismissRequestKey == null &&
      state.lastEnterRequestKey == null &&
      shouldHidePresentationWithoutActiveRequests(state.lastPresentationBatchPhase) &&
      state.currentPresentationOpacityTarget != 0
    ) {
      state.currentPresentationOpacityTarget = 0;
      state.visualSourceLifecycleState = VISUAL_SOURCE_DISMISSING;
      instances.put(instanceId, state);
      applyPresentationOpacity(state, state.currentPresentationOpacityTarget);
    }
    if (
      state.lastDismissRequestKey == null &&
      !"idle".equals(previousPresentationBatchPhase) &&
      "idle".equals(state.lastPresentationBatchPhase)
    ) {
      state.currentPresentationRenderPhase = "live";
      state.visualSourceLifecycleState = VISUAL_SOURCE_VISIBLE;
      state.keepSourcesHiddenUntilEnter = false;
      if (state.currentPresentationOpacityTarget != 1) {
        state.currentPresentationOpacityTarget = 1;
        applyPresentationOpacity(state, state.currentPresentationOpacityTarget);
      }
      instances.put(instanceId, state);
    }

  }

  private void applyHighlightedMarkerPayload(
    String instanceId,
    String markerKey,
    Set<String> markerKeys,
    String restaurantId
  ) throws Exception {
    InstanceState state = instances.get(instanceId);
    if (state == null) {
      throw new IllegalStateException("unknown instance");
    }
    if (isVisualSourceInactiveOrDismissing(state)) {
      return;
    }
    Set<String> nextMarkerKeys = new LinkedHashSet<>(markerKeys);
    if (nextMarkerKeys.isEmpty() && markerKey != null && !markerKey.isEmpty()) {
      nextMarkerKeys.add(markerKey);
    }
    String nextRestaurantId = restaurantId != null && !restaurantId.isEmpty() ? restaurantId : null;
    if (
      stringEquals(state.highlightedMarkerKey, markerKey) &&
      state.highlightedMarkerKeys.equals(nextMarkerKeys) &&
      stringEquals(state.highlightedRestaurantId, nextRestaurantId)
    ) {
      return;
    }
    state.highlightedMarkerKey = markerKey;
    state.highlightedMarkerKeys.clear();
    state.highlightedMarkerKeys.addAll(nextMarkerKeys);
    state.highlightedRestaurantId = nextRestaurantId;
    instances.put(instanceId, state);
    applyHighlightedMarkerState(state);
  }

  private void applyInteractionModePayload(String instanceId, String mode) throws Exception {
    InstanceState state = instances.get(instanceId);
    if (state == null) {
      throw new IllegalStateException("unknown instance");
    }
    if (isVisualSourceInactiveOrDismissing(state)) {
      return;
    }
    String nextMode = "suppressed".equals(mode) ? "suppressed" : "enabled";
    if (stringEquals(state.interactionMode, nextMode)) {
      return;
    }
    state.interactionMode = nextMode;
    instances.put(instanceId, state);
    if (shouldSuppressInteractions(state)) {
      applyInteractionSuppression(state);
    } else {
      applyDesiredFrameSnapshots(instanceId);
      InstanceState updatedState = instances.get(instanceId);
      if (updatedState != null) {
        applyHighlightedMarkerState(updatedState);
        applyPresentationOpacity(updatedState, updatedState.currentPresentationOpacityTarget);
      }
    }
  }

  @ReactMethod
  public void configureLabelObservation(ReadableMap payload, Promise promise) {
    String instanceId = payload.hasKey("instanceId") ? payload.getString("instanceId") : null;
    if (instanceId == null) {
      promise.reject(
        "search_map_render_controller_configure_label_observation_invalid",
        "missing instanceId"
      );
      return;
    }
    InstanceState state = instances.get(instanceId);
    if (state == null) {
      promise.reject(
        "search_map_render_controller_configure_label_observation_invalid",
        "unknown instance"
      );
      return;
    }
    boolean observationEnabled =
      payload.hasKey("observationEnabled") && payload.getBoolean("observationEnabled");
    boolean commitVisibleLabelHits =
      payload.hasKey("commitVisibleLabelHits") && payload.getBoolean("commitVisibleLabelHits");
    double refreshMsIdle =
      payload.hasKey("refreshMsIdle") && !payload.isNull("refreshMsIdle")
        ? payload.getDouble("refreshMsIdle")
        : 0d;
    double refreshMsMoving =
      payload.hasKey("refreshMsMoving") && !payload.isNull("refreshMsMoving")
        ? payload.getDouble("refreshMsMoving")
        : 0d;
    String labelResetRequestKey =
      payload.hasKey("labelResetRequestKey") && !payload.isNull("labelResetRequestKey")
        ? payload.getString("labelResetRequestKey")
        : null;

    mainHandler.post(() -> {
      try {
        configureLabelObservation(
          instanceId,
          observationEnabled,
          commitVisibleLabelHits,
          refreshMsIdle,
          refreshMsMoving,
          labelResetRequestKey
        );
        if (observationEnabled) {
          scheduleLabelObservationRefresh(instanceId, 0d);
        }
        promise.resolve(null);
      } catch (Exception error) {
        promise.reject(
          "search_map_render_controller_configure_label_observation_failed",
          error
        );
      }
    });
  }

  @ReactMethod
  public void configureNativeLayerGroups(ReadableMap payload, Promise promise) {
    String instanceId = payload.hasKey("instanceId") ? payload.getString("instanceId") : null;
    if (instanceId == null) {
      promise.reject(
        "search_map_render_controller_configure_native_layer_groups_invalid",
        "missing instanceId"
      );
      return;
    }
    ArrayList<String> pinSlotSourceIds = parseStringArray(payload, "pinSlotSourceIds");
    ArrayList<String> labelLayerIds = parseStringArray(payload, "labelLayerIds");
    ArrayList<String> labelCollisionLayerIds = parseStringArray(payload, "labelCollisionLayerIds");
    if (
      pinSlotSourceIds.isEmpty() ||
      labelLayerIds.isEmpty() ||
      labelCollisionLayerIds.isEmpty()
    ) {
      promise.reject(
        "search_map_render_controller_configure_native_layer_groups_invalid",
        "missing promoted slot source/layer ids"
      );
      return;
    }
    mainHandler.post(() -> {
      InstanceState state = instances.get(instanceId);
      if (state == null) {
        promise.reject(
          "search_map_render_controller_configure_native_layer_groups_invalid",
          "unknown instance"
        );
        return;
      }
      state.pinSlotSourceIds = pinSlotSourceIds;
      state.labelLayerIds = labelLayerIds;
      state.labelCollisionLayerIds = labelCollisionLayerIds;
      instances.put(instanceId, state);
      promise.resolve(null);
    });
  }

  @ReactMethod
  public void configureNativePressTargeting(ReadableMap payload, Promise promise) {
    String instanceId = payload.hasKey("instanceId") ? payload.getString("instanceId") : null;
    if (instanceId == null) {
      promise.reject(
        "search_map_render_controller_configure_native_press_targeting_invalid",
        "missing instanceId"
      );
      return;
    }
    mainHandler.post(() -> {
      InstanceState state = instances.get(instanceId);
      if (state == null) {
        promise.reject(
          "search_map_render_controller_configure_native_press_targeting_invalid",
          "unknown instance"
        );
        return;
      }
      NativePressTargetConfig config = new NativePressTargetConfig();
      config.enabled = payload.hasKey("enabled") && !payload.isNull("enabled") && payload.getBoolean("enabled");
      config.pinLayerIds = parseStringArray(payload, "pinLayerIds");
      config.labelLayerIds = parseStringArray(payload, "labelLayerIds");
      config.labelTapHitbox =
        payload.hasKey("labelTapHitbox") && !payload.isNull("labelTapHitbox")
          ? parseLabelTapHitboxConfig(payload.getMap("labelTapHitbox"))
          : null;
      config.dotLayerIds = parseStringArray(payload, "dotLayerIds");
      config.dotTapIntentRadiusPx =
        payload.hasKey("dotTapIntentRadiusPx") && !payload.isNull("dotTapIntentRadiusPx")
          ? payload.getDouble("dotTapIntentRadiusPx")
          : 0d;
      if (config.enabled) {
        ArrayList<String> instanceIds = new ArrayList<>(instances.keySet());
        for (String candidateId : instanceIds) {
          if (candidateId.equals(instanceId)) {
            continue;
          }
          InstanceState candidateState = instances.get(candidateId);
          if (candidateState != null && candidateState.mapTag == state.mapTag) {
            candidateState.nativePressTargetConfig.enabled = false;
            instances.put(candidateId, candidateState);
          }
        }
      }
      state.nativePressTargetConfig = config;
      instances.put(instanceId, state);
      promise.resolve(null);
    });
  }

  @ReactMethod
  public void queryRenderedPressTarget(ReadableMap payload, Promise promise) {
    String instanceId = payload.hasKey("instanceId") ? payload.getString("instanceId") : null;
    if (instanceId == null) {
      promise.reject(
        "search_map_render_controller_query_rendered_press_target_invalid",
        "missing instanceId"
      );
      return;
    }
    ReadableMap point = payload.hasKey("point") && !payload.isNull("point") ? payload.getMap("point") : null;
    if (point == null || !point.hasKey("x") || !point.hasKey("y")) {
      promise.reject(
        "search_map_render_controller_query_rendered_press_target_invalid",
        "missing point"
      );
      return;
    }
    double x = point.getDouble("x");
    double y = point.getDouble("y");
    ArrayList<String> pinLayerIds = parseStringArray(payload, "pinLayerIds");
    ArrayList<String> labelLayerIds = parseStringArray(payload, "labelLayerIds");
    LabelTapHitboxConfig labelTapHitbox = null;
    if (payload.hasKey("labelTapHitbox") && !payload.isNull("labelTapHitbox")) {
      labelTapHitbox = parseLabelTapHitboxConfig(payload.getMap("labelTapHitbox"));
    }
    ArrayList<String> dotLayerIds = parseStringArray(payload, "dotLayerIds");
    double[] dotQueryBox = null;
    if (payload.hasKey("dotQueryBox") && !payload.isNull("dotQueryBox")) {
      ReadableArray readableDotQueryBox = payload.getArray("dotQueryBox");
      if (readableDotQueryBox != null && readableDotQueryBox.size() == 4) {
        dotQueryBox =
          new double[] {
            readableDotQueryBox.getDouble(0),
            readableDotQueryBox.getDouble(1),
            readableDotQueryBox.getDouble(2),
            readableDotQueryBox.getDouble(3),
          };
      }
    }
    Double tapLng = null;
    Double tapLat = null;
    if (payload.hasKey("tapCoordinate") && !payload.isNull("tapCoordinate")) {
      ReadableMap tapCoordinate = payload.getMap("tapCoordinate");
      if (
        tapCoordinate != null &&
        tapCoordinate.hasKey("lng") &&
        tapCoordinate.hasKey("lat")
      ) {
        tapLng = tapCoordinate.getDouble("lng");
        tapLat = tapCoordinate.getDouble("lat");
      }
    }
    final double[] resolvedDotQueryBox = dotQueryBox;
    final Double resolvedTapLng = tapLng;
    final Double resolvedTapLat = tapLat;
    final LabelTapHitboxConfig resolvedLabelTapHitbox = labelTapHitbox;

    mainHandler.post(() -> {
      try {
        InstanceState state = instances.get(instanceId);
        if (state == null) {
          promise.reject(
            "search_map_render_controller_query_rendered_press_target_invalid",
            "unknown instance"
          );
          return;
        }
        if (
          !"enabled".equals(state.interactionMode) ||
          isNativePressSuppressed(state)
        ) {
          promise.resolve(null);
          return;
        }
        RNMBXMapView mapView = resolveMapView(state.mapTag);
        if (mapView == null) {
          throw new IllegalStateException("Map view not found for react tag " + state.mapTag);
        }
        resolveRenderedPressTarget(
          mapView,
          state,
          pinLayerIds,
          labelLayerIds,
          dotLayerIds,
          x,
          y,
          resolvedDotQueryBox,
          resolvedTapLng,
          resolvedTapLat,
          resolvedLabelTapHitbox,
          new PressTargetResolutionCallback() {
            @Override
            public void resolve(WritableMap target) {
              promise.resolve(target);
            }

            @Override
            public void reject(String code, String message, Throwable error) {
              if (error != null) {
                promise.reject(code, message, error);
              } else {
                promise.reject(code, message);
              }
            }
          }
        );
      } catch (Exception error) {
        promise.reject(
          "search_map_render_controller_query_rendered_press_target_failed",
          error
        );
      }
    });
  }

  private void resolveRenderedPressTarget(
    RNMBXMapView mapView,
    InstanceState state,
    List<String> pinLayerIds,
    List<String> labelLayerIds,
    List<String> dotLayerIds,
    double x,
    double y,
    double[] dotQueryBox,
    Double tapLng,
    Double tapLat,
    LabelTapHitboxConfig labelTapHitbox,
    PressTargetResolutionCallback callback
  ) {
    if (
      (pinLayerIds == null || pinLayerIds.isEmpty()) &&
      (labelLayerIds == null || labelLayerIds.isEmpty()) &&
      (dotLayerIds == null || dotLayerIds.isEmpty())
    ) {
      callback.resolve(null);
      return;
    }

    Runnable queryDotTarget = () -> queryRenderedDotPressTarget(
      mapView,
      state,
      dotLayerIds,
      x,
      y,
      dotQueryBox,
      tapLng,
      tapLat,
      callback
    );

    Runnable queryLabelTarget = () -> {
      if (labelLayerIds == null || labelLayerIds.isEmpty()) {
        queryDotTarget.run();
        return;
      }
      RenderedQueryGeometry queryGeometry =
        new RenderedQueryGeometry(
          new ScreenBox(
            new ScreenCoordinate(x - 0.5d, y - 0.5d),
            new ScreenCoordinate(x + 0.5d, y + 0.5d)
          )
        );
      RenderedQueryOptions labelQueryOptions = new RenderedQueryOptions(labelLayerIds, null);
      mapView.getMapboxMap().queryRenderedFeatures(
        queryGeometry,
        labelQueryOptions,
        labelQueryResult -> mainHandler.post(() -> {
          if (labelQueryResult.isError()) {
            callback.reject(
              "search_map_render_controller_query_rendered_press_target_failed",
              labelQueryResult.getError(),
              null
            );
            return;
          }
          WritableMap labelTarget = buildRenderedLabelPressTarget(
            labelQueryResult.getValue(),
            new LinkedHashSet<>(state.pinSlotSourceIds),
            mapView,
            x,
            y,
            labelTapHitbox
          );
          if (labelTarget != null) {
            callback.resolve(labelTarget);
          } else {
            queryDotTarget.run();
          }
        })
      );
    };

    if (pinLayerIds == null || pinLayerIds.isEmpty()) {
      queryLabelTarget.run();
      return;
    }

    RenderedQueryGeometry queryGeometry =
      new RenderedQueryGeometry(
        new ScreenBox(
          new ScreenCoordinate(x - 0.5d, y - 0.5d),
          new ScreenCoordinate(x + 0.5d, y + 0.5d)
        )
      );
    RenderedQueryOptions pinQueryOptions = new RenderedQueryOptions(pinLayerIds, null);
    mapView.getMapboxMap().queryRenderedFeatures(
      queryGeometry,
      pinQueryOptions,
      pinQueryResult -> mainHandler.post(() -> {
        if (pinQueryResult.isError()) {
          callback.reject(
            "search_map_render_controller_query_rendered_press_target_failed",
            pinQueryResult.getError(),
            null
          );
          return;
        }
        WritableMap pinTarget = buildRenderedPinPressTarget(
          pinQueryResult.getValue(),
          new LinkedHashSet<>(state.pinSlotSourceIds)
        );
        if (pinTarget != null) {
          callback.resolve(pinTarget);
          return;
        }
        queryLabelTarget.run();
      })
    );
  }

  private void queryRenderedDotPressTarget(
    RNMBXMapView mapView,
    InstanceState state,
    List<String> dotLayerIds,
    double x,
    double y,
    double[] dotQueryBox,
    Double tapLng,
    Double tapLat,
    PressTargetResolutionCallback callback
  ) {
    if (dotLayerIds == null || dotLayerIds.isEmpty()) {
      callback.resolve(null);
      return;
    }
    ScreenBox queryBox;
    if (dotQueryBox != null && dotQueryBox.length == 4) {
      double x1 = dotQueryBox[0];
      double y1 = dotQueryBox[1];
      double x2 = dotQueryBox[2];
      double y2 = dotQueryBox[3];
      queryBox =
        new ScreenBox(
          new ScreenCoordinate(Math.min(x1, x2), Math.min(y1, y2)),
          new ScreenCoordinate(Math.max(x1, x2), Math.max(y1, y2))
        );
    } else {
      queryBox =
        new ScreenBox(
          new ScreenCoordinate(x - 0.5d, y - 0.5d),
          new ScreenCoordinate(x + 0.5d, y + 0.5d)
        );
    }
    RenderedQueryGeometry queryGeometry = new RenderedQueryGeometry(queryBox);
    RenderedQueryOptions dotQueryOptions = new RenderedQueryOptions(dotLayerIds, null);
    mapView.getMapboxMap().queryRenderedFeatures(
      queryGeometry,
      dotQueryOptions,
      dotQueryResult -> mainHandler.post(() -> {
        if (dotQueryResult.isError()) {
          callback.reject(
            "search_map_render_controller_query_rendered_press_target_failed",
            dotQueryResult.getError(),
            null
          );
          return;
        }
        WritableMap dotTarget = buildRenderedDotPressTarget(
          dotQueryResult.getValue(),
          state.dotSourceId,
          tapLng,
          tapLat
        );
        callback.resolve(dotTarget);
      })
    );
  }

  @ReactMethod
  public void reset(String instanceId, Promise promise) {
    InstanceState state = instances.get(instanceId);
    if (state != null) {
      state.lastPinCount = 0;
      state.lastDotCount = 0;
      state.lastLabelCount = 0;
      state.lastPresentationBatchPhase = "idle";
      state.lastEnterRequestKey = null;
      state.enterLane = new EnterLaneState();
      state.lastEnterStartToken = null;
      state.lastEnterStartedRequestKey = null;
      state.lastEnterSettledRequestKey = null;
      state.lastDismissRequestKey = null;
      state.currentPresentationRenderPhase = "idle";
      state.visualSourceLifecycleState = VISUAL_SOURCE_HIDDEN;
      state.labelCollisionObstacleLayersVisible = false;
      state.lastPresentationStateJson = null;
      state.activeFrameGenerationId = null;
      state.activeExecutionBatchId = null;
      state.sourceReadyFrameGenerationId = null;
      state.sourceReadyExecutionBatchId = null;
      state.residentSourceFrameKey = null;
      state.residentSourceDataKey = null;
      state.highlightedMarkerKey = null;
      state.highlightedMarkerKeys.clear();
      state.highlightedRestaurantId = null;
      state.interactionMode = "enabled";
      state.keepSourcesHiddenUntilEnter = true;
      state.currentPresentationOpacityTarget = 1;
      state.currentPresentationOpacityValue = 0;
      state.nextSourceCommitSequence = 0L;
      state.pendingPresentationSettleRequestKey = null;
      state.pendingPresentationSettleKind = null;
      state.blockedEnterStartRequestKey = null;
      state.blockedPresentationSettleRequestKey = null;
      state.blockedPresentationSettleKind = null;
      state.blockedEnterStartCommitFenceDataIdsBySourceId.clear();
      state.blockedPresentationCommitFenceDataIdsBySourceId.clear();
      state.pendingSourceCommitDataIdsBySourceId.clear();
      state.residentDesiredSourceCacheBySourceId.clear();
      state.currentViewportIsMoving = false;
      state.isAwaitingSourceRecovery = false;
      state.isReplayingSourceRecovery = false;
      state.sourceRecoveryPausedAtMs = null;
      initializeDerivedFamilyStates(state);
    }
    cancelLivePinTransitionAnimation(instanceId);
    Runnable pendingRevealRunnable = enterSettleRunnables.remove(instanceId);
    if (pendingRevealRunnable != null) {
      mainHandler.removeCallbacks(pendingRevealRunnable);
    }
    Runnable pendingRunnable = dismissSettleRunnables.remove(instanceId);
    if (pendingRunnable != null) {
      mainHandler.removeCallbacks(pendingRunnable);
    }
    Runnable labelObservationRefreshRunnable = labelObservationRefreshRunnables.remove(instanceId);
    if (labelObservationRefreshRunnable != null) {
      mainHandler.removeCallbacks(labelObservationRefreshRunnable);
    }
    promise.resolve(null);
  }

  @ReactMethod
  public void addListener(String eventName) {
  }

  @ReactMethod
  public void removeListeners(double count) {
  }

  private void applySnapshots(InstanceState state, String[][] snapshots) throws Exception {
    if (!ensureSourcesReady(state, null, sourceIdsFromSnapshots(snapshots), "apply_snapshots", true)) {
      return;
    }
    withStyle(state.mapTag, style -> {
      ArrayList<ParsedCollectionApplyPlan> plans = new ArrayList<>();
      for (String[] snapshot : snapshots) {
        String sourceId = snapshot[0];
        ParsedFeatureCollection next = parseFeatureCollection(snapshot[0], snapshot[1]);
        SourceState previousSourceState = mountedSourceState(state, sourceId);
        plans.add(
          new ParsedCollectionApplyPlan(
            sourceId,
            next,
            previousSourceState
            ,
            previousSourceState != null
              ? previousSourceState.featureStateById
              : Collections.emptyMap(),
            previousSourceState != null
              ? previousSourceState.featureStateRevision
              : ""
          )
        );
      }
      applyParsedCollectionBatch(style, state, "__native_diag__", plans);
    });
  }

  private PreparedDerivedPinAndLabelOutput prepareDerivedPinAndLabelOutput(
    InstanceState state,
    DesiredPinSnapshotState desiredPinSnapshot,
    double nowMs
  ) {
      DerivedFamilyState pinFamilyState = derivedFamilyState(state, state.pinSourceId);
      Set<String> desiredPinIds = new HashSet<>(desiredPinSnapshot.pinIdsInOrder);
      ArrayList<Map.Entry<String, LivePinTransition>> exitingTransitions = new ArrayList<>();
      for (Map.Entry<String, LivePinTransition> entry : pinFamilyState.livePinTransitionsByMarkerKey.entrySet()) {
        if (
          !entry.getValue().isAwaitingSourceCommit &&
          !desiredPinIds.contains(entry.getKey()) &&
          livePinTransitionOpacity(entry.getValue(), nowMs) > 0.001d
        ) {
          exitingTransitions.add(entry);
        }
      }
      exitingTransitions.sort((left, right) -> Integer.compare(left.getValue().orderHint, right.getValue().orderHint));

      ArrayList<String> orderedMarkerKeys = new ArrayList<>(desiredPinSnapshot.pinIdsInOrder);
      for (Map.Entry<String, LivePinTransition> entry : exitingTransitions) {
        orderedMarkerKeys.add(entry.getKey());
      }
      Set<String> dirtyPinMarkerKeys = new LinkedHashSet<>(desiredPinSnapshot.dirtyPinMarkerKeys);
      Set<String> dirtyPinInteractionMarkerKeys = new LinkedHashSet<>(desiredPinSnapshot.dirtyPinInteractionMarkerKeys);
      dirtyPinInteractionMarkerKeys.addAll(dirtyPinMarkerKeys);
      Set<String> dirtyLabelMarkerKeys = new LinkedHashSet<>(desiredPinSnapshot.dirtyLabelMarkerKeys);
      Set<String> dirtyLabelCollisionMarkerKeys = new LinkedHashSet<>(desiredPinSnapshot.dirtyLabelCollisionMarkerKeys);
      boolean reusePins = dirtyPinMarkerKeys.isEmpty();
      boolean reusePinInteractions = dirtyPinInteractionMarkerKeys.isEmpty();
      boolean reuseLabels = dirtyLabelMarkerKeys.isEmpty();
      boolean reuseLabelCollisions = dirtyLabelCollisionMarkerKeys.isEmpty();
      DerivedFamilyState pinInteractionFamilyState = derivedFamilyState(state, state.pinInteractionSourceId);
      DerivedFamilyState labelFamilyState = derivedFamilyState(state, state.labelSourceId);
      DerivedFamilyState labelCollisionFamilyState = derivedFamilyState(state, state.labelCollisionSourceId);
      Set<String> orderedMarkerKeySet = new LinkedHashSet<>(orderedMarkerKeys);
      ArrayList<String> nextPinIdsInOrder = reusePins ? null : new ArrayList<>();
      Map<String, Feature> nextPinFeatureById =
        reusePins ? null : new HashMap<>(pinFamilyState.collection.featureById);
      Map<String, HashMap<String, Value>> nextPinFeatureStateById =
        reusePins ? null : new HashMap<>(pinFamilyState.collection.featureStateById);
      Map<String, String> nextPinMarkerKeyByFeatureId =
        reusePins ? null : new HashMap<>(pinFamilyState.collection.markerKeyByFeatureId);
      ArrayList<String> nextPinInteractionIdsInOrder = reusePinInteractions ? null : new ArrayList<>();
      Map<String, Feature> nextPinInteractionFeatureById =
        reusePinInteractions ? null : new HashMap<>(pinInteractionFamilyState.collection.featureById);
      Map<String, String> nextPinInteractionMarkerKeyByFeatureId =
        reusePinInteractions ? null : new HashMap<>(pinInteractionFamilyState.collection.markerKeyByFeatureId);
      ArrayList<String> nextLabelIdsInOrder = reuseLabels ? null : new ArrayList<>();
      Map<String, Feature> nextLabelFeatureById =
        reuseLabels ? null : new HashMap<>(labelFamilyState.collection.featureById);
      Map<String, HashMap<String, Value>> nextLabelFeatureStateById =
        reuseLabels ? null : new HashMap<>(labelFamilyState.collection.featureStateById);
      Map<String, String> nextLabelMarkerKeyByFeatureId =
        reuseLabels ? null : new HashMap<>(labelFamilyState.collection.markerKeyByFeatureId);
      Map<String, ArrayList<String>> previousLabelIdsByMarkerKey = new HashMap<>();
      Map<String, ArrayList<String>> previousLabelIdsByMarkerKeySnapshot = new HashMap<>();
      if (!reuseLabels) {
        for (String featureId : labelFamilyState.collection.idsInOrder) {
          String markerKey =
            labelFamilyState.collection.markerKeyByFeatureId.containsKey(featureId)
              ? labelFamilyState.collection.markerKeyByFeatureId.get(featureId)
              : featureId;
          previousLabelIdsByMarkerKey.computeIfAbsent(markerKey, ignored -> new ArrayList<>()).add(featureId);
        }
        previousLabelIdsByMarkerKeySnapshot.putAll(previousLabelIdsByMarkerKey);
        for (String markerKey : dirtyLabelMarkerKeys) {
          if (orderedMarkerKeySet.contains(markerKey)) {
            continue;
          }
          ArrayList<String> previousLabelIds = previousLabelIdsByMarkerKey.get(markerKey);
          if (previousLabelIds != null) {
            for (String featureId : previousLabelIds) {
              nextLabelFeatureById.remove(featureId);
              nextLabelFeatureStateById.remove(featureId);
              nextLabelMarkerKeyByFeatureId.remove(featureId);
            }
          }
          previousLabelIdsByMarkerKey.remove(markerKey);
        }
      }
      if (!reusePins) {
        for (String markerKey : dirtyPinMarkerKeys) {
          if (orderedMarkerKeySet.contains(markerKey)) {
            continue;
          }
          nextPinFeatureById.remove(markerKey);
          nextPinFeatureStateById.remove(markerKey);
          nextPinMarkerKeyByFeatureId.remove(markerKey);
        }
      }
      if (!reusePinInteractions) {
        for (String markerKey : dirtyPinInteractionMarkerKeys) {
          if (orderedMarkerKeySet.contains(markerKey)) {
            continue;
          }
          nextPinInteractionFeatureById.remove(markerKey);
          nextPinInteractionMarkerKeyByFeatureId.remove(markerKey);
        }
      }

      for (String markerKey : orderedMarkerKeys) {
        boolean desiredPresent = desiredPinIds.contains(markerKey);
        LivePinTransition transition = pinFamilyState.livePinTransitionsByMarkerKey.get(markerKey);
        int lodZ =
          desiredPinSnapshot.pinLodZByMarkerKey.containsKey(markerKey)
            ? desiredPinSnapshot.pinLodZByMarkerKey.get(markerKey)
            : transition != null ? transition.lodZ : 0;
        boolean shouldRenderMarker =
          desiredPresent ||
          (transition != null && livePinTransitionOpacity(transition, nowMs) > 0.001d);
        if (!shouldRenderMarker) {
          continue;
        }

        Feature pinFeature =
          desiredPresent
            ? desiredPinSnapshot.pinFeatureByMarkerKey.get(markerKey)
            : transition != null ? transition.pinFeature : null;
        if (!reusePins) {
          nextPinIdsInOrder.add(markerKey);
          if (dirtyPinMarkerKeys.contains(markerKey) && pinFeature != null) {
            HashMap<String, Double> pinNumericProperties = new HashMap<>();
            boolean shouldSeedHidden = desiredPresent && transition != null && transition.targetOpacity == 1d;
            pinNumericProperties.put("nativeLodOpacity", shouldSeedHidden ? 0d : 1d);
            pinNumericProperties.put("nativeLodRankOpacity", shouldSeedHidden ? 0d : 1d);
            pinNumericProperties.put("nativeLodZ", (double) lodZ);
            Feature renderFeature = featureWithNumericProperties(pinFeature, pinNumericProperties);
            nextPinFeatureById.put(markerKey, renderFeature);
            nextPinMarkerKeyByFeatureId.put(markerKey, markerKey);
            if (pinFamilyState.transientFeatureStateById.containsKey(markerKey)) {
              nextPinFeatureStateById.put(markerKey, new HashMap<>(pinFamilyState.transientFeatureStateById.get(markerKey)));
            } else {
              nextPinFeatureStateById.remove(markerKey);
            }
          }
        }

        // Pin interaction geometry must be queryable as soon as the desired pin exists.
        // The reveal cover and interaction mode own tap availability; delaying this
        // source until visual transitions settle leaves visible pins without hit targets.
        boolean shouldRenderPinInteraction =
          desiredPresent &&
          desiredPinSnapshot.pinInteractionFeatureByMarkerKey.containsKey(markerKey);
        if (!reusePinInteractions && shouldRenderPinInteraction) {
          Feature pinInteractionFeature = desiredPinSnapshot.pinInteractionFeatureByMarkerKey.get(markerKey);
          nextPinInteractionIdsInOrder.add(markerKey);
          if (dirtyPinInteractionMarkerKeys.contains(markerKey) && pinInteractionFeature != null) {
            Feature interactionFeature =
              featureWithNumericProperties(
                pinInteractionFeature,
                Collections.singletonMap("nativeLodZ", (double) lodZ)
              );
            nextPinInteractionFeatureById.put(markerKey, interactionFeature);
            nextPinInteractionMarkerKeyByFeatureId.put(markerKey, markerKey);
          }
        } else if (!reusePinInteractions && dirtyPinInteractionMarkerKeys.contains(markerKey)) {
          nextPinInteractionFeatureById.remove(markerKey);
          nextPinInteractionMarkerKeyByFeatureId.remove(markerKey);
        }

        List<FeatureRecord> markerLabelFeatures =
          desiredPinSnapshot.labelFeaturesByMarkerKey.containsKey(markerKey)
            ? desiredPinSnapshot.labelFeaturesByMarkerKey.get(markerKey)
            : transition != null ? transition.labelFeatures : Collections.emptyList();
        if (!reuseLabels) {
          if (dirtyLabelMarkerKeys.contains(markerKey)) {
            ArrayList<String> previousLabelIds = previousLabelIdsByMarkerKey.get(markerKey);
            if (previousLabelIds != null) {
              for (String featureId : previousLabelIds) {
                nextLabelFeatureById.remove(featureId);
                nextLabelFeatureStateById.remove(featureId);
                nextLabelMarkerKeyByFeatureId.remove(featureId);
              }
            }
            boolean shouldSeedLabelHidden = desiredPresent && transition != null && transition.targetOpacity == 1d;
            ArrayList<String> nextMarkerLabelIds = new ArrayList<>();
            for (FeatureRecord labelFeature : markerLabelFeatures) {
              HashMap<String, Double> labelNumericProperties = new HashMap<>();
              labelNumericProperties.put("nativeLabelOpacity", shouldSeedLabelHidden ? 0d : 1d);
              labelNumericProperties.put("nativeLodZ", (double) lodZ);
              Feature renderFeature =
                featureWithNumericProperties(labelFeature.feature, labelNumericProperties);
              nextMarkerLabelIds.add(labelFeature.id);
              nextLabelFeatureById.put(labelFeature.id, renderFeature);
              nextLabelMarkerKeyByFeatureId.put(labelFeature.id, markerKey);
              HashMap<String, Value> featureState =
                retainedLabelFeatureState(labelFeature.feature, markerKey);
              if (labelFamilyState.transientFeatureStateById.containsKey(labelFeature.id)) {
                featureState.putAll(labelFamilyState.transientFeatureStateById.get(labelFeature.id));
              }
              nextLabelFeatureStateById.put(labelFeature.id, featureState);
            }
            previousLabelIdsByMarkerKey.put(markerKey, nextMarkerLabelIds);
          }
          List<String> nextMarkerLabelIds = previousLabelIdsByMarkerKey.get(markerKey);
          if (nextMarkerLabelIds != null) {
            nextLabelIdsInOrder.addAll(nextMarkerLabelIds);
          }
        }
      }
      SourceState previousPinSourceState = pinFamilyState.sourceState;
      ParsedFeatureCollection nextPins;
      if (reusePins) {
        nextPins = pinFamilyState.collection;
      } else {
        Set<String> nextPinIdSet = new LinkedHashSet<>(nextPinIdsInOrder);
        for (String removedFeatureId : new LinkedHashSet<>(pinFamilyState.collection.idsInOrder)) {
          if (nextPinIdSet.contains(removedFeatureId)) {
            continue;
          }
          nextPinFeatureById.remove(removedFeatureId);
          nextPinFeatureStateById.remove(removedFeatureId);
          nextPinMarkerKeyByFeatureId.remove(removedFeatureId);
        }
        Set<String> removedPinGroupIds = new LinkedHashSet<>();
        for (String markerKey : dirtyPinMarkerKeys) {
          if (!nextPinIdSet.contains(markerKey)) {
            removedPinGroupIds.add(markerKey);
          }
        }
        replaceParsedFeatureCollection(
          pinFamilyState.collection,
          previousPinSourceState,
          nextPinIdsInOrder,
          nextPinFeatureById,
          nextPinFeatureStateById,
          nextPinMarkerKeyByFeatureId,
          dirtyPinMarkerKeys,
          dirtyPinMarkerKeys,
          removedPinGroupIds
        );
        nextPins = pinFamilyState.collection;
        markLogicalFamilyCollectionResident(pinFamilyState);
      }
      long pinStartedAt = System.nanoTime();

      SourceState previousPinInteractionSourceState = pinInteractionFamilyState.sourceState;
      ParsedFeatureCollection nextPinInteractions;
      if (reusePinInteractions) {
        nextPinInteractions = pinInteractionFamilyState.collection;
      } else {
        Set<String> nextPinInteractionIdSet = new LinkedHashSet<>(nextPinInteractionIdsInOrder);
        for (String removedFeatureId : new LinkedHashSet<>(pinInteractionFamilyState.collection.idsInOrder)) {
          if (nextPinInteractionIdSet.contains(removedFeatureId)) {
            continue;
          }
          nextPinInteractionFeatureById.remove(removedFeatureId);
          nextPinInteractionMarkerKeyByFeatureId.remove(removedFeatureId);
        }
        Set<String> removedPinInteractionGroupIds = new LinkedHashSet<>();
        for (String markerKey : dirtyPinInteractionMarkerKeys) {
          if (!nextPinInteractionIdSet.contains(markerKey)) {
            removedPinInteractionGroupIds.add(markerKey);
          }
        }
        replaceParsedFeatureCollection(
          pinInteractionFamilyState.collection,
          previousPinInteractionSourceState,
          nextPinInteractionIdsInOrder,
          nextPinInteractionFeatureById,
          new HashMap<>(),
          nextPinInteractionMarkerKeyByFeatureId,
          dirtyPinInteractionMarkerKeys,
          dirtyPinInteractionMarkerKeys,
          removedPinInteractionGroupIds
        );
        nextPinInteractions = pinInteractionFamilyState.collection;
        markLogicalFamilyCollectionResident(pinInteractionFamilyState);
      }
      SourceState previousLabelSourceState = labelFamilyState.sourceState;
      ParsedFeatureCollection nextLabels;
      if (reuseLabels) {
        nextLabels = labelFamilyState.collection;
      } else {
        Set<String> nextLabelIdSet = new LinkedHashSet<>(nextLabelIdsInOrder);
        for (String removedFeatureId : new LinkedHashSet<>(labelFamilyState.collection.idsInOrder)) {
          if (nextLabelIdSet.contains(removedFeatureId)) {
            continue;
          }
          nextLabelFeatureById.remove(removedFeatureId);
          nextLabelFeatureStateById.remove(removedFeatureId);
          nextLabelMarkerKeyByFeatureId.remove(removedFeatureId);
        }
        Set<String> removedLabelGroupIds = new LinkedHashSet<>();
        for (String markerKey : dirtyLabelMarkerKeys) {
          ArrayList<String> previousLabelIds = previousLabelIdsByMarkerKeySnapshot.get(markerKey);
          ArrayList<String> nextLabelIds = previousLabelIdsByMarkerKey.get(markerKey);
          if (previousLabelIds != null && !previousLabelIds.isEmpty() && (nextLabelIds == null || nextLabelIds.isEmpty())) {
            removedLabelGroupIds.add(markerKey);
          }
        }
        replaceParsedFeatureCollection(
          labelFamilyState.collection,
          previousLabelSourceState,
          nextLabelIdsInOrder,
          nextLabelFeatureById,
          nextLabelFeatureStateById,
          nextLabelMarkerKeyByFeatureId,
          dirtyLabelMarkerKeys,
          dirtyLabelMarkerKeys,
          removedLabelGroupIds
        );
        nextLabels = labelFamilyState.collection;
        markLogicalFamilyCollectionResident(labelFamilyState);
      }
      SourceState previousLabelCollisionSourceState = labelCollisionFamilyState.sourceState;
      ParsedFeatureCollection nextLabelCollisions;
      if (reuseLabelCollisions) {
        nextLabelCollisions = labelCollisionFamilyState.collection;
      } else {
        ArrayList<String> nextLabelCollisionIdsInOrder = new ArrayList<>(
          desiredPinSnapshot.labelCollisionFeatureByMarkerKey.keySet()
        );
        Collections.sort(nextLabelCollisionIdsInOrder);
        Map<String, Feature> nextLabelCollisionFeatureById = new HashMap<>(labelCollisionFamilyState.collection.featureById);
        Map<String, String> nextLabelCollisionMarkerKeyByFeatureId = new HashMap<>(labelCollisionFamilyState.collection.markerKeyByFeatureId);
        for (String markerKey : dirtyLabelCollisionMarkerKeys) {
          Feature feature = desiredPinSnapshot.labelCollisionFeatureByMarkerKey.get(markerKey);
          if (feature != null) {
            int lodZ =
              desiredPinSnapshot.pinLodZByMarkerKey.containsKey(markerKey)
                ? desiredPinSnapshot.pinLodZByMarkerKey.get(markerKey)
                : 0;
            nextLabelCollisionFeatureById.put(
              markerKey,
              featureWithNumericProperties(
                feature,
                Collections.singletonMap("nativeLodZ", (double) lodZ)
              )
            );
            nextLabelCollisionMarkerKeyByFeatureId.put(markerKey, markerKey);
          } else {
            nextLabelCollisionFeatureById.remove(markerKey);
            nextLabelCollisionMarkerKeyByFeatureId.remove(markerKey);
          }
        }
        Set<String> removedLabelCollisionGroupIds = new LinkedHashSet<>();
        for (String markerKey : dirtyLabelCollisionMarkerKeys) {
          if (!desiredPinSnapshot.labelCollisionFeatureByMarkerKey.containsKey(markerKey)) {
            removedLabelCollisionGroupIds.add(markerKey);
          }
        }
        replaceParsedFeatureCollection(
          labelCollisionFamilyState.collection,
          previousLabelCollisionSourceState,
          nextLabelCollisionIdsInOrder,
          nextLabelCollisionFeatureById,
          new HashMap<>(),
          nextLabelCollisionMarkerKeyByFeatureId,
          dirtyLabelCollisionMarkerKeys,
          dirtyLabelCollisionMarkerKeys,
          removedLabelCollisionGroupIds
        );
        nextLabelCollisions = labelCollisionFamilyState.collection;
      }
      ParsedFeatureCollection promotedSlotCollection =
        makePromotedSlotCollection(
          orderedMarkerKeys,
          nextPins,
          nextPinInteractions,
          nextLabels
        );
      LinkedHashSet<String> previousPromotedGroupIds = new LinkedHashSet<>();
      for (String sourceId : state.pinSlotSourceIds) {
        previousPromotedGroupIds.addAll(derivedFamilyState(state, sourceId).collection.groupOrder);
      }
      LinkedHashSet<String> promotedDirtyGroupIds = new LinkedHashSet<>();
      promotedDirtyGroupIds.addAll(dirtyPinMarkerKeys);
      promotedDirtyGroupIds.addAll(dirtyPinInteractionMarkerKeys);
      promotedDirtyGroupIds.addAll(dirtyLabelMarkerKeys);
      promotedDirtyGroupIds.addAll(dirtyLabelCollisionMarkerKeys);
      LinkedHashSet<String> nextPromotedGroupIds = new LinkedHashSet<>(orderedMarkerKeys);
      for (String previousGroupId : previousPromotedGroupIds) {
        if (!nextPromotedGroupIds.contains(previousGroupId)) {
          promotedDirtyGroupIds.add(previousGroupId);
          promotedSlotCollection.removedGroupIds.add(previousGroupId);
        }
      }
      for (String nextGroupId : nextPromotedGroupIds) {
        if (!previousPromotedGroupIds.contains(nextGroupId)) {
          promotedDirtyGroupIds.add(nextGroupId);
        }
      }
      promotedSlotCollection.dirtyGroupIds.addAll(promotedDirtyGroupIds);
      promotedSlotCollection.orderChangedGroupIds.addAll(promotedDirtyGroupIds);
      ArrayList<ParsedCollectionApplyPlan> plans = new ArrayList<>();
      if (
        !Objects.equals(
          previousLabelCollisionSourceState.sourceRevision,
          labelCollisionFamilyState.collection.sourceRevision
        ) ||
        !Objects.equals(
          previousLabelCollisionSourceState.featureStateRevision,
          labelCollisionFamilyState.collection.featureStateRevision
        )
      ) {
        plans.add(
          new ParsedCollectionApplyPlan(
            state.labelCollisionSourceId,
            nextLabelCollisions,
            previousLabelCollisionSourceState,
            previousLabelCollisionSourceState.featureStateById,
            previousLabelCollisionSourceState.featureStateRevision
          )
        );
      }
      plans.addAll(buildSlotApplyPlans(state, state.pinSlotSourceIds, promotedSlotCollection));
      return new PreparedDerivedPinAndLabelOutput(
        plans,
        state.pinSlotSourceIds,
        pinStartedAt
      );
  }

  private void finalizePreparedPinAndLabelOutput(
    String instanceId,
    InstanceState state,
    PreparedDerivedPinAndLabelOutput prepared,
    Map<String, MutationSummary> mutationSummaryBySourceId
  ) {
    int addCount = 0;
    int updateCount = 0;
    int removeCount = 0;
    boolean hasMutations = false;
    DerivedFamilyState pinFamilyState = derivedFamilyState(state, state.pinSourceId);
    for (String pinSourceId : prepared.pinSourceIds) {
      MutationSummary pinMutationSummary =
        mutationSummaryBySourceId.getOrDefault(
          pinSourceId,
          new MutationSummary(0, 0, 0, null, Collections.emptyList())
        );
      addCount += pinMutationSummary.addCount;
      updateCount += pinMutationSummary.updateCount;
      removeCount += pinMutationSummary.removeCount;
      hasMutations = hasMutations || pinMutationSummary.hasMutations();
      if (pinMutationSummary.dataId == null || pinMutationSummary.addedFeatureIds.isEmpty()) {
        continue;
      }
      for (String featureId : pinMutationSummary.addedFeatureIds) {
        LivePinTransition transition = pinFamilyState.livePinTransitionsByMarkerKey.get(featureId);
        if (transition == null || !transition.isAwaitingSourceCommit) {
          continue;
        }
        transition.awaitingSourceDataId = pinMutationSummary.dataId;
      }
    }
    if (hasMutations) {
      double durationMs = (System.nanoTime() - prepared.pinStartedAtNs) / 1_000_000d;
      emitVisualDiag(
        instanceId,
        "pin_lod_apply phase=" +
        state.lastPresentationBatchPhase +
        " execution=" +
        state.currentPresentationRenderPhase +
        " opacity=" +
        state.currentPresentationOpacityTarget +
        " pins=" +
        state.lastPinCount +
        " add=" +
        addCount +
        " update=" +
        updateCount +
        " remove=" +
        removeCount +
        " durationMs=" +
        Math.round(durationMs)
      );
    }
  }

  private static boolean usesFrozenPresentationSnapshot(InstanceState state) {
    return false;
  }
  private void startEnterPresentation(
    String instanceId,
    String requestKey,
    double revealStartToken,
    String previousPresentationBatchPhase,
    Double previousPresentationOpacityTarget
  ) throws Exception {
    InstanceState state = instances.get(instanceId);
    if (state == null) {
      return;
    }
    String requestedRevealRequestKey = state.enterLane.requestedRequestKey;
    ExecutionBatchRef mountedHiddenExecutionBatch = state.enterLane.mountedHidden;
    if (
      requestedRevealRequestKey == null ||
      !stringEquals(requestedRevealRequestKey, requestKey) ||
      mountedHiddenExecutionBatch == null
    ) {
      return;
    }
    if (!stringEquals(state.lastEnterRequestKey, requestKey)) {
      return;
    }
    if (!isActiveFrameSourceReady(state) || !isActiveFrameLabelPlacementReady(state)) {
      return;
    }
    if (stringEquals(state.lastEnterStartedRequestKey, requestKey)) {
      return;
    }
    if (state.lastDismissRequestKey != null) {
      return;
    }
    state.blockedEnterStartRequestKey = null;
    state.blockedEnterStartCommitFenceDataIdsBySourceId.clear();
    state.lastEnterStartToken = revealStartToken;
    state.enterLane.entering = mountedHiddenExecutionBatch;
    state.currentPresentationRenderPhase = "entering";
    state.visualSourceLifecycleState = VISUAL_SOURCE_REVEALING;
    state.keepSourcesHiddenUntilEnter = false;
    state.currentPresentationOpacityTarget = 1;
    instances.put(instanceId, state);
    restartLiveEnterTransitionsForRevealStart(instanceId, state);
    applyLivePinTransitionFeatureStates(instanceId);
    state = instances.get(instanceId);
    if (state == null) {
      return;
    }
    applyPresentationOpacity(state, state.currentPresentationOpacityTarget);
    state.lastEnterStartedRequestKey = requestKey;
    emitVisualDiag(
      instanceId,
      "presentation_transition previousPhase=" +
      (previousPresentationBatchPhase != null ? previousPresentationBatchPhase : state.lastPresentationBatchPhase) +
      " nextPhase=" +
      state.lastPresentationBatchPhase +
      " previousOpacity=" +
      (previousPresentationOpacityTarget != null
        ? previousPresentationOpacityTarget.doubleValue()
        : state.currentPresentationOpacityTarget) +
      " nextOpacity=" +
      state.currentPresentationOpacityTarget +
      " revealRequest=" +
      requestKey +
      " dismissRequest=" +
      (state.lastDismissRequestKey != null ? state.lastDismissRequestKey : "nil")
    );
    emitVisualDiag(
      instanceId,
      "enter_started phase=" +
      state.lastPresentationBatchPhase +
      " pins=" +
      state.lastPinCount +
      " dots=" +
      state.lastDotCount +
      " labels=" +
      state.lastLabelCount +
      " " +
      phaseSummary(state)
    );
    WritableMap startedEvent = Arguments.createMap();
    startedEvent.putString("type", "presentation_enter_started");
    startedEvent.putString("instanceId", instanceId);
    startedEvent.putString("requestKey", requestKey);
    startedEvent.putString(
      "frameGenerationId",
      state.enterLane.entering != null ? state.enterLane.entering.generationId : null
    );
    startedEvent.putString(
      "executionBatchId",
      state.enterLane.entering != null ? state.enterLane.entering.batchId : null
    );
    startedEvent.putDouble("startedAtMs", nowMs());
    emit(startedEvent);
    Runnable settledRunnable = () -> {
      enterSettleRunnables.remove(instanceId);
      InstanceState latestState = instances.get(instanceId);
      if (latestState == null) {
        return;
      }
      if (!stringEquals(latestState.lastEnterRequestKey, requestKey)) {
        return;
      }
      if (!stringEquals(latestState.lastEnterStartedRequestKey, requestKey)) {
        return;
      }
      if (stringEquals(latestState.lastEnterSettledRequestKey, requestKey)) {
        return;
      }
      if (latestState.lastDismissRequestKey != null) {
        return;
      }
      Map<String, Set<String>> commitFence = capturePendingVisualSourceCommitFence(latestState);
      if (hasPendingCommitFence(commitFence)) {
        latestState.blockedPresentationSettleRequestKey = requestKey;
        latestState.blockedPresentationSettleKind = "enter";
        latestState.currentPresentationRenderPhase = "enter_wait_commit";
        latestState.blockedPresentationCommitFenceDataIdsBySourceId.clear();
        latestState.blockedPresentationCommitFenceDataIdsBySourceId.putAll(commitFence);
        emitVisualDiag(
          instanceId,
          "enter_commit_fence_blocked pending=" + describeCommitFence(commitFence)
        );
      } else {
        latestState.currentPresentationRenderPhase = "enter_settling";
        latestState.pendingPresentationSettleRequestKey = requestKey;
        latestState.pendingPresentationSettleKind = "enter";
        armNativeEnterSettle(instanceId, requestKey);
      }
      instances.put(instanceId, latestState);
    };
    enterSettleRunnables.put(instanceId, settledRunnable);
    mainHandler.postDelayed(settledRunnable, REVEAL_SETTLE_DELAY_MS);
  }

  private void startEnterPresentationIfReady(
    String instanceId,
    InstanceState state,
    String previousPresentationBatchPhase,
    Double previousPresentationOpacityTarget
  ) throws Exception {
    String revealRequestKey = state.lastEnterRequestKey;
    Double revealStartToken = readEnterStartToken(state.lastPresentationStateJson);
    if (
      revealRequestKey == null ||
      revealStartToken == null ||
      !"entering".equals(readEnterStatus(state.lastPresentationStateJson)) ||
      !"entering".equals(state.lastPresentationBatchPhase) ||
      !stringEquals(state.enterLane.requestedRequestKey, revealRequestKey) ||
      state.enterLane.mountedHidden == null ||
      doubleEquals(state.lastEnterStartToken, revealStartToken) ||
      stringEquals(state.lastEnterStartedRequestKey, revealRequestKey) ||
      state.blockedEnterStartRequestKey != null
    ) {
      return;
    }
    startEnterPresentation(
      instanceId,
      revealRequestKey,
      revealStartToken.doubleValue(),
      previousPresentationBatchPhase,
      previousPresentationOpacityTarget
    );
  }

  private void emitExecutionBatchMountedHidden(
    String instanceId,
    ExecutionBatchRef executionBatch,
    InstanceState state
  ) {
    if (!stringEquals(state.lastEnterRequestKey, executionBatch.requestKey)) {
      return;
    }
    if (!stringEquals(state.enterLane.requestedRequestKey, executionBatch.requestKey)) {
      return;
    }
    if (sameExecutionBatch(state.enterLane.mountedHidden, executionBatch)) {
      return;
    }
    state.enterLane.mountedHidden = executionBatch;
    instances.put(instanceId, state);
    emitVisualDiag(
      instanceId,
      "execution_batch_mounted_hidden phase=" +
      state.lastPresentationBatchPhase +
      " frame=" +
      (state.activeFrameGenerationId != null ? state.activeFrameGenerationId : "nil") +
      " " +
      phaseSummary(state)
    );
    startAwaitingLivePinTransitions(instanceId, null, null, state);
    startAwaitingLiveDotTransitions(instanceId, null, state);
    state = instances.get(instanceId);
    if (state == null) {
      return;
    }
    maybeEmitExecutionBatchArmed(instanceId, state);
  }

  private void maybeEmitExecutionBatchArmed(String instanceId, InstanceState state) {
    ExecutionBatchRef executionBatch = state.enterLane.mountedHidden;
    if (executionBatch == null) {
      return;
    }
    if (!isEnterStatusArmable(readEnterStatus(state.lastPresentationStateJson))) {
      return;
    }
    if (!stringEquals(state.lastEnterRequestKey, executionBatch.requestKey)) {
      return;
    }
    if (!stringEquals(state.enterLane.requestedRequestKey, executionBatch.requestKey)) {
      return;
    }
    if (sameExecutionBatch(state.enterLane.armed, executionBatch)) {
      return;
    }
    if (state.lastDismissRequestKey != null) {
      return;
    }
    if (stringEquals(state.lastEnterStartedRequestKey, executionBatch.requestKey)) {
      return;
    }
    if (state.blockedEnterStartRequestKey != null) {
      return;
    }
    if (hasPendingCommitFence(capturePendingVisualSourceCommitFence(state))) {
      return;
    }
    if (!stringEquals(state.activeFrameGenerationId, executionBatch.generationId)) {
      return;
    }
    if (!isActiveFrameSourceReady(state)) {
      emitVisualDiag(
        instanceId,
        "enter_armed_blocked_source_not_ready phase=" +
        state.lastPresentationBatchPhase +
        " frame=" +
        (state.activeFrameGenerationId != null ? state.activeFrameGenerationId : "nil") +
        " sourceReadyFrame=" +
        (state.sourceReadyFrameGenerationId != null ? state.sourceReadyFrameGenerationId : "nil") +
        " " +
        phaseSummary(state)
      );
      return;
    }
    if (!isActiveFrameLabelPlacementReady(state)) {
      emitVisualDiag(
        instanceId,
        "enter_armed_blocked_label_placement phase=" +
        state.lastPresentationBatchPhase +
        " frame=" +
        (state.activeFrameGenerationId != null ? state.activeFrameGenerationId : "nil") +
        " " +
        labelPlacementReadinessSummary(state)
      );
      return;
    }
    state.enterLane.armed = executionBatch;
    instances.put(instanceId, state);
    emitVisualDiag(
      instanceId,
      "enter_armed phase=" +
      state.lastPresentationBatchPhase +
      " frame=" +
      (state.activeFrameGenerationId != null ? state.activeFrameGenerationId : "nil") +
      " " +
      phaseSummary(state)
    );
    WritableMap readyEvent = Arguments.createMap();
    readyEvent.putString("type", "presentation_execution_batch_mounted_hidden");
    readyEvent.putString("instanceId", instanceId);
    readyEvent.putString("requestKey", executionBatch.requestKey);
    readyEvent.putString("frameGenerationId", executionBatch.generationId);
    readyEvent.putString("executionBatchId", executionBatch.batchId);
    readyEvent.putDouble("readyAtMs", nowMs());
    emit(readyEvent);
    WritableMap armedEvent = Arguments.createMap();
    armedEvent.putString("type", "presentation_enter_armed");
    armedEvent.putString("instanceId", instanceId);
    armedEvent.putString("requestKey", executionBatch.requestKey);
    armedEvent.putString("frameGenerationId", executionBatch.generationId);
    armedEvent.putString("executionBatchId", executionBatch.batchId);
    armedEvent.putDouble("armedAtMs", nowMs());
    emit(armedEvent);
  }

  private void maybeElectMountedHiddenExecutionBatch(String instanceId, InstanceState state) {
    String requestKey = state.enterLane.requestedRequestKey;
    if (requestKey == null) {
      return;
    }
    if (!isEnterStatusArmable(readEnterStatus(state.lastPresentationStateJson))) {
      return;
    }
    if (!stringEquals(state.lastEnterRequestKey, requestKey)) {
      return;
    }
    if (state.lastDismissRequestKey != null) {
      return;
    }
    if (stringEquals(state.lastEnterStartedRequestKey, requestKey)) {
      return;
    }
    if (state.activeExecutionBatchId == null || state.activeFrameGenerationId == null) {
      return;
    }
    if (!isActiveFrameSourceReady(state)) {
      emitVisualDiag(
        instanceId,
        "enter_mount_blocked_source_not_ready phase=" +
        state.lastPresentationBatchPhase +
        " frame=" +
        (state.activeFrameGenerationId != null ? state.activeFrameGenerationId : "nil") +
        " sourceReadyFrame=" +
        (state.sourceReadyFrameGenerationId != null ? state.sourceReadyFrameGenerationId : "nil") +
        " " +
        phaseSummary(state)
      );
      return;
    }
    if (!isActiveFrameLabelPlacementReady(state)) {
      emitVisualDiag(
        instanceId,
        "enter_mount_blocked_label_placement phase=" +
        state.lastPresentationBatchPhase +
        " frame=" +
        (state.activeFrameGenerationId != null ? state.activeFrameGenerationId : "nil") +
        " " +
        labelPlacementReadinessSummary(state)
      );
      retryLabelObservationRefreshIfPlacementPending(instanceId, 0d);
      return;
    }
    if (!state.allowEmptyEnter && state.lastPinCount + state.lastDotCount + state.lastLabelCount == 0) {
      return;
    }
    emitExecutionBatchMountedHidden(
      instanceId,
      new ExecutionBatchRef(requestKey, state.activeExecutionBatchId, state.activeFrameGenerationId),
      state
    );
  }


  private void applyDesiredFrameSnapshots(String instanceId) throws Exception {
    applyDesiredFrameSnapshots(instanceId, true);
  }

  private void applyDesiredFrameSnapshots(String instanceId, boolean allowNewTransitions) throws Exception {
    InstanceState state = instances.get(instanceId);
    if (state == null) {
      return;
    }
    ParsedFeatureCollection desiredPins = derivedFamilyState(state, state.pinSourceId).desiredCollection;
    ParsedFeatureCollection desiredPinInteractions =
      derivedFamilyState(state, state.pinInteractionSourceId).desiredCollection;
    ParsedFeatureCollection desiredDots = derivedFamilyState(state, state.dotSourceId).desiredCollection;
    ParsedFeatureCollection desiredLabels =
      derivedFamilyState(state, state.labelSourceId).desiredCollection;
    ParsedFeatureCollection desiredLabelCollisions =
      derivedFamilyState(state, state.labelCollisionSourceId).desiredCollection;
    String desiredPinSnapshotInputRevision =
      desiredPinSnapshotInputRevision(
        desiredPins,
        desiredPinInteractions,
        desiredLabels,
        desiredLabelCollisions
      );
    DerivedFamilyState pinFamilyState = derivedFamilyState(state, state.pinSourceId);
    DerivedFamilyState dotFamilyState = derivedFamilyState(state, state.dotSourceId);
    DesiredPinSnapshotState previousDesiredPinSnapshot = new DesiredPinSnapshotState();
    copyDesiredPinSnapshot(pinFamilyState.lastDesiredPinSnapshot, previousDesiredPinSnapshot);
    boolean reusedDesiredPinSnapshot =
      stringEquals(previousDesiredPinSnapshot.inputRevision, desiredPinSnapshotInputRevision);
    DesiredPinSnapshotState desiredPinSnapshot = previousDesiredPinSnapshot;
    if (!reusedDesiredPinSnapshot) {
      desiredPinSnapshot = new DesiredPinSnapshotState();
      copyDesiredPinSnapshot(previousDesiredPinSnapshot, desiredPinSnapshot);
      updateDesiredPinSnapshotState(
        desiredPinSnapshot,
        desiredPins,
        desiredPinInteractions,
        desiredLabels,
        desiredLabelCollisions
      );
    }
    double nowMs = nowMs();
    boolean shouldAnimateIncrementalTransitions =
      allowsIncrementalMarkerTransitions(state, allowNewTransitions);
    updateLivePinTransitions(
      state,
      previousDesiredPinSnapshot,
      desiredPinSnapshot,
      nowMs,
      shouldAnimateIncrementalTransitions
    );
    updateLiveDotTransitions(state, desiredDots, nowMs, shouldAnimateIncrementalTransitions);
    if (
      !ensureSourcesReady(
        state,
        instanceId,
        visualAndInteractionSourceIds(state),
        "reconcile_outputs",
        true
      )
    ) {
      instances.put(instanceId, state);
      return;
    }
    final DesiredPinSnapshotState finalDesiredPinSnapshot = desiredPinSnapshot;
    withStyle(state.mapTag, style -> {
      PreparedDerivedPinAndLabelOutput preparedPinAndLabelOutput =
        prepareDerivedPinAndLabelOutput(state, finalDesiredPinSnapshot, nowMs);
      PreparedDerivedDotOutput preparedDotOutput =
        prepareDerivedDotOutput(state, desiredDots, nowMs);
      ArrayList<ParsedCollectionApplyPlan> plans = new ArrayList<>();
      plans.addAll(preparedPinAndLabelOutput.plans);
      plans.addAll(preparedDotOutput.plans);
      Map<String, MutationSummary> mutationSummaryBySourceId =
        applyParsedCollectionBatch(style, state, instanceId, plans);
      finalizePreparedPinAndLabelOutput(
        instanceId,
        state,
        preparedPinAndLabelOutput,
        mutationSummaryBySourceId
      );
      finalizePreparedDotOutput(
        state,
        preparedDotOutput,
        mutationSummaryBySourceId
      );
    });
    if (state.isAwaitingSourceRecovery) {
      instances.put(instanceId, state);
      return;
    }
    DerivedFamilyState latestPinFamilyState = derivedFamilyState(state, state.pinSourceId);
    DerivedFamilyState latestDotFamilyState = derivedFamilyState(state, state.dotSourceId);
    copyDesiredPinSnapshot(desiredPinSnapshot, latestPinFamilyState.lastDesiredPinSnapshot);
    copyParsedFeatureCollection(desiredDots, latestDotFamilyState.lastDesiredCollection);
    maybeElectMountedHiddenExecutionBatch(instanceId, state);
    instances.put(instanceId, state);
    updateLivePinTransitionAnimation(instanceId, state);
  }

  private PreparedDerivedDotOutput prepareDerivedDotOutput(
    InstanceState state,
    ParsedFeatureCollection desiredDots,
    double nowMs
  ) {
      DerivedFamilyState dotFamilyState = derivedFamilyState(state, state.dotSourceId);
      Map<String, Feature> desiredDotFeatureByMarkerKey = desiredDots.featureById;
      Set<String> dotMarkerKeys = new TreeSet<>(desiredDotFeatureByMarkerKey.keySet());
      dotMarkerKeys.addAll(dotFamilyState.liveDotTransitionsByMarkerKey.keySet());
      ArrayList<String> orderedDotMarkerKeys = new ArrayList<>(dotMarkerKeys);
      Set<String> dirtyDotMarkerKeys = new LinkedHashSet<>(desiredDots.dirtyGroupIds);
      dirtyDotMarkerKeys.addAll(desiredDots.orderChangedGroupIds);
      dirtyDotMarkerKeys.addAll(desiredDots.removedGroupIds);
      dirtyDotMarkerKeys.addAll(dotFamilyState.liveDotTransitionsByMarkerKey.keySet());

      SourceState previousDotSourceState = dotFamilyState.sourceState;
      ParsedFeatureCollection nextDots;
      if (dirtyDotMarkerKeys.isEmpty()) {
        nextDots = dotFamilyState.collection;
      } else {
        ArrayList<String> nextDotIdsInOrder = new ArrayList<>();
        Map<String, Feature> nextDotFeatureById = new HashMap<>(dotFamilyState.collection.featureById);
        Map<String, HashMap<String, Value>> nextDotFeatureStateById = new HashMap<>(dotFamilyState.collection.featureStateById);
        Map<String, String> nextDotMarkerKeyByFeatureId = new HashMap<>(dotFamilyState.collection.markerKeyByFeatureId);
        Set<String> nextDotIdSet = new LinkedHashSet<>();
        for (String markerKey : orderedDotMarkerKeys) {
          LiveDotTransition transition = dotFamilyState.liveDotTransitionsByMarkerKey.get(markerKey);
          Feature desiredDotFeature = desiredDotFeatureByMarkerKey.get(markerKey);
          Feature transitionDotFeature = transition != null ? transition.dotFeature : null;
          double dotOpacity = transition != null ? liveDotTransitionOpacity(transition, nowMs) : 1d;
          boolean shouldRenderDot =
            desiredDotFeature != null ||
            (transitionDotFeature != null && dotOpacity > 0.001d);
          if (!shouldRenderDot) {
            continue;
          }
          Feature sourceFeature = desiredDotFeature != null ? desiredDotFeature : transitionDotFeature;
          if (sourceFeature == null) {
            continue;
          }
          nextDotIdsInOrder.add(markerKey);
          nextDotIdSet.add(markerKey);
          if (dirtyDotMarkerKeys.contains(markerKey)) {
            boolean shouldSeedHidden = desiredDotFeature != null && transition != null && transition.targetOpacity == 1d;
            Feature renderFeature =
              featureWithNumericProperties(
                sourceFeature,
                Collections.singletonMap("nativeDotOpacity", shouldSeedHidden ? 0d : 1d)
              );
            nextDotFeatureById.put(markerKey, renderFeature);
            nextDotFeatureStateById.put(
              markerKey,
              dotFamilyState.transientFeatureStateById.containsKey(markerKey)
                ? new HashMap<>(dotFamilyState.transientFeatureStateById.get(markerKey))
                : desiredDots.featureStateById.getOrDefault(markerKey, new HashMap<>())
            );
            nextDotMarkerKeyByFeatureId.put(
              markerKey,
              desiredDots.markerKeyByFeatureId.getOrDefault(markerKey, markerKey)
            );
          }
        }
        for (String retainedDotId : dirtyDotMarkerKeys) {
          if (nextDotIdSet.contains(retainedDotId)) {
            continue;
          }
          nextDotFeatureById.remove(retainedDotId);
          nextDotFeatureStateById.remove(retainedDotId);
          nextDotMarkerKeyByFeatureId.remove(retainedDotId);
        }
        Set<String> removedDotGroupIds = new LinkedHashSet<>();
        for (String markerKey : dirtyDotMarkerKeys) {
          if (!nextDotIdSet.contains(markerKey)) {
            removedDotGroupIds.add(markerKey);
          }
        }
        replaceParsedFeatureCollection(
          dotFamilyState.collection,
          previousDotSourceState,
          nextDotIdsInOrder,
          nextDotFeatureById,
          nextDotFeatureStateById,
          nextDotMarkerKeyByFeatureId,
          dirtyDotMarkerKeys,
          dirtyDotMarkerKeys,
          removedDotGroupIds
        );
        nextDots = dotFamilyState.collection;
      }
      return new PreparedDerivedDotOutput(
        Arrays.asList(
          new ParsedCollectionApplyPlan(
            state.dotSourceId,
            nextDots,
            previousDotSourceState,
            previousDotSourceState != null
              ? previousDotSourceState.featureStateById
              : Collections.emptyMap(),
            previousDotSourceState != null
              ? previousDotSourceState.featureStateRevision
              : ""
          )
        ),
        state.dotSourceId
      );
  }

  private void finalizePreparedDotOutput(
    InstanceState state,
    PreparedDerivedDotOutput prepared,
    Map<String, MutationSummary> mutationSummaryBySourceId
  ) {
    MutationSummary dotMutationSummary =
      mutationSummaryBySourceId.getOrDefault(
        prepared.dotSourceId,
        new MutationSummary(0, 0, 0, null, Collections.emptyList())
      );
    if (dotMutationSummary.dataId != null && !dotMutationSummary.addedFeatureIds.isEmpty()) {
      DerivedFamilyState dotFamilyState = derivedFamilyState(state, state.dotSourceId);
      for (String featureId : dotMutationSummary.addedFeatureIds) {
        LiveDotTransition transition = dotFamilyState.liveDotTransitionsByMarkerKey.get(featureId);
        if (transition == null || !transition.isAwaitingSourceCommit) {
          continue;
        }
        transition.awaitingSourceDataId = dotMutationSummary.dataId;
      }
    }
  }

  private void applyLivePinTransitionFeatureStatesTick(String instanceId) throws Exception {
    applyLivePinTransitionFeatureStates(instanceId);
  }

  private void updateDesiredPinSnapshotState(
    DesiredPinSnapshotState snapshot,
    ParsedFeatureCollection desiredPins,
    ParsedFeatureCollection desiredPinInteractions,
    ParsedFeatureCollection desiredLabels,
    ParsedFeatureCollection desiredLabelCollisions
  ) {
    Map<String, String> previousPinFeatureRevisionByMarkerKey = new HashMap<>(snapshot.pinFeatureRevisionByMarkerKey);
    Map<String, String> previousPinInteractionFeatureRevisionByMarkerKey = new HashMap<>(snapshot.pinInteractionFeatureRevisionByMarkerKey);
    Map<String, Integer> previousPinLodZByMarkerKey = new HashMap<>(snapshot.pinLodZByMarkerKey);
    Map<String, String> previousLabelFeatureRevisionByMarkerKey = new HashMap<>(snapshot.labelFeatureRevisionByMarkerKey);
    Map<String, String> previousLabelCollisionFeatureRevisionByMarkerKey =
      new HashMap<>(snapshot.labelCollisionFeatureRevisionByMarkerKey);
    snapshot.inputRevision =
      desiredPinSnapshotInputRevision(
        desiredPins,
        desiredPinInteractions,
        desiredLabels,
        desiredLabelCollisions
      );
    snapshot.dirtyPinMarkerKeys.clear();
    snapshot.dirtyPinInteractionMarkerKeys.clear();
    snapshot.dirtyLabelMarkerKeys.clear();
    snapshot.dirtyLabelCollisionMarkerKeys.clear();
    snapshot.pinIdsInOrder.clear();
    snapshot.pinIdsInOrder.addAll(desiredPins.idsInOrder);
    Set<String> nextPinMarkerKeys = new LinkedHashSet<>(desiredPins.idsInOrder);
    for (int index = 0; index < desiredPins.idsInOrder.size(); index += 1) {
      String markerKey = desiredPins.idsInOrder.get(index);
      Feature feature = desiredPins.featureById.get(markerKey);
      if (feature == null) {
        continue;
      }
      snapshot.pinFeatureByMarkerKey.put(markerKey, feature);
      String pinRevision =
        desiredPins.diffKeyById.containsKey(markerKey) ? desiredPins.diffKeyById.get(markerKey) : "";
      snapshot.pinFeatureRevisionByMarkerKey.put(markerKey, pinRevision);
      if (!Objects.equals(previousPinFeatureRevisionByMarkerKey.get(markerKey), pinRevision)) {
        snapshot.dirtyPinMarkerKeys.add(markerKey);
      }
      Number nativeLodZ = null;
      try {
        nativeLodZ = feature.getNumberProperty("nativeLodZ");
      } catch (Exception ignored) {
        nativeLodZ = null;
      }
      snapshot.pinLodZByMarkerKey.put(
        markerKey,
        nativeLodZ != null ? nativeLodZ.intValue() : Math.max(0, desiredPins.idsInOrder.size() - 1 - index)
      );
      if (!Objects.equals(previousPinLodZByMarkerKey.get(markerKey), snapshot.pinLodZByMarkerKey.get(markerKey))) {
        snapshot.dirtyPinMarkerKeys.add(markerKey);
        snapshot.dirtyPinInteractionMarkerKeys.add(markerKey);
      }
    }
    snapshot.pinFeatureByMarkerKey.keySet().removeIf(markerKey -> !nextPinMarkerKeys.contains(markerKey));
    snapshot.pinFeatureRevisionByMarkerKey.keySet().removeIf(markerKey -> !nextPinMarkerKeys.contains(markerKey));
    snapshot.pinLodZByMarkerKey.keySet().removeIf(markerKey -> !nextPinMarkerKeys.contains(markerKey));
    for (String markerKey : previousPinFeatureRevisionByMarkerKey.keySet()) {
      if (!nextPinMarkerKeys.contains(markerKey)) {
        snapshot.dirtyPinMarkerKeys.add(markerKey);
      }
    }

    Set<String> nextPinInteractionMarkerKeys = new LinkedHashSet<>(desiredPinInteractions.idsInOrder);
    for (String markerKey : desiredPinInteractions.idsInOrder) {
      Feature feature = desiredPinInteractions.featureById.get(markerKey);
      if (feature != null) {
        snapshot.pinInteractionFeatureByMarkerKey.put(markerKey, feature);
        String revision =
          desiredPinInteractions.diffKeyById.containsKey(markerKey)
            ? desiredPinInteractions.diffKeyById.get(markerKey)
            : "";
        snapshot.pinInteractionFeatureRevisionByMarkerKey.put(markerKey, revision);
        if (!Objects.equals(previousPinInteractionFeatureRevisionByMarkerKey.get(markerKey), revision)) {
          snapshot.dirtyPinInteractionMarkerKeys.add(markerKey);
        }
      }
    }
    snapshot.pinInteractionFeatureByMarkerKey
      .keySet()
      .removeIf(markerKey -> !nextPinInteractionMarkerKeys.contains(markerKey));
    snapshot.pinInteractionFeatureRevisionByMarkerKey
      .keySet()
      .removeIf(markerKey -> !nextPinInteractionMarkerKeys.contains(markerKey));
    for (String markerKey : previousPinInteractionFeatureRevisionByMarkerKey.keySet()) {
      if (!nextPinInteractionMarkerKeys.contains(markerKey)) {
        snapshot.dirtyPinInteractionMarkerKeys.add(markerKey);
      }
    }

    Set<String> nextLabelMarkerKeys = new LinkedHashSet<>();
    snapshot.labelMarkerKeyByFeatureId.clear();
    for (String featureId : desiredLabels.idsInOrder) {
      String markerKey =
        desiredLabels.markerKeyByFeatureId.containsKey(featureId)
          ? desiredLabels.markerKeyByFeatureId.get(featureId)
          : featureId;
      nextLabelMarkerKeys.add(markerKey);
      snapshot.labelFeaturesByMarkerKey.put(markerKey, new ArrayList<>());
    }
    for (String featureId : desiredLabels.idsInOrder) {
      Feature feature = desiredLabels.featureById.get(featureId);
      if (feature == null) {
        continue;
      }
      String markerKey =
        desiredLabels.markerKeyByFeatureId.containsKey(featureId)
          ? desiredLabels.markerKeyByFeatureId.get(featureId)
          : featureId;
      snapshot.labelMarkerKeyByFeatureId.put(featureId, markerKey);
      snapshot.labelFeaturesByMarkerKey
        .computeIfAbsent(markerKey, ignored -> new ArrayList<>())
        .add(new FeatureRecord(featureId, feature));
    }
    snapshot.labelFeaturesByMarkerKey
      .keySet()
      .removeIf(markerKey -> !nextLabelMarkerKeys.contains(markerKey));
    for (String markerKey : nextLabelMarkerKeys) {
      ArrayList<FeatureRecord> labelFeatures = snapshot.labelFeaturesByMarkerKey.get(markerKey);
      long hash = FNV1A64_OFFSET_BASIS;
      hash = fnv1a64Append(hash, markerKey);
      hash = fnv1a64Append(hash, Integer.toString(labelFeatures != null ? labelFeatures.size() : 0));
      if (labelFeatures != null) {
        for (FeatureRecord record : labelFeatures) {
          hash = fnv1a64Append(hash, record.id);
          hash =
            fnv1a64Append(
              hash,
              desiredLabels.diffKeyById.containsKey(record.id) ? desiredLabels.diffKeyById.get(record.id) : ""
            );
        }
      }
      String revision = finishHashedRevision(hash, labelFeatures != null ? labelFeatures.size() : 0);
      snapshot.labelFeatureRevisionByMarkerKey.put(markerKey, revision);
      if (!Objects.equals(previousLabelFeatureRevisionByMarkerKey.get(markerKey), revision)) {
        snapshot.dirtyLabelMarkerKeys.add(markerKey);
      }
    }
    snapshot.labelFeatureRevisionByMarkerKey
      .keySet()
      .removeIf(markerKey -> !nextLabelMarkerKeys.contains(markerKey));
    for (String markerKey : previousLabelFeatureRevisionByMarkerKey.keySet()) {
      if (!nextLabelMarkerKeys.contains(markerKey)) {
        snapshot.dirtyLabelMarkerKeys.add(markerKey);
      }
    }

    Set<String> nextLabelCollisionMarkerKeys = new LinkedHashSet<>();
    for (String featureId : desiredLabelCollisions.idsInOrder) {
      Feature feature = desiredLabelCollisions.featureById.get(featureId);
      if (feature == null) {
        continue;
      }
      String markerKey =
        desiredLabelCollisions.markerKeyByFeatureId.containsKey(featureId)
          ? desiredLabelCollisions.markerKeyByFeatureId.get(featureId)
          : featureId;
      nextLabelCollisionMarkerKeys.add(markerKey);
      snapshot.labelCollisionFeatureByMarkerKey.put(markerKey, feature);
      String revision =
        desiredLabelCollisions.diffKeyById.containsKey(featureId)
          ? desiredLabelCollisions.diffKeyById.get(featureId)
          : "";
      snapshot.labelCollisionFeatureRevisionByMarkerKey.put(markerKey, revision);
      if (!Objects.equals(previousLabelCollisionFeatureRevisionByMarkerKey.get(markerKey), revision)) {
        snapshot.dirtyLabelCollisionMarkerKeys.add(markerKey);
      }
    }
    snapshot.labelCollisionFeatureByMarkerKey
      .keySet()
      .removeIf(markerKey -> !nextLabelCollisionMarkerKeys.contains(markerKey));
    snapshot.labelCollisionFeatureRevisionByMarkerKey
      .keySet()
      .removeIf(markerKey -> !nextLabelCollisionMarkerKeys.contains(markerKey));
    for (String markerKey : previousLabelCollisionFeatureRevisionByMarkerKey.keySet()) {
      if (!nextLabelCollisionMarkerKeys.contains(markerKey)) {
        snapshot.dirtyLabelCollisionMarkerKeys.add(markerKey);
      }
    }
  }

  private static String desiredPinSnapshotInputRevision(
    ParsedFeatureCollection desiredPins,
    ParsedFeatureCollection desiredPinInteractions,
    ParsedFeatureCollection desiredLabels,
    ParsedFeatureCollection desiredLabelCollisions
  ) {
    long hash = FNV1A64_OFFSET_BASIS;
    hash = fnv1a64Append(hash, "pins");
    hash = fnv1a64Append(hash, desiredPins.sourceRevision);
    hash = fnv1a64Append(hash, "pinInteractions");
    hash = fnv1a64Append(hash, desiredPinInteractions.sourceRevision);
    hash = fnv1a64Append(hash, "labels");
    hash = fnv1a64Append(hash, desiredLabels.sourceRevision);
    hash = fnv1a64Append(hash, "labelCollisions");
    hash = fnv1a64Append(hash, desiredLabelCollisions.sourceRevision);
    return finishHashedRevision(hash, 4);
  }

  private static double valueToDouble(Value value, double fallback) {
    if (value == null) {
      return fallback;
    }
    try {
      return Double.parseDouble(value.toString());
    } catch (Exception ignored) {
      return fallback;
    }
  }

  private void updateLivePinTransitions(
    InstanceState state,
    DesiredPinSnapshotState previousSnapshot,
    DesiredPinSnapshotState desiredPinSnapshot,
    double nowMs,
    boolean allowNewTransitions
  ) {
    DerivedFamilyState pinFamilyState = derivedFamilyState(state, state.pinSourceId);
    Set<String> previousPinIds = new HashSet<>(previousSnapshot.pinIdsInOrder);
    Set<String> nextPinIds = new HashSet<>(desiredPinSnapshot.pinIdsInOrder);
    Map<String, Integer> previousOrderByMarkerKey = new HashMap<>();
    for (int index = 0; index < previousSnapshot.pinIdsInOrder.size(); index += 1) {
      previousOrderByMarkerKey.put(previousSnapshot.pinIdsInOrder.get(index), index);
    }
    Set<String> markerKeys = new HashSet<>(previousPinIds);
    markerKeys.addAll(nextPinIds);
    markerKeys.addAll(pinFamilyState.livePinTransitionsByMarkerKey.keySet());

    Map<String, LivePinTransition> nextTransitions = new HashMap<>(pinFamilyState.livePinTransitionsByMarkerKey);
    for (String markerKey : markerKeys) {
      LivePinTransition existing = nextTransitions.get(markerKey);
      boolean previousPresent = previousPinIds.contains(markerKey);
      boolean nextPresent = nextPinIds.contains(markerKey);
      double currentOpacity =
        existing != null ? livePinTransitionOpacity(existing, nowMs) : previousPresent ? 1d : 0d;
      double targetOpacity = nextPresent ? 1d : 0d;

      Feature pinFeature =
        desiredPinSnapshot.pinFeatureByMarkerKey.containsKey(markerKey)
          ? desiredPinSnapshot.pinFeatureByMarkerKey.get(markerKey)
          : previousSnapshot.pinFeatureByMarkerKey.containsKey(markerKey)
            ? previousSnapshot.pinFeatureByMarkerKey.get(markerKey)
            : existing != null ? existing.pinFeature : null;
      if (pinFeature == null) {
        nextTransitions.remove(markerKey);
        continue;
      }

      Feature pinInteractionFeature =
        desiredPinSnapshot.pinInteractionFeatureByMarkerKey.containsKey(markerKey)
          ? desiredPinSnapshot.pinInteractionFeatureByMarkerKey.get(markerKey)
          : previousSnapshot.pinInteractionFeatureByMarkerKey.containsKey(markerKey)
            ? previousSnapshot.pinInteractionFeatureByMarkerKey.get(markerKey)
            : existing != null ? existing.pinInteractionFeature : null;
      ArrayList<FeatureRecord> labelFeatures =
        desiredPinSnapshot.labelFeaturesByMarkerKey.containsKey(markerKey)
          ? desiredPinSnapshot.labelFeaturesByMarkerKey.get(markerKey)
          : previousSnapshot.labelFeaturesByMarkerKey.containsKey(markerKey)
            ? previousSnapshot.labelFeaturesByMarkerKey.get(markerKey)
            : existing != null
              ? existing.labelFeatures
              : new ArrayList<>();
      int lodZ =
        desiredPinSnapshot.pinLodZByMarkerKey.containsKey(markerKey)
          ? desiredPinSnapshot.pinLodZByMarkerKey.get(markerKey)
          : previousSnapshot.pinLodZByMarkerKey.containsKey(markerKey)
            ? previousSnapshot.pinLodZByMarkerKey.get(markerKey)
            : existing != null ? existing.lodZ : 0;
      int orderHint =
        previousOrderByMarkerKey.containsKey(markerKey)
          ? previousOrderByMarkerKey.get(markerKey)
          : desiredPinSnapshot.pinIdsInOrder.indexOf(markerKey) >= 0
            ? desiredPinSnapshot.pinIdsInOrder.indexOf(markerKey)
            : existing != null ? existing.orderHint : Integer.MAX_VALUE;

      if (!allowNewTransitions && existing == null) {
        continue;
      }

      if (existing != null) {
        if (Math.abs(currentOpacity - targetOpacity) < 0.001d) {
          if ((targetOpacity == 1d && nextPresent) || (targetOpacity == 0d && !nextPresent)) {
            nextTransitions.remove(markerKey);
          }
          continue;
        }
        if (existing.targetOpacity != targetOpacity) {
          boolean shouldAwaitSourceCommit =
            targetOpacity == 1d && !previousPresent && currentOpacity <= 0.001d;
          LivePinTransition transition = new LivePinTransition();
          transition.startOpacity = currentOpacity;
          transition.targetOpacity = targetOpacity;
          transition.startedAtMs = nowMs;
          transition.durationMs = LIVE_PIN_TRANSITION_DURATION_MS;
          transition.isAwaitingSourceCommit = shouldAwaitSourceCommit;
          transition.awaitingSourceDataId = shouldAwaitSourceCommit ? existing.awaitingSourceDataId : null;
          transition.pinFeature = pinFeature;
          transition.labelFeatures = labelFeatures;
          transition.pinInteractionFeature = pinInteractionFeature;
          transition.lodZ = lodZ;
          transition.orderHint = orderHint;
          nextTransitions.put(markerKey, transition);
          continue;
        }
        existing.pinFeature = pinFeature;
        existing.labelFeatures = labelFeatures;
        existing.pinInteractionFeature = pinInteractionFeature;
        existing.lodZ = lodZ;
        existing.orderHint = orderHint;
        nextTransitions.put(markerKey, existing);
        continue;
      }

      if (previousPresent == nextPresent || Math.abs(currentOpacity - targetOpacity) < 0.001d) {
        continue;
      }
      LivePinTransition transition = new LivePinTransition();
      transition.startOpacity = currentOpacity;
      transition.targetOpacity = targetOpacity;
      transition.startedAtMs = nowMs;
      transition.durationMs = LIVE_PIN_TRANSITION_DURATION_MS;
      transition.isAwaitingSourceCommit = targetOpacity == 1d;
      transition.awaitingSourceDataId = null;
      transition.pinFeature = pinFeature;
      transition.labelFeatures = labelFeatures;
      transition.pinInteractionFeature = pinInteractionFeature;
      transition.lodZ = lodZ;
      transition.orderHint = orderHint;
      nextTransitions.put(markerKey, transition);
    }
    pinFamilyState.livePinTransitionsByMarkerKey.clear();
    pinFamilyState.livePinTransitionsByMarkerKey.putAll(nextTransitions);
  }

  private void updateLiveDotTransitions(
    InstanceState state,
    ParsedFeatureCollection desiredDots,
    double nowMs,
    boolean allowNewTransitions
  ) {
    DerivedFamilyState dotFamilyState = derivedFamilyState(state, state.dotSourceId);
    Map<String, Feature> previousDotsByMarkerKey = dotFamilyState.lastDesiredCollection.featureById;
    Map<String, Feature> nextDotsByMarkerKey = desiredDots.featureById;
    Set<String> previousDotIds = new HashSet<>(previousDotsByMarkerKey.keySet());
    Set<String> nextDotIds = new HashSet<>(nextDotsByMarkerKey.keySet());
    Map<String, Integer> previousOrderByMarkerKey = new HashMap<>();
    for (int index = 0; index < dotFamilyState.lastDesiredCollection.idsInOrder.size(); index += 1) {
      previousOrderByMarkerKey.put(dotFamilyState.lastDesiredCollection.idsInOrder.get(index), index);
    }
    Map<String, Integer> nextOrderByMarkerKey = new HashMap<>();
    for (int index = 0; index < desiredDots.idsInOrder.size(); index += 1) {
      nextOrderByMarkerKey.put(desiredDots.idsInOrder.get(index), index);
    }
    Set<String> markerKeys = new HashSet<>(previousDotIds);
    markerKeys.addAll(nextDotIds);
    markerKeys.addAll(dotFamilyState.liveDotTransitionsByMarkerKey.keySet());

    Map<String, LiveDotTransition> nextTransitions = new HashMap<>(dotFamilyState.liveDotTransitionsByMarkerKey);
    for (String markerKey : markerKeys) {
      LiveDotTransition existing = nextTransitions.get(markerKey);
      boolean previousPresent = previousDotIds.contains(markerKey);
      boolean nextPresent = nextDotIds.contains(markerKey);
      double currentOpacity =
        existing != null ? liveDotTransitionOpacity(existing, nowMs) : previousPresent ? 1d : 0d;
      double targetOpacity = nextPresent ? 1d : 0d;

      Feature dotFeature =
        nextDotsByMarkerKey.containsKey(markerKey)
          ? nextDotsByMarkerKey.get(markerKey)
          : previousDotsByMarkerKey.containsKey(markerKey)
            ? previousDotsByMarkerKey.get(markerKey)
            : existing != null ? existing.dotFeature : null;
      if (dotFeature == null) {
        nextTransitions.remove(markerKey);
        continue;
      }

      int orderHint =
        previousOrderByMarkerKey.containsKey(markerKey)
          ? previousOrderByMarkerKey.get(markerKey)
          : nextOrderByMarkerKey.containsKey(markerKey)
            ? nextOrderByMarkerKey.get(markerKey)
            : existing != null ? existing.orderHint : Integer.MAX_VALUE;

      if (!allowNewTransitions && existing == null) {
        continue;
      }

      if (existing != null) {
        if (Math.abs(currentOpacity - targetOpacity) < 0.001d) {
          if ((targetOpacity == 1d && nextPresent) || (targetOpacity == 0d && !nextPresent)) {
            nextTransitions.remove(markerKey);
          }
          continue;
        }
        if (existing.targetOpacity != targetOpacity) {
          boolean shouldAwaitSourceCommit =
            targetOpacity == 1d && !previousPresent && currentOpacity <= 0.001d;
          LiveDotTransition transition = new LiveDotTransition();
          transition.startOpacity = currentOpacity;
          transition.targetOpacity = targetOpacity;
          transition.startedAtMs = nowMs;
          transition.durationMs = LIVE_PIN_TRANSITION_DURATION_MS;
          transition.isAwaitingSourceCommit = shouldAwaitSourceCommit;
          transition.awaitingSourceDataId = shouldAwaitSourceCommit ? existing.awaitingSourceDataId : null;
          transition.dotFeature = dotFeature;
          transition.orderHint = orderHint;
          nextTransitions.put(markerKey, transition);
          continue;
        }
        existing.dotFeature = dotFeature;
        existing.orderHint = orderHint;
        nextTransitions.put(markerKey, existing);
        continue;
      }

      if (previousPresent == nextPresent || Math.abs(currentOpacity - targetOpacity) < 0.001d) {
        continue;
      }
      LiveDotTransition transition = new LiveDotTransition();
      transition.startOpacity = currentOpacity;
      transition.targetOpacity = targetOpacity;
      transition.startedAtMs = nowMs;
      transition.durationMs = LIVE_PIN_TRANSITION_DURATION_MS;
      transition.isAwaitingSourceCommit = targetOpacity == 1d;
      transition.awaitingSourceDataId = null;
      transition.dotFeature = dotFeature;
      transition.orderHint = orderHint;
      nextTransitions.put(markerKey, transition);
    }
    dotFamilyState.liveDotTransitionsByMarkerKey.clear();
    dotFamilyState.liveDotTransitionsByMarkerKey.putAll(nextTransitions);
  }

  private static double livePinTransitionOpacity(LivePinTransition transition, double nowMs) {
    if (transition.isAwaitingSourceCommit) {
      return transition.startOpacity;
    }
    double elapsedMs = Math.max(0d, nowMs - transition.startedAtMs);
    double progress = transition.durationMs <= 0d ? 1d : Math.min(1d, elapsedMs / transition.durationMs);
    double easedProgress = progress * progress * (3d - 2d * progress);
    return transition.startOpacity + (transition.targetOpacity - transition.startOpacity) * easedProgress;
  }

  private static double liveDotTransitionOpacity(LiveDotTransition transition, double nowMs) {
    if (transition.isAwaitingSourceCommit) {
      return transition.startOpacity;
    }
    double elapsedMs = Math.max(0d, nowMs - transition.startedAtMs);
    double progress = transition.durationMs <= 0d ? 1d : Math.min(1d, elapsedMs / transition.durationMs);
    double easedProgress = progress * progress * (3d - 2d * progress);
    return transition.startOpacity + (transition.targetOpacity - transition.startOpacity) * easedProgress;
  }

  private void updateLivePinTransitionAnimation(String instanceId, InstanceState state) {
    if (
      isVisualSourceInactiveOrDismissing(state) ||
      isSourceRecoveryActive(state) ||
      (derivedFamilyState(state, state.pinSourceId).livePinTransitionsByMarkerKey.isEmpty() &&
        derivedFamilyState(state, state.dotSourceId).liveDotTransitionsByMarkerKey.isEmpty()) ||
      !isLivePinTransitionPhase(state)
    ) {
      cancelLivePinTransitionAnimation(instanceId);
      return;
    }
    if (livePinTransitionRunnables.containsKey(instanceId)) {
      return;
    }
    Runnable runnable = new Runnable() {
      @Override
      public void run() {
        try {
          applyLivePinTransitionFeatureStatesTick(instanceId);
          InstanceState latestState = instances.get(instanceId);
          if (
            latestState == null ||
            isVisualSourceInactiveOrDismissing(latestState) ||
            isSourceRecoveryActive(latestState) ||
            (derivedFamilyState(latestState, latestState.pinSourceId).livePinTransitionsByMarkerKey.isEmpty() &&
              derivedFamilyState(latestState, latestState.dotSourceId).liveDotTransitionsByMarkerKey.isEmpty()) ||
            !isLivePinTransitionPhase(latestState)
          ) {
            cancelLivePinTransitionAnimation(instanceId);
            return;
          }
          mainHandler.postDelayed(this, 16L);
        } catch (Exception error) {
          emitError(
            instanceId,
            error.getMessage() != null ? error.getMessage() : "live pin transition failed"
          );
          cancelLivePinTransitionAnimation(instanceId);
        }
      }
    };
    livePinTransitionRunnables.put(instanceId, runnable);
    mainHandler.post(runnable);
  }

  private void cancelLivePinTransitionAnimation(String instanceId) {
    Runnable runnable = livePinTransitionRunnables.remove(instanceId);
    if (runnable != null) {
      mainHandler.removeCallbacks(runnable);
    }
  }

  private void resetLiveMarkerEnterState(String instanceId, InstanceState state, String reason) {
    cancelLivePinTransitionAnimation(instanceId);

    DerivedFamilyState pinFamilyState = derivedFamilyState(state, state.pinSourceId);
    DerivedFamilyState dotFamilyState = derivedFamilyState(state, state.dotSourceId);
    DerivedFamilyState labelFamilyState = derivedFamilyState(state, state.labelSourceId);
    SourceState pinSourceState = pinFamilyState.sourceState;
    SourceState dotSourceState = dotFamilyState.sourceState;
    SourceState labelSourceState = labelFamilyState.sourceState;

    int pinTransitionCount = pinFamilyState.livePinTransitionsByMarkerKey.size();
    int dotTransitionCount = dotFamilyState.liveDotTransitionsByMarkerKey.size();
    ArrayList<String> pinTransientIds = new ArrayList<>(pinFamilyState.transientFeatureStateById.keySet());
    ArrayList<String> dotTransientIds = new ArrayList<>(dotFamilyState.transientFeatureStateById.keySet());
    ArrayList<String> labelTransientIds = new ArrayList<>(labelFamilyState.transientFeatureStateById.keySet());

    for (String featureId : pinTransientIds) {
      clearTransientFeatureState(pinSourceState, pinFamilyState, featureId);
    }
    for (String featureId : dotTransientIds) {
      clearTransientFeatureState(dotSourceState, dotFamilyState, featureId);
    }
    for (String featureId : labelTransientIds) {
      clearTransientFeatureState(labelSourceState, labelFamilyState, featureId);
    }

    pinFamilyState.livePinTransitionsByMarkerKey.clear();
    dotFamilyState.liveDotTransitionsByMarkerKey.clear();

    refreshFeatureStateRevision(pinSourceState);
    refreshFeatureStateRevision(dotSourceState);
    refreshFeatureStateRevision(labelSourceState);
    syncMountedSourceState(state, state.pinSourceId, pinSourceState, pinFamilyState);
    syncMountedSourceState(state, state.dotSourceId, dotSourceState, dotFamilyState);
    syncMountedSourceState(state, state.labelSourceId, labelSourceState, labelFamilyState);

    emitVisualDiag(
      instanceId,
      "live_reveal_state_reset reason=" +
      reason +
      " pinLodAnimations=" +
      pinTransitionCount +
      " dotLodAnimations=" +
      dotTransitionCount +
      " pinFeatureStateOverrides=" +
      pinTransientIds.size() +
      " dotFeatureStateOverrides=" +
      dotTransientIds.size() +
      " labelFeatureStateOverrides=" +
      labelTransientIds.size()
    );
  }

  private void restartLiveEnterTransitionsForRevealStart(String instanceId, InstanceState state) {
    double nowMs = nowMs();
    int restartedPinCount = 0;
    int restartedDotCount = 0;
    DerivedFamilyState pinFamilyState = derivedFamilyState(state, state.pinSourceId);
    DerivedFamilyState dotFamilyState = derivedFamilyState(state, state.dotSourceId);

    ArrayList<String> pinMarkerKeys = new ArrayList<>(pinFamilyState.livePinTransitionsByMarkerKey.keySet());
    Collections.sort(pinMarkerKeys);
    for (String markerKey : pinMarkerKeys) {
      LivePinTransition transition = pinFamilyState.livePinTransitionsByMarkerKey.get(markerKey);
      if (
        transition == null ||
        transition.isAwaitingSourceCommit ||
        transition.targetOpacity < 0.999d
      ) {
        continue;
      }
      transition.startOpacity = 0d;
      transition.startedAtMs = nowMs;
      restartedPinCount += 1;
    }

    ArrayList<String> dotMarkerKeys = new ArrayList<>(dotFamilyState.liveDotTransitionsByMarkerKey.keySet());
    Collections.sort(dotMarkerKeys);
    for (String markerKey : dotMarkerKeys) {
      LiveDotTransition transition = dotFamilyState.liveDotTransitionsByMarkerKey.get(markerKey);
      if (
        transition == null ||
        transition.isAwaitingSourceCommit ||
        transition.targetOpacity < 0.999d
      ) {
        continue;
      }
      transition.startOpacity = 0d;
      transition.startedAtMs = nowMs;
      restartedDotCount += 1;
    }

    if (restartedPinCount == 0 && restartedDotCount == 0) {
      return;
    }
    instances.put(instanceId, state);
    emitVisualDiag(
      instanceId,
      "live_enter_transition_restarted pinCount=" +
      restartedPinCount +
      " dotCount=" +
      restartedDotCount
    );
  }

  private static HashMap<String, Value> livePinFeatureState(double opacity) {
    HashMap<String, Value> state = new HashMap<>();
    state.put("nativeLodOpacity", Value.valueOf(opacity));
    state.put("nativeLodRankOpacity", Value.valueOf(opacity));
    return state;
  }

  private static HashMap<String, Value> liveLabelFeatureState(double opacity) {
    HashMap<String, Value> state = new HashMap<>();
    state.put("nativeLabelOpacity", Value.valueOf(opacity));
    return state;
  }

  private static HashMap<String, Value> liveDotFeatureState(double opacity) {
    HashMap<String, Value> state = new HashMap<>();
    state.put("nativeDotOpacity", Value.valueOf(opacity));
    return state;
  }

  private static void initializeDerivedFamilyStates(InstanceState state) {
    state.derivedFamilyStates.clear();
    for (String sourceId : Arrays.asList(
      state.pinSourceId,
      state.pinInteractionSourceId,
      state.dotSourceId,
      state.labelSourceId,
      state.labelCollisionSourceId
    )) {
      state.derivedFamilyStates.put(sourceId, new DerivedFamilyState());
    }
    for (String sourceId : state.pinSlotSourceIds) {
      state.derivedFamilyStates.put(sourceId, new DerivedFamilyState());
    }
  }

  private static DerivedFamilyState derivedFamilyState(InstanceState state, String sourceId) {
    if (!state.derivedFamilyStates.containsKey(sourceId)) {
      state.derivedFamilyStates.put(sourceId, new DerivedFamilyState());
    }
    return state.derivedFamilyStates.get(sourceId);
  }

  private static SourceState mountedSourceState(InstanceState state, String sourceId) {
    if (state.derivedFamilyStates.containsKey(sourceId)) {
      return state.derivedFamilyStates.get(sourceId).sourceState;
    }
    return null;
  }

  private static void syncCollectionMetadataFromMountedSourceState(
    ParsedFeatureCollection collection,
    SourceState sourceState
  ) {
    collection.baseSourceRevision = sourceState.sourceRevision;
    collection.baseFeatureStateRevision = sourceState.featureStateRevision;
    collection.sourceRevision = sourceState.sourceRevision;
    collection.featureStateRevision = sourceState.featureStateRevision;
    collection.featureStateEntryRevisionById.clear();
    collection.featureStateEntryRevisionById.putAll(sourceState.featureStateEntryRevisionById);
    collection.featureStateChangedIds.clear();
    collection.featureStateById.clear();
    collection.featureStateById.putAll(sourceState.featureStateById);
  }

  private static void syncMountedSourceState(
    InstanceState state,
    String sourceId,
    SourceState sourceState,
    DerivedFamilyState familyState
  ) {
    familyState.sourceState = sourceState;
    syncCollectionMetadataFromMountedSourceState(familyState.desiredCollection, sourceState);
    syncCollectionMetadataFromMountedSourceState(familyState.collection, sourceState);
  }

  private static void syncMountedSourceState(
    InstanceState state,
    String sourceId,
    SourceState sourceState
  ) {
    if (state.derivedFamilyStates.containsKey(sourceId)) {
      DerivedFamilyState familyState = state.derivedFamilyStates.get(sourceId);
      familyState.sourceState = sourceState;
      syncCollectionMetadataFromMountedSourceState(familyState.desiredCollection, sourceState);
      syncCollectionMetadataFromMountedSourceState(familyState.collection, sourceState);
    }
  }

  private static void markLogicalFamilyCollectionResident(DerivedFamilyState familyState) {
    SourceState sourceState = sourceStateFromCollection(familyState.collection);
    familyState.sourceState = sourceState;
    syncCollectionMetadataFromMountedSourceState(familyState.desiredCollection, sourceState);
    syncCollectionMetadataFromMountedSourceState(familyState.collection, sourceState);
  }

  private static Integer slotIndexFromFeature(Feature feature) {
    if (feature == null) {
      return null;
    }
    try {
      Number nativeLodZ = feature.getNumberProperty("nativeLodZ");
      if (nativeLodZ != null) {
        return nativeLodZ.intValue();
      }
    } catch (Exception ignored) {
    }
    try {
      Number lodZ = feature.getNumberProperty("lodZ");
      if (lodZ != null) {
        return lodZ.intValue();
      }
    } catch (Exception ignored) {
    }
    return null;
  }

  private static String slotSourceId(List<String> sourceIds, int slotIndex) {
    if (slotIndex < 0 || slotIndex >= sourceIds.size()) {
      return null;
    }
    return sourceIds.get(slotIndex);
  }

  private static ArrayList<ParsedCollectionApplyPlan> buildSlotApplyPlans(
    InstanceState state,
    List<String> sourceIds,
    ParsedFeatureCollection nextCollection
  ) {
    ArrayList<ParsedCollectionApplyPlan> plans = new ArrayList<>();
    if (sourceIds.isEmpty()) {
      return plans;
    }
    LinkedHashSet<String> changedGroupIds = new LinkedHashSet<>(nextCollection.dirtyGroupIds);
    changedGroupIds.addAll(nextCollection.removedGroupIds);
    if (changedGroupIds.isEmpty()) {
      return plans;
    }

    ArrayList<LinkedHashSet<String>> nextGroupIdsBySlot = new ArrayList<>();
    ArrayList<Map<String, ArrayList<String>>> desiredFeatureIdsByGroupBySlot = new ArrayList<>();
    ArrayList<Map<String, Feature>> dirtyFeatureByIdBySlot = new ArrayList<>();
    ArrayList<Map<String, HashMap<String, Value>>> dirtyFeatureStateByIdBySlot = new ArrayList<>();
    ArrayList<Map<String, String>> dirtyMarkerKeyByFeatureIdBySlot = new ArrayList<>();
    for (int slotIndex = 0; slotIndex < sourceIds.size(); slotIndex += 1) {
      nextGroupIdsBySlot.add(new LinkedHashSet<>());
      desiredFeatureIdsByGroupBySlot.add(new HashMap<>());
      dirtyFeatureByIdBySlot.add(new HashMap<>());
      dirtyFeatureStateByIdBySlot.add(new HashMap<>());
      dirtyMarkerKeyByFeatureIdBySlot.add(new HashMap<>());
    }

    TreeSet<Integer> affectedSlotIndexes = new TreeSet<>();
    for (String groupId : changedGroupIds) {
      for (int slotIndex = 0; slotIndex < sourceIds.size(); slotIndex += 1) {
        DerivedFamilyState familyState = derivedFamilyState(state, sourceIds.get(slotIndex));
        if (familyState.collection.groupedFeatureIdsByGroup.containsKey(groupId)) {
          affectedSlotIndexes.add(slotIndex);
        }
      }

      ArrayList<String> groupFeatureIds = nextCollection.groupedFeatureIdsByGroup.get(groupId);
      if (groupFeatureIds == null || groupFeatureIds.isEmpty()) {
        continue;
      }
      Integer nextSlotIndex = null;
      for (String featureId : groupFeatureIds) {
        Feature feature = nextCollection.featureById.get(featureId);
        Integer slotIndex = slotIndexFromFeature(feature);
        if (slotIndex == null || slotIndex < 0 || slotIndex >= sourceIds.size()) {
          continue;
        }
        nextSlotIndex = slotIndex;
        break;
      }
      if (nextSlotIndex == null) {
        continue;
      }
      affectedSlotIndexes.add(nextSlotIndex);
      nextGroupIdsBySlot.get(nextSlotIndex).add(groupId);
      desiredFeatureIdsByGroupBySlot.get(nextSlotIndex).put(groupId, new ArrayList<>(groupFeatureIds));
      for (String featureId : groupFeatureIds) {
        Feature feature = nextCollection.featureById.get(featureId);
        if (feature == null) {
          continue;
        }
        dirtyFeatureByIdBySlot.get(nextSlotIndex).put(featureId, feature);
        HashMap<String, Value> featureState = nextCollection.featureStateById.get(featureId);
        if (featureState != null && !featureState.isEmpty()) {
          dirtyFeatureStateByIdBySlot.get(nextSlotIndex).put(featureId, featureState);
        }
        String markerKey = nextCollection.markerKeyByFeatureId.containsKey(featureId)
          ? nextCollection.markerKeyByFeatureId.get(featureId)
          : groupId;
        dirtyMarkerKeyByFeatureIdBySlot.get(nextSlotIndex).put(featureId, markerKey);
      }
    }

    ArrayList<String> orderedChangedGroupIds = new ArrayList<>();
    for (String groupId : nextCollection.groupOrder) {
      if (changedGroupIds.contains(groupId)) {
        orderedChangedGroupIds.add(groupId);
      }
    }

    for (int slotIndex : affectedSlotIndexes) {
      String sourceId = sourceIds.get(slotIndex);
      DerivedFamilyState familyState = derivedFamilyState(state, sourceId);
      SourceState previousSourceState = familyState.sourceState;
      ArrayList<String> idsInOrder = new ArrayList<>();
      Map<String, Feature> featureById = new HashMap<>(familyState.collection.featureById);
      Map<String, HashMap<String, Value>> featureStateById =
        new HashMap<>(familyState.collection.featureStateById);
      Map<String, String> markerKeyByFeatureId =
        new HashMap<>(familyState.collection.markerKeyByFeatureId);
      ArrayList<String> desiredGroupOrder = new ArrayList<>();
      for (String existingGroupId : familyState.collection.groupOrder) {
        if (!changedGroupIds.contains(existingGroupId)) {
          desiredGroupOrder.add(existingGroupId);
        }
      }
      for (String groupId : orderedChangedGroupIds) {
        if (nextGroupIdsBySlot.get(slotIndex).contains(groupId) && !desiredGroupOrder.contains(groupId)) {
          desiredGroupOrder.add(groupId);
        }
      }

      LinkedHashSet<String> previousGroupIds = new LinkedHashSet<>(familyState.collection.groupOrder);
      LinkedHashSet<String> nextGroupIds = new LinkedHashSet<>(desiredGroupOrder);
      LinkedHashSet<String> removedGroupIds = new LinkedHashSet<>(previousGroupIds);
      removedGroupIds.removeAll(nextGroupIds);
      LinkedHashSet<String> addedGroupIds = new LinkedHashSet<>(nextGroupIds);
      addedGroupIds.removeAll(previousGroupIds);
      for (String groupId : removedGroupIds) {
        ArrayList<String> previousFeatureIds = familyState.collection.groupedFeatureIdsByGroup.get(groupId);
        if (previousFeatureIds == null) {
          continue;
        }
        for (String featureId : previousFeatureIds) {
          featureById.remove(featureId);
          featureStateById.remove(featureId);
          markerKeyByFeatureId.remove(featureId);
        }
      }
      for (String groupId : nextGroupIdsBySlot.get(slotIndex)) {
        ArrayList<String> nextFeatureIds = desiredFeatureIdsByGroupBySlot.get(slotIndex).get(groupId);
        if (nextFeatureIds == null) {
          continue;
        }
        ArrayList<String> previousFeatureIds = familyState.collection.groupedFeatureIdsByGroup.get(groupId);
        if (previousFeatureIds != null) {
          for (String featureId : previousFeatureIds) {
            if (nextFeatureIds.contains(featureId)) {
              continue;
            }
            featureById.remove(featureId);
            featureStateById.remove(featureId);
            markerKeyByFeatureId.remove(featureId);
          }
        }
        featureById.putAll(dirtyFeatureByIdBySlot.get(slotIndex));
        featureStateById.putAll(dirtyFeatureStateByIdBySlot.get(slotIndex));
        markerKeyByFeatureId.putAll(dirtyMarkerKeyByFeatureIdBySlot.get(slotIndex));
      }
      for (String groupId : desiredGroupOrder) {
        ArrayList<String> featureIds =
          desiredFeatureIdsByGroupBySlot.get(slotIndex).containsKey(groupId)
            ? desiredFeatureIdsByGroupBySlot.get(slotIndex).get(groupId)
            : familyState.collection.groupedFeatureIdsByGroup.get(groupId);
        if (featureIds != null) {
          idsInOrder.addAll(featureIds);
        }
      }
      LinkedHashSet<String> dirtyGroupIds = new LinkedHashSet<>(nextGroupIdsBySlot.get(slotIndex));
      dirtyGroupIds.addAll(removedGroupIds);
      dirtyGroupIds.addAll(addedGroupIds);
      LinkedHashSet<String> orderChangedGroupIds = new LinkedHashSet<>(dirtyGroupIds);

      if (
        familyState.collection.groupOrder.equals(desiredGroupOrder) &&
        dirtyGroupIds.isEmpty() &&
        orderChangedGroupIds.isEmpty() &&
        removedGroupIds.isEmpty()
      ) {
        continue;
      }

      replaceParsedFeatureCollection(
        familyState.collection,
        previousSourceState,
        idsInOrder,
        featureById,
        featureStateById,
        markerKeyByFeatureId,
        dirtyGroupIds,
        orderChangedGroupIds,
        removedGroupIds
      );
      if (
        previousSourceState != null &&
        Objects.equals(previousSourceState.sourceRevision, familyState.collection.sourceRevision) &&
        Objects.equals(previousSourceState.featureStateRevision, familyState.collection.featureStateRevision)
      ) {
        continue;
      }
      plans.add(
        new ParsedCollectionApplyPlan(
          sourceId,
          familyState.collection,
          previousSourceState,
          previousSourceState != null
            ? previousSourceState.featureStateById
            : Collections.emptyMap(),
          previousSourceState != null
            ? previousSourceState.featureStateRevision
            : "",
          true
        )
      );
    }
    return plans;
  }

  private static void applyTransientFeatureState(
    SourceState sourceState,
    DerivedFamilyState familyState,
    String featureId,
    HashMap<String, Value> transientState,
    ArrayList<Map.Entry<String, HashMap<String, Value>>> applyList
  ) {
    HashMap<String, Value> previousState = sourceState.featureStateById.get(featureId);
    HashMap<String, Value> mergedState = applyRetainedFeatureStatePatch(
      sourceState,
      featureId,
      transientState
    );
    if (!mergedState.equals(previousState)) {
      applyList.add(new AbstractMap.SimpleImmutableEntry<>(featureId, mergedState));
    }
    familyState.transientFeatureStateById.put(featureId, transientState);
  }

  private static void applyTransientFeatureState(
    SourceState sourceState,
    DerivedFamilyState familyState,
    String sourceId,
    String featureId,
    HashMap<String, Value> transientState,
    ArrayList<FeatureStateApply> applyList
  ) {
    HashMap<String, Value> previousState = sourceState.featureStateById.get(featureId);
    HashMap<String, Value> mergedState = applyRetainedFeatureStatePatch(
      sourceState,
      featureId,
      transientState
    );
    if (!mergedState.equals(previousState)) {
      applyList.add(new FeatureStateApply(sourceId, featureId, mergedState));
    }
    familyState.transientFeatureStateById.put(featureId, transientState);
  }

  private static void applyTransientFeatureState(
    SourceState sourceState,
    DerivedFamilyState familyState,
    String featureId,
    HashMap<String, Value> transientState
  ) {
    applyRetainedFeatureStatePatch(sourceState, featureId, transientState);
    familyState.transientFeatureStateById.put(featureId, transientState);
  }

  private static void clearTransientFeatureState(
    SourceState sourceState,
    DerivedFamilyState familyState,
    String featureId
  ) {
    HashMap<String, Value> transientState = familyState.transientFeatureStateById.get(featureId);
    if (transientState != null) {
      clearRetainedFeatureStateKeys(sourceState, featureId, transientState.keySet());
    } else {
      sourceState.featureStateEntryRevisionById.remove(featureId);
    }
    familyState.transientFeatureStateById.remove(featureId);
  }

  private static HashMap<String, Value> applyRetainedFeatureStatePatch(
    SourceState sourceState,
    String featureId,
    Map<String, Value> statePatch
  ) {
    HashMap<String, Value> mergedState = new HashMap<>(
      sourceState.featureStateById.containsKey(featureId)
        ? sourceState.featureStateById.get(featureId)
        : new HashMap<>()
    );
    mergedState.putAll(statePatch);
    sourceState.featureStateById.put(featureId, mergedState);
    sourceState.featureStateEntryRevisionById.put(featureId, buildFeatureStateEntryRevision(mergedState));
    return mergedState;
  }

  private static void clearRetainedFeatureStateKeys(
    SourceState sourceState,
    String featureId,
    Set<String> stateKeys
  ) {
    HashMap<String, Value> nextState = sourceState.featureStateById.get(featureId);
    if (nextState == null) {
      sourceState.featureStateEntryRevisionById.remove(featureId);
      return;
    }
    nextState = new HashMap<>(nextState);
    for (String stateKey : stateKeys) {
      nextState.remove(stateKey);
    }
    if (nextState.isEmpty()) {
      sourceState.featureStateById.remove(featureId);
      sourceState.featureStateEntryRevisionById.remove(featureId);
      return;
    }
    sourceState.featureStateById.put(featureId, nextState);
    sourceState.featureStateEntryRevisionById.put(featureId, buildFeatureStateEntryRevision(nextState));
  }

  private static void refreshFeatureStateRevision(SourceState sourceState) {
    sourceState.featureStateRevision = buildFeatureStateRevisionFromEntries(
      sourceState.featureStateEntryRevisionById
    );
  }

  private void startAwaitingLivePinTransitions(
    String instanceId,
    String sourceId,
    String dataId,
    InstanceState state
  ) {
    if (isVisualSourceInactiveOrDismissing(state)) {
      return;
    }
    double nowMs = nowMs();
    boolean didStart = false;
    DerivedFamilyState pinFamilyState = derivedFamilyState(state, state.pinSourceId);
    DerivedFamilyState labelFamilyState = derivedFamilyState(state, state.labelSourceId);
    SourceState pinSourceState = pinFamilyState.sourceState;
    SourceState labelSourceState = labelFamilyState.sourceState;
    for (Map.Entry<String, LivePinTransition> entry : pinFamilyState.livePinTransitionsByMarkerKey.entrySet()) {
      if (
        !entry.getValue().isAwaitingSourceCommit ||
        (
          sourceId != null &&
          !shouldStartAwaitingTransition(entry.getValue().awaitingSourceDataId, sourceId, dataId)
        )
      ) {
        continue;
      }
      entry.getValue().isAwaitingSourceCommit = false;
      entry.getValue().awaitingSourceDataId = null;
      entry.getValue().startedAtMs = nowMs;
      entry.getValue().startOpacity = 0d;
      applyTransientFeatureState(
        pinSourceState,
        pinFamilyState,
        entry.getKey(),
        livePinFeatureState(0d)
      );
      for (FeatureRecord labelFeature : entry.getValue().labelFeatures) {
        applyTransientFeatureState(
          labelSourceState,
          labelFamilyState,
          labelFeature.id,
          liveLabelFeatureState(0d)
        );
      }
      didStart = true;
    }
    if (didStart) {
      refreshFeatureStateRevision(pinSourceState);
      refreshFeatureStateRevision(labelSourceState);
      syncMountedSourceState(state, state.pinSourceId, pinSourceState, pinFamilyState);
      syncMountedSourceState(state, state.labelSourceId, labelSourceState, labelFamilyState);
      instances.put(instanceId, state);
      updateLivePinTransitionAnimation(instanceId, state);
    }
  }

  private void startAwaitingLiveDotTransitions(String instanceId, String dataId, InstanceState state) {
    if (isVisualSourceInactiveOrDismissing(state)) {
      return;
    }
    double nowMs = nowMs();
    boolean didStart = false;
    DerivedFamilyState dotFamilyState = derivedFamilyState(state, state.dotSourceId);
    SourceState dotSourceState = dotFamilyState.sourceState;
    for (Map.Entry<String, LiveDotTransition> entry : dotFamilyState.liveDotTransitionsByMarkerKey.entrySet()) {
      if (
        !entry.getValue().isAwaitingSourceCommit ||
        !shouldStartAwaitingTransition(entry.getValue().awaitingSourceDataId, state.dotSourceId, dataId)
      ) {
        continue;
      }
      entry.getValue().isAwaitingSourceCommit = false;
      entry.getValue().awaitingSourceDataId = null;
      entry.getValue().startedAtMs = nowMs;
      entry.getValue().startOpacity = 0d;
      applyTransientFeatureState(
        dotSourceState,
        dotFamilyState,
        entry.getKey(),
        liveDotFeatureState(0d)
      );
      didStart = true;
    }
    if (didStart) {
      refreshFeatureStateRevision(dotSourceState);
      syncMountedSourceState(state, state.dotSourceId, dotSourceState, dotFamilyState);
      instances.put(instanceId, state);
      updateLivePinTransitionAnimation(instanceId, state);
    }
  }

  private void applyLivePinTransitionFeatureStates(String instanceId) throws Exception {
    InstanceState state = instances.get(instanceId);
    if (state == null) {
      return;
    }
    if (isVisualSourceInactiveOrDismissing(state)) {
      instances.put(instanceId, state);
      cancelLivePinTransitionAnimation(instanceId);
      return;
    }
    if (isSourceRecoveryActive(state)) {
      instances.put(instanceId, state);
      cancelLivePinTransitionAnimation(instanceId);
      return;
    }
    if (
      !ensureSourcesReady(
        state,
        instanceId,
        visualSourceIds(state),
        "live_pin_transition_feature_states",
        false
      )
    ) {
      instances.put(instanceId, state);
      return;
    }
    DerivedFamilyState pinFamilyState = derivedFamilyState(state, state.pinSourceId);
    if (
      pinFamilyState.sourceState.sourceRevision.isEmpty() &&
      pinFamilyState.sourceState.featureIds.isEmpty() &&
      pinFamilyState.collection.idsInOrder.isEmpty()
    ) {
      return;
    }
    SourceState pinSourceState = pinFamilyState.sourceState;
    DerivedFamilyState dotFamilyState = derivedFamilyState(state, state.dotSourceId);
    SourceState dotSourceState = dotFamilyState.sourceState;
    DerivedFamilyState labelFamilyState = derivedFamilyState(state, state.labelSourceId);
    SourceState labelSourceState = labelFamilyState.sourceState;

    double nowMs = nowMs();
    ArrayList<String> completedEnterMarkerKeys = new ArrayList<>();
    ArrayList<String> completedExitMarkerKeys = new ArrayList<>();
    ArrayList<String> completedDotEnterMarkerKeys = new ArrayList<>();
    ArrayList<String> completedDotExitMarkerKeys = new ArrayList<>();
    ArrayList<FeatureStateApply> featureStatesToApply = new ArrayList<>();
    ArrayList<Map.Entry<String, HashMap<String, Value>>> dotFeatureStatesToApply = new ArrayList<>();
    ArrayList<FeatureStateApply> labelFeatureStatesToApply = new ArrayList<>();
    boolean pinSourceFeatureStateChanged = false;
    boolean dotSourceFeatureStateChanged = false;
    boolean labelSourceFeatureStateChanged = false;

    for (Map.Entry<String, LivePinTransition> entry : pinFamilyState.livePinTransitionsByMarkerKey.entrySet()) {
      String markerKey = entry.getKey();
      LivePinTransition transition = entry.getValue();
      if (transition.isAwaitingSourceCommit) {
        continue;
      }
      double opacity = livePinTransitionOpacity(transition, nowMs);
      String pinPhysicalSourceId = slotSourceId(state.pinSlotSourceIds, transition.lodZ);
      String labelPhysicalSourceId = slotSourceId(state.pinSlotSourceIds, transition.lodZ);
      if (pinPhysicalSourceId == null || labelPhysicalSourceId == null) {
        emitError(
          instanceId,
          "live_pin_transition_invalid_slot markerKey=" +
          markerKey +
          " lodZ=" +
          transition.lodZ
        );
        continue;
      }
      int previousPinApplyCount = featureStatesToApply.size();
      applyTransientFeatureState(
        pinSourceState,
        pinFamilyState,
        pinPhysicalSourceId,
        markerKey,
        livePinFeatureState(opacity),
        featureStatesToApply
      );
      if (featureStatesToApply.size() != previousPinApplyCount) {
        pinSourceFeatureStateChanged = true;
      }
      for (FeatureRecord labelFeature : transition.labelFeatures) {
        int previousLabelApplyCount = labelFeatureStatesToApply.size();
        applyTransientFeatureState(
          labelSourceState,
          labelFamilyState,
          labelPhysicalSourceId,
          labelFeature.id,
          liveLabelFeatureState(opacity),
          labelFeatureStatesToApply
        );
        if (labelFeatureStatesToApply.size() != previousLabelApplyCount) {
          labelSourceFeatureStateChanged = true;
        }
      }

      if (Math.abs(opacity - transition.targetOpacity) < 0.001d) {
        if (transition.targetOpacity >= 0.999d) {
          completedEnterMarkerKeys.add(markerKey);
        } else {
          completedExitMarkerKeys.add(markerKey);
        }
      }
    }

    for (Map.Entry<String, LiveDotTransition> entry : dotFamilyState.liveDotTransitionsByMarkerKey.entrySet()) {
      String markerKey = entry.getKey();
      LiveDotTransition transition = entry.getValue();
      if (transition.isAwaitingSourceCommit) {
        continue;
      }
      double opacity = liveDotTransitionOpacity(transition, nowMs);
      int previousDotApplyCount = dotFeatureStatesToApply.size();
      applyTransientFeatureState(
        dotSourceState,
        dotFamilyState,
        markerKey,
        liveDotFeatureState(opacity),
        dotFeatureStatesToApply
      );
      if (dotFeatureStatesToApply.size() != previousDotApplyCount) {
        dotSourceFeatureStateChanged = true;
      }
      if (Math.abs(opacity - transition.targetOpacity) < 0.001d) {
        if (transition.targetOpacity >= 0.999d) {
          completedDotEnterMarkerKeys.add(markerKey);
        } else {
          completedDotExitMarkerKeys.add(markerKey);
        }
      }
    }
    if (pinSourceFeatureStateChanged) {
      refreshFeatureStateRevision(pinSourceState);
    }
    if (labelSourceFeatureStateChanged) {
      refreshFeatureStateRevision(labelSourceState);
    }
    if (dotSourceFeatureStateChanged) {
      refreshFeatureStateRevision(dotSourceState);
    }

    if (!featureStatesToApply.isEmpty()) {
      RNMBXMapView mapView = resolveMapView(state.mapTag);
      if (mapView == null) {
        throw new IllegalStateException("Map view not found for react tag " + state.mapTag);
      }
      for (FeatureStateApply featureStateEntry : featureStatesToApply) {
        mapView
          .getMapboxMap()
          .setFeatureState(
            featureStateEntry.sourceId,
            null,
            featureStateEntry.featureId,
            Value.valueOf(featureStateEntry.state),
            result -> { }
          );
      }
    }
    if (!dotFeatureStatesToApply.isEmpty()) {
      RNMBXMapView mapView = resolveMapView(state.mapTag);
      if (mapView == null) {
        throw new IllegalStateException("Map view not found for react tag " + state.mapTag);
      }
      for (Map.Entry<String, HashMap<String, Value>> featureStateEntry : dotFeatureStatesToApply) {
        mapView
          .getMapboxMap()
          .setFeatureState(state.dotSourceId, null, featureStateEntry.getKey(), Value.valueOf(featureStateEntry.getValue()), result -> { });
      }
    }
    if (!labelFeatureStatesToApply.isEmpty()) {
      RNMBXMapView mapView = resolveMapView(state.mapTag);
      if (mapView == null) {
        throw new IllegalStateException("Map view not found for react tag " + state.mapTag);
      }
      for (FeatureStateApply featureStateEntry : labelFeatureStatesToApply) {
        mapView
          .getMapboxMap()
          .setFeatureState(
            featureStateEntry.sourceId,
            null,
            featureStateEntry.featureId,
            Value.valueOf(featureStateEntry.state),
            result -> { }
          );
      }
    }

    syncMountedSourceState(state, state.pinSourceId, pinSourceState, pinFamilyState);
    syncMountedSourceState(state, state.dotSourceId, dotSourceState, dotFamilyState);
    syncMountedSourceState(state, state.labelSourceId, labelSourceState, labelFamilyState);
    instances.put(instanceId, state);

    if (!completedEnterMarkerKeys.isEmpty() || !completedExitMarkerKeys.isEmpty()) {
      finalizeCompletedLivePinTransitions(instanceId, completedEnterMarkerKeys, completedExitMarkerKeys);
      state = instances.get(instanceId);
    }
    if (state != null && (!completedDotEnterMarkerKeys.isEmpty() || !completedDotExitMarkerKeys.isEmpty())) {
      finalizeCompletedLiveDotTransitions(instanceId, completedDotEnterMarkerKeys, completedDotExitMarkerKeys);
      state = instances.get(instanceId);
    }
    if (state != null) {
      updateLivePinTransitionAnimation(instanceId, state);
    }
  }

  private void finalizeCompletedLivePinTransitions(
    String instanceId,
    List<String> enteredMarkerKeys,
    List<String> exitedMarkerKeys
  ) throws Exception {
    InstanceState state = instances.get(instanceId);
    if (state == null) {
      return;
    }
    Set<String> enteredMarkerKeySet = new HashSet<>(enteredMarkerKeys);
    Set<String> exitedMarkerKeySet = new HashSet<>(exitedMarkerKeys);
    Set<String> completedMarkerKeys = new TreeSet<>(enteredMarkerKeySet);
    completedMarkerKeys.addAll(exitedMarkerKeySet);
    if (completedMarkerKeys.isEmpty()) {
      return;
    }

    DerivedFamilyState pinFamilyState = derivedFamilyState(state, state.pinSourceId);
    for (String markerKey : completedMarkerKeys) {
      LivePinTransition transition = pinFamilyState.livePinTransitionsByMarkerKey.get(markerKey);
      pinFamilyState.livePinTransitionsByMarkerKey.remove(markerKey);

      DerivedFamilyState completedPinFamilyState = derivedFamilyState(state, state.pinSourceId);
      DerivedFamilyState completedLabelFamilyState = derivedFamilyState(state, state.labelSourceId);
      SourceState pinSourceState = completedPinFamilyState.sourceState;
      if (
        !pinSourceState.sourceRevision.isEmpty() ||
        !pinSourceState.featureIds.isEmpty() ||
        !completedPinFamilyState.collection.idsInOrder.isEmpty()
      ) {
        if (enteredMarkerKeySet.contains(markerKey)) {
          applyTransientFeatureState(
            pinSourceState,
            completedPinFamilyState,
            markerKey,
            livePinFeatureState(1d)
          );
        } else {
          clearTransientFeatureState(pinSourceState, completedPinFamilyState, markerKey);
        }
        syncMountedSourceState(state, state.pinSourceId, pinSourceState, completedPinFamilyState);
      }
      SourceState labelSourceState = completedLabelFamilyState.sourceState;
      if (
        (!labelSourceState.sourceRevision.isEmpty() ||
          !labelSourceState.featureIds.isEmpty() ||
          !completedLabelFamilyState.collection.idsInOrder.isEmpty()) &&
        transition != null
      ) {
        for (FeatureRecord labelFeature : transition.labelFeatures) {
          if (enteredMarkerKeySet.contains(markerKey)) {
            applyTransientFeatureState(
              labelSourceState,
              completedLabelFamilyState,
              labelFeature.id,
              liveLabelFeatureState(1d)
            );
          } else {
            clearTransientFeatureState(
              labelSourceState,
              completedLabelFamilyState,
              labelFeature.id
            );
          }
        }
        syncMountedSourceState(state, state.labelSourceId, labelSourceState, completedLabelFamilyState);
      }
    }
    SourceState pinSourceState = pinFamilyState.sourceState;
    if (
      !pinSourceState.sourceRevision.isEmpty() ||
      !pinSourceState.featureIds.isEmpty() ||
      !pinFamilyState.collection.idsInOrder.isEmpty()
    ) {
      refreshFeatureStateRevision(pinSourceState);
      syncMountedSourceState(state, state.pinSourceId, pinSourceState, pinFamilyState);
    }
    DerivedFamilyState labelFamilyState = derivedFamilyState(state, state.labelSourceId);
    SourceState labelSourceState = labelFamilyState.sourceState;
    if (
      !labelSourceState.sourceRevision.isEmpty() ||
      !labelSourceState.featureIds.isEmpty() ||
      !labelFamilyState.collection.idsInOrder.isEmpty()
    ) {
      refreshFeatureStateRevision(labelSourceState);
      syncMountedSourceState(state, state.labelSourceId, labelSourceState, labelFamilyState);
    }
    instances.put(instanceId, state);
    applyDesiredFrameSnapshots(instanceId, false);
  }

  private void finalizeCompletedLiveDotTransitions(
    String instanceId,
    List<String> enteredMarkerKeys,
    List<String> exitedMarkerKeys
  ) throws Exception {
    InstanceState state = instances.get(instanceId);
    if (state == null) {
      return;
    }
    Set<String> enteredMarkerKeySet = new HashSet<>(enteredMarkerKeys);
    Set<String> exitedMarkerKeySet = new HashSet<>(exitedMarkerKeys);
    Set<String> completedMarkerKeys = new TreeSet<>(enteredMarkerKeySet);
    completedMarkerKeys.addAll(exitedMarkerKeySet);
    if (completedMarkerKeys.isEmpty()) {
      return;
    }

    DerivedFamilyState dotFamilyState = derivedFamilyState(state, state.dotSourceId);
    for (String markerKey : completedMarkerKeys) {
      dotFamilyState.liveDotTransitionsByMarkerKey.remove(markerKey);
      DerivedFamilyState completedDotFamilyState = dotFamilyState;
      SourceState dotSourceState = completedDotFamilyState.sourceState;
      if (
        !dotSourceState.sourceRevision.isEmpty() ||
        !dotSourceState.featureIds.isEmpty() ||
        !completedDotFamilyState.collection.idsInOrder.isEmpty()
      ) {
        if (enteredMarkerKeySet.contains(markerKey)) {
          applyTransientFeatureState(
            dotSourceState,
            completedDotFamilyState,
            markerKey,
            liveDotFeatureState(1d)
          );
        } else {
          clearTransientFeatureState(dotSourceState, completedDotFamilyState, markerKey);
        }
        syncMountedSourceState(state, state.dotSourceId, dotSourceState, completedDotFamilyState);
      }
    }

    SourceState dotSourceState = dotFamilyState.sourceState;
    if (
      !dotSourceState.sourceRevision.isEmpty() ||
      !dotSourceState.featureIds.isEmpty() ||
      !dotFamilyState.collection.idsInOrder.isEmpty()
    ) {
      refreshFeatureStateRevision(dotSourceState);
      syncMountedSourceState(state, state.dotSourceId, dotSourceState, dotFamilyState);
    }

    instances.put(instanceId, state);
    applyDesiredFrameSnapshots(instanceId, false);
  }

  private static void clearDesiredPinSnapshot(DesiredPinSnapshotState snapshot) {
    snapshot.inputRevision = "";
    snapshot.pinIdsInOrder.clear();
    snapshot.pinFeatureByMarkerKey.clear();
    snapshot.pinFeatureRevisionByMarkerKey.clear();
    snapshot.pinInteractionFeatureByMarkerKey.clear();
    snapshot.pinInteractionFeatureRevisionByMarkerKey.clear();
    snapshot.pinLodZByMarkerKey.clear();
    snapshot.labelFeaturesByMarkerKey.clear();
    snapshot.labelMarkerKeyByFeatureId.clear();
    snapshot.labelFeatureRevisionByMarkerKey.clear();
    snapshot.labelCollisionFeatureByMarkerKey.clear();
    snapshot.labelCollisionFeatureRevisionByMarkerKey.clear();
    snapshot.dirtyPinMarkerKeys.clear();
    snapshot.dirtyPinInteractionMarkerKeys.clear();
    snapshot.dirtyLabelMarkerKeys.clear();
    snapshot.dirtyLabelCollisionMarkerKeys.clear();
  }

  private static void copyDesiredPinSnapshot(
    DesiredPinSnapshotState source,
    DesiredPinSnapshotState destination
  ) {
    clearDesiredPinSnapshot(destination);
    destination.inputRevision = source.inputRevision;
    destination.pinIdsInOrder.addAll(source.pinIdsInOrder);
    destination.pinFeatureByMarkerKey.putAll(source.pinFeatureByMarkerKey);
    destination.pinFeatureRevisionByMarkerKey.putAll(source.pinFeatureRevisionByMarkerKey);
    destination.pinInteractionFeatureByMarkerKey.putAll(source.pinInteractionFeatureByMarkerKey);
    destination.pinInteractionFeatureRevisionByMarkerKey.putAll(
      source.pinInteractionFeatureRevisionByMarkerKey
    );
    destination.pinLodZByMarkerKey.putAll(source.pinLodZByMarkerKey);
    for (Map.Entry<String, ArrayList<FeatureRecord>> entry : source.labelFeaturesByMarkerKey.entrySet()) {
      destination.labelFeaturesByMarkerKey.put(entry.getKey(), new ArrayList<>(entry.getValue()));
    }
    destination.labelMarkerKeyByFeatureId.putAll(source.labelMarkerKeyByFeatureId);
    destination.labelFeatureRevisionByMarkerKey.putAll(source.labelFeatureRevisionByMarkerKey);
    destination.labelCollisionFeatureByMarkerKey.putAll(source.labelCollisionFeatureByMarkerKey);
    destination.labelCollisionFeatureRevisionByMarkerKey.putAll(
      source.labelCollisionFeatureRevisionByMarkerKey
    );
    destination.dirtyPinMarkerKeys.addAll(source.dirtyPinMarkerKeys);
    destination.dirtyPinInteractionMarkerKeys.addAll(source.dirtyPinInteractionMarkerKeys);
    destination.dirtyLabelMarkerKeys.addAll(source.dirtyLabelMarkerKeys);
    destination.dirtyLabelCollisionMarkerKeys.addAll(source.dirtyLabelCollisionMarkerKeys);
  }

  private static void clearParsedFeatureCollection(ParsedFeatureCollection collection) {
    collection.baseSourceRevision = "";
    collection.baseFeatureStateRevision = "";
    collection.sourceRevision = "";
    collection.featureStateRevision = "";
    collection.dirtyGroupIds.clear();
    collection.orderChangedGroupIds.clear();
    collection.removedGroupIds.clear();
    collection.featureStateEntryRevisionById.clear();
    collection.featureStateChangedIds.clear();
    collection.featureIds.clear();
    collection.addedFeatureIdsInOrder.clear();
    collection.updatedFeatureIdsInOrder.clear();
    collection.removedFeatureIds.clear();
    collection.removedFeatureIdsInOrder.clear();
    collection.idsInOrder.clear();
    collection.groupedFeatureIdsByGroup.clear();
    collection.groupOrder.clear();
    collection.featureById.clear();
    collection.diffKeyById.clear();
    collection.featureStateById.clear();
    collection.markerKeyByFeatureId.clear();
    collection.addedFeatures.clear();
    collection.updatedFeatures.clear();
  }

  private static void copyParsedFeatureCollection(
    ParsedFeatureCollection source,
    ParsedFeatureCollection destination
  ) {
    clearParsedFeatureCollection(destination);
    destination.baseSourceRevision = source.baseSourceRevision;
    destination.baseFeatureStateRevision = source.baseFeatureStateRevision;
    destination.sourceRevision = source.sourceRevision;
    destination.featureStateRevision = source.featureStateRevision;
    destination.dirtyGroupIds.addAll(source.dirtyGroupIds);
    destination.orderChangedGroupIds.addAll(source.orderChangedGroupIds);
    destination.removedGroupIds.addAll(source.removedGroupIds);
    destination.featureStateEntryRevisionById.putAll(source.featureStateEntryRevisionById);
    destination.featureStateChangedIds.addAll(source.featureStateChangedIds);
    destination.featureIds.addAll(source.featureIds);
    destination.addedFeatureIdsInOrder.addAll(source.addedFeatureIdsInOrder);
    destination.updatedFeatureIdsInOrder.addAll(source.updatedFeatureIdsInOrder);
    destination.removedFeatureIds.addAll(source.removedFeatureIds);
    destination.removedFeatureIdsInOrder.addAll(source.removedFeatureIdsInOrder);
    destination.idsInOrder.addAll(source.idsInOrder);
    for (Map.Entry<String, ArrayList<String>> entry : source.groupedFeatureIdsByGroup.entrySet()) {
      destination.groupedFeatureIdsByGroup.put(entry.getKey(), new ArrayList<>(entry.getValue()));
    }
    destination.groupOrder.addAll(source.groupOrder);
    destination.featureById.putAll(source.featureById);
    destination.diffKeyById.putAll(source.diffKeyById);
    destination.featureStateById.putAll(source.featureStateById);
    destination.markerKeyByFeatureId.putAll(source.markerKeyByFeatureId);
    destination.addedFeatures.addAll(source.addedFeatures);
    destination.updatedFeatures.addAll(source.updatedFeatures);
  }

  private static Feature featureWithNumericProperties(
    Feature feature,
    Map<String, Double> numericProperties
  ) {
    if (numericProperties.isEmpty()) {
      return feature;
    }
    JsonObject properties = feature.properties() != null ? feature.properties().deepCopy() : new JsonObject();
    Feature updatedFeature = Feature.fromGeometry(feature.geometry(), properties, feature.id(), feature.bbox());
    for (Map.Entry<String, Double> entry : numericProperties.entrySet()) {
      updatedFeature.addNumberProperty(entry.getKey(), entry.getValue());
    }
    return updatedFeature;
  }

  private static Feature featureWithStringProperties(
    Feature feature,
    String id,
    Map<String, String> stringProperties
  ) {
    JsonObject properties = feature.properties() != null ? feature.properties().deepCopy() : new JsonObject();
    Feature updatedFeature = Feature.fromGeometry(feature.geometry(), properties, id, feature.bbox());
    for (Map.Entry<String, String> entry : stringProperties.entrySet()) {
      updatedFeature.addStringProperty(entry.getKey(), entry.getValue());
    }
    return updatedFeature;
  }

  private static String promotedPinInteractionFeatureId(String markerKey) {
    return markerKey + "::pinInteraction";
  }

  private static void appendPromotedSlotFeature(
    ArrayList<String> idsInOrder,
    Map<String, Feature> featureById,
    Map<String, HashMap<String, Value>> featureStateById,
    Map<String, String> markerKeyByFeatureId,
    ParsedFeatureCollection sourceCollection,
    String sourceFeatureId,
    String targetFeatureId,
    String markerKey,
    String kind
  ) {
    Feature sourceFeature = sourceCollection.featureById.get(sourceFeatureId);
    if (sourceFeature == null) {
      return;
    }
    idsInOrder.add(targetFeatureId);
    featureById.put(
      targetFeatureId,
      featureWithStringProperties(
        sourceFeature,
        targetFeatureId,
        Collections.singletonMap("nativeSlotFeatureKind", kind)
      )
    );
    if (sourceCollection.featureStateById.containsKey(sourceFeatureId)) {
      featureStateById.put(
        targetFeatureId,
        new HashMap<>(sourceCollection.featureStateById.get(sourceFeatureId))
      );
    }
    markerKeyByFeatureId.put(targetFeatureId, markerKey);
  }

  private static ParsedFeatureCollection makePromotedSlotCollection(
    List<String> orderedMarkerKeys,
    ParsedFeatureCollection pins,
    ParsedFeatureCollection pinInteractions,
    ParsedFeatureCollection labels
  ) {
    ArrayList<String> idsInOrder = new ArrayList<>();
    Map<String, Feature> featureById = new HashMap<>();
    Map<String, HashMap<String, Value>> featureStateById = new HashMap<>();
    Map<String, String> markerKeyByFeatureId = new HashMap<>();
    Map<String, ArrayList<String>> labelIdsByMarkerKey = new HashMap<>();
    for (String labelFeatureId : labels.idsInOrder) {
      String markerKey =
        labels.markerKeyByFeatureId.containsKey(labelFeatureId)
          ? labels.markerKeyByFeatureId.get(labelFeatureId)
          : labelFeatureId;
      labelIdsByMarkerKey.computeIfAbsent(markerKey, ignored -> new ArrayList<>()).add(labelFeatureId);
    }
    for (String markerKey : orderedMarkerKeys) {
      appendPromotedSlotFeature(
        idsInOrder,
        featureById,
        featureStateById,
        markerKeyByFeatureId,
        pins,
        markerKey,
        markerKey,
        markerKey,
        "pin"
      );
      appendPromotedSlotFeature(
        idsInOrder,
        featureById,
        featureStateById,
        markerKeyByFeatureId,
        pinInteractions,
        markerKey,
        promotedPinInteractionFeatureId(markerKey),
        markerKey,
        "pinInteraction"
      );
      ArrayList<String> labelFeatureIds = labelIdsByMarkerKey.get(markerKey);
      if (labelFeatureIds != null) {
        for (String labelFeatureId : labelFeatureIds) {
          appendPromotedSlotFeature(
            idsInOrder,
            featureById,
            featureStateById,
            markerKeyByFeatureId,
            labels,
            labelFeatureId,
            labelFeatureId,
            markerKey,
            "label"
          );
        }
      }
    }
    ParsedFeatureCollection promotedSlotCollection = new ParsedFeatureCollection();
    replaceParsedFeatureCollection(
      promotedSlotCollection,
      null,
      idsInOrder,
      featureById,
      featureStateById,
      markerKeyByFeatureId,
      new LinkedHashSet<>(),
      new LinkedHashSet<>(),
      new LinkedHashSet<>()
    );
    return promotedSlotCollection;
  }

  private static HashMap<String, Value> retainedLabelFeatureState(
    Feature feature,
    String markerKey
  ) {
    return new HashMap<>();
  }

  private void applyInteractionSuppression(InstanceState state) throws Exception {
    // Generic suppression disables native press resolution through interactionMode. Like iOS,
    // the mounted interaction geometry stays resident through profile/camera transitions so
    // debug hit mirrors do not flash or republish. Terminal dismiss owns explicit source clear.
  }

  private void clearDismissLifecycleRequestForEnter(String instanceId, InstanceState state) {
    Runnable dismissRunnable = dismissSettleRunnables.remove(instanceId);
    if (dismissRunnable != null) {
      mainHandler.removeCallbacks(dismissRunnable);
    }
    Runnable dismissFrameFallback = dismissFrameFallbackRunnables.remove(instanceId);
    if (dismissFrameFallback != null) {
      mainHandler.removeCallbacks(dismissFrameFallback);
    }
    Runnable deferredDismissCleanup = deferredDismissSourceCleanupRunnables.remove(instanceId);
    if (deferredDismissCleanup != null) {
      mainHandler.removeCallbacks(deferredDismissCleanup);
    }
    state.lastDismissRequestKey = null;
    state.pendingPresentationSettleRequestKey = null;
    state.pendingPresentationSettleKind = null;
    state.blockedPresentationSettleRequestKey = null;
    state.blockedPresentationSettleKind = null;
    state.blockedPresentationCommitFenceDataIdsBySourceId.clear();
  }

  private void beginRevealVisualLifecycle(
    String instanceId,
    InstanceState state,
    String reason
  ) throws Exception {
    Runnable deferredDismissCleanup = deferredDismissSourceCleanupRunnables.remove(instanceId);
    if (deferredDismissCleanup != null) {
      mainHandler.removeCallbacks(deferredDismissCleanup);
    }
    resetLiveMarkerEnterState(instanceId, state, reason);
    setLabelCollisionObstacleLayersVisible(true, state, instanceId, "reveal_preroll");
    state.labelCollisionObstacleLayersVisible = true;
    state.visualSourceLifecycleState = VISUAL_SOURCE_PREPARING_REVEAL;
    state.keepSourcesHiddenUntilEnter = false;
    state.currentPresentationRenderPhase = "reveal_preroll";
    state.currentPresentationOpacityTarget = REVEAL_PREROLL_PLACEMENT_OPACITY;
    state.currentPresentationOpacityValue = REVEAL_PREROLL_PLACEMENT_OPACITY;
  }

  private void beginDismissVisualLifecycle(String instanceId, InstanceState state) throws Exception {
    setLabelCollisionObstacleLayersVisible(false, state, instanceId, "dismiss_start");
    state.labelCollisionObstacleLayersVisible = false;
    state.keepSourcesHiddenUntilEnter = true;
    state.currentPresentationRenderPhase = "exiting";
    state.visualSourceLifecycleState = VISUAL_SOURCE_DISMISSING;
    state.currentPresentationOpacityTarget = 0;
  }

  private void completeDismissVisualLifecycle(
    String instanceId,
    InstanceState state,
    String requestKey,
    String reason
  ) {
    Runnable labelObservationRefreshRunnable = labelObservationRefreshRunnables.remove(instanceId);
    if (labelObservationRefreshRunnable != null) {
      mainHandler.removeCallbacks(labelObservationRefreshRunnable);
    }
    Map<String, ParsedFeatureCollection> residentSourceCache = currentDesiredSourceCache(state);
    if (!residentSourceCache.isEmpty()) {
      state.residentDesiredSourceCacheBySourceId.clear();
      state.residentDesiredSourceCacheBySourceId.putAll(residentSourceCache);
    }
    if (state.labelCollisionObstacleLayersVisible) {
      setLabelCollisionObstacleLayersVisible(false, state, instanceId, reason);
      state.labelCollisionObstacleLayersVisible = false;
    }
    try {
      clearResidentSourcesAndTransientFeatureStates(state);
      clearDismissedHighlightState(state);
    } catch (Exception error) {
      emitError(
        instanceId,
        "dismiss_clear_sources_failed: " +
        (error.getMessage() != null ? error.getMessage() : "unknown")
      );
    }
    state.pendingSourceCommitDataIdsBySourceId.clear();
    state.blockedEnterStartCommitFenceDataIdsBySourceId.clear();
    state.blockedPresentationCommitFenceDataIdsBySourceId.clear();
    state.residentSourceFrameKey = null;
    state.residentSourceDataKey = null;
    initializeDerivedFamilyStates(state);
    state.currentPresentationRenderPhase = "idle";
    state.visualSourceLifecycleState = VISUAL_SOURCE_HIDDEN;
    state.keepSourcesHiddenUntilEnter = true;
    state.currentPresentationOpacityTarget = 0;
    state.currentPresentationOpacityValue = 0;
    state.sourceReadyFrameGenerationId = null;
    state.sourceReadyExecutionBatchId = null;
    state.residentSourceFrameKey = null;
    state.residentSourceDataKey = null;
    cancelLivePinTransitionAnimation(instanceId);
    instances.put(instanceId, state);
    WritableMap releasedEvent = Arguments.createMap();
    releasedEvent.putString("type", "presentation_visual_sources_collision_released");
    releasedEvent.putString("instanceId", instanceId);
    releasedEvent.putString("requestKey", requestKey);
    releasedEvent.putString("frameGenerationId", state.activeFrameGenerationId);
    releasedEvent.putInt("pinCount", state.lastPinCount);
    releasedEvent.putInt("dotCount", state.lastDotCount);
    releasedEvent.putInt("labelCount", state.lastLabelCount);
    releasedEvent.putDouble("releasedAtMs", nowMs());
    emit(releasedEvent);
  }

  private void clearResidentSourcesAndTransientFeatureStates(InstanceState state) throws Exception {
    List<String> sourceIds = managedSourceIds(state);
    RNMBXMapView mapView = resolveMapView(state.mapTag);
    if (mapView == null) {
      throw new IllegalStateException("Map view not found for react tag " + state.mapTag);
    }
    withStyle(state.mapTag, style -> {
      ParsedFeatureCollection emptyCollection = new ParsedFeatureCollection();
      for (String sourceId : sourceIds) {
        replaceSourceData(style, sourceId, emptyCollection);
      }
    });
    clearKnownFeatureStates(sourceIds, state, mapView);
  }

  private void clearKnownFeatureStates(
    List<String> sourceIds,
    InstanceState state,
    RNMBXMapView mapView
  ) {
    for (String sourceId : sourceIds) {
      DerivedFamilyState familyState = derivedFamilyState(state, sourceId);
      Set<String> featureIds = new LinkedHashSet<>();
      featureIds.addAll(familyState.sourceState.featureIds);
      featureIds.addAll(familyState.collection.featureIds);
      featureIds.addAll(familyState.desiredCollection.featureIds);
      featureIds.addAll(familyState.transientFeatureStateById.keySet());
      featureIds.addAll(familyState.sourceState.featureStateById.keySet());
      for (String featureId : featureIds) {
        removeFeatureStateKey(mapView.getMapboxMap(), sourceId, featureId, null);
      }
    }
  }

  private static void clearDismissedHighlightState(InstanceState state) {
    state.highlightedMarkerKey = null;
    state.highlightedMarkerKeys.clear();
    state.highlightedRestaurantId = null;
  }

  private void clearHiddenResidentSourceState(
    String instanceId,
    InstanceState state,
    String reason
  ) throws Exception {
    clearResidentSourcesAndTransientFeatureStates(state);
    clearDismissedHighlightState(state);
    state.pendingSourceCommitDataIdsBySourceId.clear();
    state.blockedEnterStartCommitFenceDataIdsBySourceId.clear();
    state.blockedPresentationCommitFenceDataIdsBySourceId.clear();
    initializeDerivedFamilyStates(state);
    instances.put(instanceId, state);
    emitVisualDiag(instanceId, "hidden_resident_source_state_cleared reason=" + reason);
  }

  private static Map<String, ParsedFeatureCollection> currentDesiredSourceCache(InstanceState state) {
    Map<String, ParsedFeatureCollection> cache = new HashMap<>();
    for (String sourceId : Arrays.asList(
      state.pinSourceId,
      state.pinInteractionSourceId,
      state.dotSourceId,
      state.labelSourceId,
      state.labelCollisionSourceId
    )) {
      ParsedFeatureCollection desiredCollection = derivedFamilyState(state, sourceId).desiredCollection;
      if (desiredCollection.idsInOrder.isEmpty()) {
        continue;
      }
      cache.put(sourceId, collectionByClearingTransientFeatureState(desiredCollection));
    }
    return cache;
  }

  private static ParsedFeatureCollection collectionByClearingTransientFeatureState(
    ParsedFeatureCollection collection
  ) {
    ParsedFeatureCollection nextCollection = new ParsedFeatureCollection();
    copyParsedFeatureCollection(collection, nextCollection);
    String emptyFeatureStateRevision = buildFeatureStateRevisionFromEntries(new HashMap<>());
    nextCollection.baseFeatureStateRevision = emptyFeatureStateRevision;
    nextCollection.featureStateRevision = emptyFeatureStateRevision;
    nextCollection.featureStateEntryRevisionById.clear();
    nextCollection.featureStateChangedIds.clear();
    nextCollection.featureStateById.clear();
    return nextCollection;
  }

  private static boolean restoreResidentDesiredSourceCacheForEnter(InstanceState state) {
    if (state.residentDesiredSourceCacheBySourceId.isEmpty()) {
      return false;
    }
    if (activeDesiredVisualSourceCount(state) > 0) {
      return false;
    }
    for (String sourceId : Arrays.asList(
      state.pinSourceId,
      state.pinInteractionSourceId,
      state.dotSourceId,
      state.labelSourceId,
      state.labelCollisionSourceId
    )) {
      ParsedFeatureCollection cachedDesiredCollection = state.residentDesiredSourceCacheBySourceId.get(sourceId);
      if (cachedDesiredCollection == null) {
        continue;
      }
      DerivedFamilyState familyState = new DerivedFamilyState();
      copyParsedFeatureCollection(cachedDesiredCollection, familyState.desiredCollection);
      state.derivedFamilyStates.put(sourceId, familyState);
    }
    state.pendingSourceCommitDataIdsBySourceId.clear();
    state.blockedEnterStartCommitFenceDataIdsBySourceId.clear();
    state.blockedPresentationCommitFenceDataIdsBySourceId.clear();
    return true;
  }

  private static int activeDesiredVisualSourceCount(InstanceState state) {
    return
      derivedFamilyState(state, state.pinSourceId).desiredCollection.idsInOrder.size() +
      derivedFamilyState(state, state.dotSourceId).desiredCollection.idsInOrder.size() +
      derivedFamilyState(state, state.labelSourceId).desiredCollection.idsInOrder.size();
  }

  private static boolean isActiveFrameSourceReady(InstanceState state) {
    return
      state.activeFrameGenerationId != null &&
      state.activeExecutionBatchId != null &&
      stringEquals(state.sourceReadyFrameGenerationId, state.activeFrameGenerationId) &&
      stringEquals(state.sourceReadyExecutionBatchId, state.activeExecutionBatchId);
  }

  private static boolean isActiveFrameLabelPlacementReady(InstanceState state) {
    DerivedFamilyState labelFamilyState = derivedFamilyState(state, state.labelSourceId);
    int labelCount = Math.max(
      state.lastLabelCount,
      Math.max(
        labelFamilyState.desiredCollection.idsInOrder.size(),
        labelFamilyState.collection.idsInOrder.size()
      )
    );
    if (labelCount <= 0) {
      return true;
    }
    LabelFamilyObservationState observation = labelFamilyState.labelObservation;
    return
      observation.observationEnabled &&
      observation.hasCommittedObservationForConfiguredRequest &&
      observation.lastEffectiveRenderedFeatureCount > 0;
  }

  private static String labelPlacementReadinessSummary(InstanceState state) {
    DerivedFamilyState labelFamilyState = derivedFamilyState(state, state.labelSourceId);
    LabelFamilyObservationState observation = labelFamilyState.labelObservation;
    int labelCount = Math.max(
      state.lastLabelCount,
      Math.max(
        labelFamilyState.desiredCollection.idsInOrder.size(),
        labelFamilyState.collection.idsInOrder.size()
      )
    );
    return
      "labels=" +
      labelCount +
      " observationEnabled=" +
      observation.observationEnabled +
      " hasCommittedObservation=" +
      observation.hasCommittedObservationForConfiguredRequest +
      " configuredResetRequest=" +
      (observation.configuredResetRequestKey != null ? observation.configuredResetRequestKey : "nil") +
      " visibleLabels=" +
      observation.lastVisibleLabelFeatureIds.size() +
      " settledVisibleLabels=" +
      labelFamilyState.settledVisibleFeatureIds.size() +
      " layerRendered=" +
      observation.lastLayerRenderedFeatureCount +
      " effectiveRendered=" +
      observation.lastEffectiveRenderedFeatureCount;
  }

  private void retryLabelObservationRefreshIfPlacementPending(String instanceId, double delayMs) {
    InstanceState state = instances.get(instanceId);
    if (state == null) {
      return;
    }
    if (isActiveFrameLabelPlacementReady(state)) {
      return;
    }
    LabelFamilyObservationState labelObservation =
      derivedFamilyState(state, state.labelSourceId).labelObservation;
    if (!labelObservation.observationEnabled) {
      return;
    }
    scheduleLabelObservationRefresh(instanceId, delayMs);
  }

  private void setLabelCollisionObstacleLayersVisible(
    boolean isVisible,
    InstanceState state,
    String instanceId,
    String reason
  ) {
    setLayerProperties(
      state,
      instanceId,
      reason,
      state.labelCollisionLayerIds,
      Collections.singletonList("visibility"),
      Value.valueOf(isVisible ? "visible" : "none"),
      "label_collision_obstacle_layer_visibility"
    );
  }

  private void setLayerProperties(
    InstanceState state,
    String instanceId,
    String reason,
    List<String> layerIds,
    List<String> properties,
    Value value,
    String errorPrefix
  ) {
    try {
      withStyle(state.mapTag, style -> {
        for (String layerId : layerIds) {
          for (String property : properties) {
            try {
              invokeSetStyleLayerProperty(style, layerId, property, value);
            } catch (Exception error) {
              emitError(
                instanceId,
                errorPrefix +
                "_failed reason=" +
                reason +
                " layer=" +
                layerId +
                " property=" +
                property +
                " error=" +
                (error.getMessage() != null ? error.getMessage() : "unknown")
              );
            }
          }
        }
      });
    } catch (Exception error) {
      emitError(
        instanceId,
        errorPrefix +
        "_map_unavailable reason=" +
        reason +
        " error=" +
        (error.getMessage() != null ? error.getMessage() : "unknown")
      );
    }
  }

  private void scheduleDeferredDismissSourceCleanup(
    String instanceId,
    String requestKey,
    String reason
  ) {
    Runnable pending = deferredDismissSourceCleanupRunnables.remove(instanceId);
    if (pending != null) {
      mainHandler.removeCallbacks(pending);
    }
    Runnable runnable = () -> {
      deferredDismissSourceCleanupRunnables.remove(instanceId);
      runDeferredDismissSourceCleanup(instanceId, requestKey, reason);
    };
    deferredDismissSourceCleanupRunnables.put(instanceId, runnable);
    mainHandler.postDelayed(runnable, DEFERRED_DISMISS_SOURCE_CLEANUP_DELAY_MS);
  }

  private void runDeferredDismissSourceCleanup(
    String instanceId,
    String requestKey,
    String reason
  ) {
    InstanceState state = instances.get(instanceId);
    if (state == null) {
      return;
    }
    if (state.lastDismissRequestKey != null && !stringEquals(state.lastDismissRequestKey, requestKey)) {
      return;
    }
    if (
      !VISUAL_SOURCE_HIDDEN.equals(state.visualSourceLifecycleState) ||
      !"idle".equals(state.currentPresentationRenderPhase) ||
      !state.keepSourcesHiddenUntilEnter ||
      state.currentPresentationOpacityTarget > 0.001d ||
      state.currentPresentationOpacityValue > 0.001d
    ) {
      emitVisualDiag(
        instanceId,
        "deferred_dismiss_source_cleanup_skipped reason=" +
        reason +
        " request=" +
        requestKey +
        " phase=" +
        state.currentPresentationRenderPhase +
        " lifecycle=" +
        state.visualSourceLifecycleState
      );
      return;
    }
    try {
      clearHiddenResidentSourceState(instanceId, state, reason);
    } catch (Exception error) {
      emitError(
        instanceId,
        "deferred_dismiss_source_cleanup_failed: " +
        (error.getMessage() != null ? error.getMessage() : "unknown")
      );
    }
  }

  private boolean shouldSuppressInteractions(InstanceState state) {
    return !"enabled".equals(state.interactionMode);
  }

  private boolean isVisualSourceInactiveOrDismissing(InstanceState state) {
    return
      state != null &&
      (
        VISUAL_SOURCE_DISMISSING.equals(state.visualSourceLifecycleState) ||
        VISUAL_SOURCE_HIDDEN.equals(state.visualSourceLifecycleState)
      );
  }

  private boolean isVisualSourceDismissing(InstanceState state) {
    return state != null && VISUAL_SOURCE_DISMISSING.equals(state.visualSourceLifecycleState);
  }

  private static boolean isSourceRecoveryActive(InstanceState state) {
    return state != null && (state.isAwaitingSourceRecovery || state.isReplayingSourceRecovery);
  }

  private static boolean isLivePinTransitionPhase(InstanceState state) {
    return
      state != null &&
      ("live".equals(state.lastPresentationBatchPhase) || "entering".equals(state.lastPresentationBatchPhase));
  }

  private void applyHighlightedMarkerState(InstanceState state) throws Exception {
    String instanceId = findInstanceIdForState(state);
    if (
      !ensureSourcesReady(
        state,
        instanceId,
        visualSourceIds(state),
        "apply_highlighted_marker_state",
        false
      )
    ) {
      if (instanceId != null) {
        instances.put(instanceId, state);
      }
      return;
    }
    RNMBXMapView mapView = resolveMapView(state.mapTag);
    if (mapView == null) {
      throw new IllegalStateException("Map view not found for react tag " + state.mapTag);
    }
    for (String sourceId : visualSourceIds(state)) {
      SourceState sourceState = mountedSourceState(state, sourceId);
      if (sourceState == null) {
        continue;
      }
      for (String featureId : sourceState.diffKeyById.keySet()) {
        String markerKey = sourceState.markerKeyByFeatureId.getOrDefault(featureId, featureId);
        Feature feature = derivedFamilyState(state, sourceId).collection.featureById.get(featureId);
        String featureRestaurantId = restaurantIdFromFeature(feature);
        boolean isHighlighted =
          state.highlightedMarkerKeys.contains(markerKey) ||
          (
            state.highlightedRestaurantId != null &&
            state.highlightedRestaurantId.equals(featureRestaurantId)
          );
        HashMap<String, Value> featureState = new HashMap<>();
        featureState.put("nativeHighlighted", Value.valueOf(isHighlighted ? 1 : 0));
        mapView
          .getMapboxMap()
          .setFeatureState(sourceId, null, featureId, Value.valueOf(featureState), result -> { });
      }
    }
  }

  private void applyPresentationOpacity(InstanceState state, double opacity) throws Exception {
    String instanceId = findInstanceIdForState(state);
    state.currentPresentationOpacityValue = opacity;
    if (
      !ensureSourcesReady(
        state,
        instanceId,
        visualSourceIds(state),
        "apply_presentation_opacity",
        false
      )
    ) {
      if (instanceId != null) {
        instances.put(instanceId, state);
      }
      return;
    }
    RNMBXMapView mapView = resolveMapView(state.mapTag);
    if (mapView == null) {
      throw new IllegalStateException("Map view not found for react tag " + state.mapTag);
    }

    HashMap<String, Value> featureState = new HashMap<>();
    featureState.put("nativePresentationOpacity", Value.valueOf(opacity));
    Value encodedState = Value.valueOf(featureState);
    for (String sourceId : visualSourceIds(state)) {
      DerivedFamilyState familyState = derivedFamilyState(state, sourceId);
      SourceState sourceState = familyState.sourceState;
      if (sourceState.featureIds.isEmpty()) {
        continue;
      }
      for (String featureId : sourceState.diffKeyById.keySet()) {
        mapView.getMapboxMap().setFeatureState(sourceId, null, featureId, encodedState, result -> { });
        applyRetainedFeatureStatePatch(
          sourceState,
          featureId,
          featureState
        );
      }
      refreshFeatureStateRevision(sourceState);
      familyState.sourceState = sourceState;
      if (state.derivedFamilyStates.containsKey(sourceId)) {
        derivedFamilyState(state, sourceId).sourceState = sourceState;
      }
    }
  }

  private void applyFeatureStates(
    InstanceState state,
    String sourceId,
    String previousFeatureStateRevision,
    String nextFeatureStateRevision,
    Set<String> changedFeatureStateIds,
    Map<String, HashMap<String, Value>> featureStateById,
    Map<String, HashMap<String, Value>> previousFeatureStateById
  ) throws Exception {
    if (previousFeatureStateRevision.equals(nextFeatureStateRevision)) {
      return;
    }
    if (changedFeatureStateIds.isEmpty()) {
      return;
    }
    RNMBXMapView mapView = resolveMapView(state.mapTag);
    if (mapView == null) {
      throw new IllegalStateException("Map view not found for react tag " + state.mapTag);
    }
    for (String featureId : changedFeatureStateIds) {
      HashMap<String, Value> featureState = featureStateById.get(featureId);
      HashMap<String, Value> previousFeatureState = previousFeatureStateById.get(featureId);
      if (previousFeatureState != null && !previousFeatureState.isEmpty()) {
        for (String removedKey : previousFeatureState.keySet()) {
          if (featureState != null && featureState.containsKey(removedKey)) {
            continue;
          }
          removeFeatureStateKey(mapView.getMapboxMap(), sourceId, featureId, removedKey);
        }
      }
      if (featureState == null || featureState.isEmpty()) {
        continue;
      }
      if (featureState.equals(previousFeatureStateById.get(featureId))) {
        continue;
      }
      mapView
        .getMapboxMap()
        .setFeatureState(sourceId, null, featureId, Value.valueOf(featureState), result -> { });
    }
  }

  private String findInstanceIdForState(InstanceState state) {
    for (Map.Entry<String, InstanceState> entry : instances.entrySet()) {
      if (entry.getValue() == state || entry.getValue().mapTag == state.mapTag) {
        return entry.getKey();
      }
    }
    return null;
  }

  private List<String> visualSourceIds(InstanceState state) {
    ArrayList<String> sourceIds = new ArrayList<>();
    sourceIds.addAll(state.pinSlotSourceIds);
    sourceIds.add(state.dotSourceId);
    return sourceIds;
  }

  private List<String> visualAndInteractionSourceIds(InstanceState state) {
    ArrayList<String> sourceIds = new ArrayList<>();
    sourceIds.addAll(state.pinSlotSourceIds);
    sourceIds.add(state.dotSourceId);
    return sourceIds;
  }

  private static WritableMap emptyRenderedLabelObservationResult() {
    WritableMap result = Arguments.createMap();
    result.putArray("visibleLabelFeatureIds", Arguments.createArray());
    result.putInt("layerRenderedFeatureCount", 0);
    result.putInt("effectiveRenderedFeatureCount", 0);
    return result;
  }

  private static com.facebook.react.bridge.WritableArray toWritableStringArray(List<String> values) {
    com.facebook.react.bridge.WritableArray array = Arguments.createArray();
    for (String value : values) {
      array.pushString(value);
    }
    return array;
  }

  private static LabelObservationResult buildRenderedLabelObservation(
    List<QueriedRenderedFeature> features,
    Set<String> requiredSourceIds
  ) {
    LabelObservationResult result = new LabelObservationResult();
    LinkedHashSet<String> visibleLabelFeatureIds = new LinkedHashSet<>();
    for (QueriedRenderedFeature queriedRenderedFeature : features) {
      if (
        queriedRenderedFeature == null ||
        queriedRenderedFeature.getQueriedFeature() == null ||
        !requiredSourceIds.contains(queriedRenderedFeature.getQueriedFeature().getSource())
      ) {
        continue;
      }
      Feature feature = queriedRenderedFeature.getQueriedFeature().getFeature();
      if (feature == null) {
        continue;
      }
      JsonObject properties = feature.properties();
      String featureId = feature.id();
      String markerKey =
        properties != null && properties.has("markerKey") && properties.get("markerKey").isJsonPrimitive()
          ? properties.get("markerKey").getAsString()
          : parseRenderedLabelMarkerKeyFromFeatureId(featureId);
      String candidate =
        properties != null && properties.has("labelCandidate") && properties.get("labelCandidate").isJsonPrimitive()
          ? normalizeRenderedLabelCandidate(properties.get("labelCandidate").getAsString())
          : parseRenderedLabelCandidateFromFeatureId(featureId);
      if (markerKey == null || markerKey.isEmpty() || candidate == null || candidate.isEmpty()) {
        continue;
      }
      String resolvedFeatureId =
        featureId != null && !featureId.isEmpty()
          ? featureId
          : buildRenderedLabelCandidateFeatureId(markerKey, candidate);
      visibleLabelFeatureIds.add(resolvedFeatureId);
    }
    ArrayList<String> sortedVisibleLabelFeatureIds = new ArrayList<>(visibleLabelFeatureIds);
    Collections.sort(sortedVisibleLabelFeatureIds);
    result.visibleLabelFeatureIds.addAll(sortedVisibleLabelFeatureIds);
    return result;
  }

  private WritableMap commitRenderedLabelObservation(
    String instanceId,
    LabelObservationResult observation,
    int layerRenderedFeatureCount,
    int effectiveRenderedFeatureCount,
    boolean commitVisibleLabelHits,
    String labelResetRequestKey
  ) {
    InstanceState mutableState = instances.get(instanceId);
    if (mutableState == null) {
      return emptyRenderedLabelObservationResult();
    }
    if (
      VISUAL_SOURCE_DISMISSING.equals(mutableState.visualSourceLifecycleState) ||
      VISUAL_SOURCE_HIDDEN.equals(mutableState.visualSourceLifecycleState)
    ) {
      return emptyRenderedLabelObservationResult();
    }
    DerivedFamilyState labelFamilyState = derivedFamilyState(mutableState, mutableState.labelSourceId);
    ArrayList<String> previousVisibleLabelFeatureIds =
      new ArrayList<>(labelFamilyState.labelObservation.lastVisibleLabelFeatureIds);
    if (!stringEquals(labelFamilyState.labelObservation.configuredResetRequestKey, labelResetRequestKey)) {
      return currentRenderedLabelObservationSnapshot(instanceId);
    }
    boolean shouldCommitVisibleLabelHits =
      commitVisibleLabelHits &&
      labelFamilyState.labelObservation.commitVisibleLabelHits &&
      labelFamilyState.labelObservation.observationEnabled;
    boolean didClearSettledVisibleLabelHits = false;
    if (shouldCommitVisibleLabelHits) {
      labelFamilyState.settledVisibleFeatureIds.clear();
      labelFamilyState.settledVisibleFeatureIds.addAll(observation.visibleLabelFeatureIds);
    } else if (!labelFamilyState.settledVisibleFeatureIds.isEmpty()) {
      labelFamilyState.settledVisibleFeatureIds.clear();
      didClearSettledVisibleLabelHits = true;
    }
    labelFamilyState.labelObservation.lastVisibleLabelFeatureIds.clear();
    labelFamilyState.labelObservation.lastVisibleLabelFeatureIds.addAll(observation.visibleLabelFeatureIds);
    labelFamilyState.labelObservation.lastLayerRenderedFeatureCount = layerRenderedFeatureCount;
    labelFamilyState.labelObservation.lastEffectiveRenderedFeatureCount =
      Math.max(effectiveRenderedFeatureCount, observation.visibleLabelFeatureIds.size());
    labelFamilyState.labelObservation.hasCommittedObservationForConfiguredRequest = true;
    instances.put(instanceId, mutableState);
    try {
      maybeElectMountedHiddenExecutionBatch(instanceId, mutableState);
      InstanceState readyState = instances.get(instanceId);
      if (readyState != null) {
        startEnterPresentationIfReady(instanceId, readyState, null, null);
      }
    } catch (Exception ignored) {
    }

    boolean didProduceMeaningfulChange =
      didClearSettledVisibleLabelHits ||
      !previousVisibleLabelFeatureIds.equals(observation.visibleLabelFeatureIds);
    if (mutableState.currentViewportIsMoving) {
      if (didProduceMeaningfulChange) {
        labelFamilyState.labelObservation.movingNoopRefreshStreak = 0;
        labelFamilyState.labelObservation.movingAdaptiveRefreshMs =
          labelFamilyState.labelObservation.refreshMsMoving;
      } else {
        labelFamilyState.labelObservation.movingNoopRefreshStreak += 1;
        labelFamilyState.labelObservation.movingAdaptiveRefreshMs =
          nextAdaptiveMovingLabelObservationDelay(
            labelFamilyState.labelObservation.refreshMsMoving,
            labelFamilyState.labelObservation.movingNoopRefreshStreak
          );
      }
    } else {
      labelFamilyState.labelObservation.movingNoopRefreshStreak = 0;
      labelFamilyState.labelObservation.movingAdaptiveRefreshMs =
        labelFamilyState.labelObservation.refreshMsMoving;
    }

    WritableMap result = emptyRenderedLabelObservationResult();
    result.putArray("visibleLabelFeatureIds", toWritableStringArray(observation.visibleLabelFeatureIds));
    result.putInt("layerRenderedFeatureCount", layerRenderedFeatureCount);
    result.putInt("effectiveRenderedFeatureCount", effectiveRenderedFeatureCount);
    return result;
  }

  private WritableMap currentRenderedLabelObservationSnapshot(String instanceId) {
    InstanceState state = instances.get(instanceId);
    if (state == null) {
      return emptyRenderedLabelObservationResult();
    }
    LabelFamilyObservationState labelObservation =
      derivedFamilyState(state, state.labelSourceId).labelObservation;
    WritableMap result = emptyRenderedLabelObservationResult();
    result.putArray(
      "visibleLabelFeatureIds",
      toWritableStringArray(labelObservation.lastVisibleLabelFeatureIds)
    );
    result.putInt("layerRenderedFeatureCount", labelObservation.lastLayerRenderedFeatureCount);
    result.putInt(
      "effectiveRenderedFeatureCount",
      labelObservation.lastEffectiveRenderedFeatureCount
    );
    return result;
  }

  private void configureLabelObservation(
    String instanceId,
    boolean observationEnabled,
    boolean commitVisibleLabelHits,
    double refreshMsIdle,
    double refreshMsMoving,
    String labelResetRequestKey
  ) {
    InstanceState state = instances.get(instanceId);
    if (state == null) {
      return;
    }
    DerivedFamilyState labelFamilyState = derivedFamilyState(state, state.labelSourceId);
    LabelFamilyObservationState labelObservation = labelFamilyState.labelObservation;
    labelObservation.observationEnabled = observationEnabled;
    labelObservation.commitVisibleLabelHits = commitVisibleLabelHits;
    labelObservation.refreshMsIdle = refreshMsIdle;
    labelObservation.refreshMsMoving = refreshMsMoving;
    if (!stringEquals(labelObservation.configuredResetRequestKey, labelResetRequestKey)) {
      labelObservation.hasCommittedObservationForConfiguredRequest = false;
    }
    labelObservation.configuredResetRequestKey = labelResetRequestKey;
    labelObservation.movingNoopRefreshStreak = 0;
    labelObservation.movingAdaptiveRefreshMs = refreshMsMoving;
    boolean shouldClearVisibleLabelHits =
      !observationEnabled || !commitVisibleLabelHits;
    boolean didClearVisibleLabelHits =
      shouldClearVisibleLabelHits &&
      !labelObservation.settledVisibleFeatureIds.isEmpty();
    if (didClearVisibleLabelHits) {
      labelObservation.settledVisibleFeatureIds.clear();
    }
    if (!observationEnabled) {
      labelObservation.isRefreshInFlight = false;
      labelObservation.queuedRefreshDelayMs = null;
      Runnable pending = labelObservationRefreshRunnables.remove(instanceId);
      if (pending != null) {
        mainHandler.removeCallbacks(pending);
      }
    }
    instances.put(instanceId, state);
    if (didClearVisibleLabelHits) {
      try {
        applyDesiredFrameSnapshots(instanceId, false);
      } catch (Exception ignored) {
      }
    }
    if (observationEnabled) {
      emitLabelObservationUpdated(instanceId, currentRenderedLabelObservationSnapshot(instanceId));
      scheduleLabelObservationRefresh(instanceId, 0d);
    } else {
      emitLabelObservationUpdated(instanceId, emptyRenderedLabelObservationResult());
    }
  }

  private static double nextAdaptiveMovingLabelObservationDelay(
    double baseRefreshMs,
    int noopRefreshStreak
  ) {
    double clampedBaseRefreshMs = Math.max(baseRefreshMs, 16d);
    if (noopRefreshStreak >= 6) {
      return Math.min(clampedBaseRefreshMs * 6d, 96d);
    }
    if (noopRefreshStreak >= 3) {
      return Math.min(clampedBaseRefreshMs * 3d, 64d);
    }
    if (noopRefreshStreak >= 1) {
      return Math.min(clampedBaseRefreshMs * 2d, 32d);
    }
    return clampedBaseRefreshMs;
  }

  private void scheduleLabelObservationRefresh(String instanceId, double delayMs) {
    InstanceState state = instances.get(instanceId);
    if (state == null) {
      return;
    }
    LabelFamilyObservationState labelObservation =
      derivedFamilyState(state, state.labelSourceId).labelObservation;
    if (!labelObservation.observationEnabled) {
      Runnable pending = labelObservationRefreshRunnables.remove(instanceId);
      if (pending != null) {
        mainHandler.removeCallbacks(pending);
      }
      return;
    }
    double normalizedDelayMs;
    if (state.currentViewportIsMoving && delayMs > 0d) {
      double adaptiveDelayMs =
        labelObservation.movingAdaptiveRefreshMs > 0d
          ? labelObservation.movingAdaptiveRefreshMs
          : labelObservation.refreshMsMoving;
      normalizedDelayMs = Math.max(delayMs, adaptiveDelayMs);
    } else {
      normalizedDelayMs = delayMs;
    }
    if (labelObservation.isRefreshInFlight) {
      labelObservation.queuedRefreshDelayMs =
        labelObservation.queuedRefreshDelayMs != null
          ? Math.min(labelObservation.queuedRefreshDelayMs, normalizedDelayMs)
          : normalizedDelayMs;
      instances.put(instanceId, state);
      return;
    }
    Runnable pending = labelObservationRefreshRunnables.remove(instanceId);
    if (pending != null) {
      mainHandler.removeCallbacks(pending);
    }
    Runnable runnable = () -> {
      labelObservationRefreshRunnables.remove(instanceId);
      performLabelObservationRefresh(instanceId);
    };
    labelObservationRefreshRunnables.put(instanceId, runnable);
    mainHandler.postDelayed(runnable, Math.max(0L, Math.round(normalizedDelayMs)));
  }

  private void completeLabelObservationRefresh(String instanceId) {
    InstanceState state = instances.get(instanceId);
    if (state == null) {
      return;
    }
    LabelFamilyObservationState labelObservation =
      derivedFamilyState(state, state.labelSourceId).labelObservation;
    labelObservation.isRefreshInFlight = false;
    Double nextDelayMs = labelObservation.queuedRefreshDelayMs;
    labelObservation.queuedRefreshDelayMs = null;
    instances.put(instanceId, state);
    if (nextDelayMs != null) {
      scheduleLabelObservationRefresh(instanceId, nextDelayMs);
    }
  }

  private void emitLabelObservationUpdated(String instanceId, WritableMap snapshot) {
    WritableMap event = toPublicLabelObservationEventPayload(snapshot);
    event.putString("type", "label_observation_updated");
    event.putString("instanceId", instanceId);
    emit(event);
  }

  private WritableMap toPublicLabelObservationEventPayload(WritableMap snapshot) {
    WritableMap event = Arguments.createMap();
    ReadableArray visibleLabelFeatureIds =
      snapshot != null ? snapshot.getArray("visibleLabelFeatureIds") : null;
    event.putArray(
      "visibleLabelFeatureIds",
      visibleLabelFeatureIds != null ? visibleLabelFeatureIds : Arguments.createArray()
    );
    event.putInt(
      "layerRenderedFeatureCount",
      snapshot != null && snapshot.hasKey("layerRenderedFeatureCount")
        ? snapshot.getInt("layerRenderedFeatureCount")
        : 0
    );
    event.putInt(
      "effectiveRenderedFeatureCount",
      snapshot != null && snapshot.hasKey("effectiveRenderedFeatureCount")
        ? snapshot.getInt("effectiveRenderedFeatureCount")
        : 0
    );
    return event;
  }

  private void performLabelObservationRefresh(String instanceId) {
    InstanceState state = instances.get(instanceId);
    if (state == null) {
      return;
    }
    LabelFamilyObservationState labelObservation =
      derivedFamilyState(state, state.labelSourceId).labelObservation;
    if (!labelObservation.observationEnabled) {
      return;
    }
    RNMBXMapView mapView = resolveMapView(state.mapTag);
    if (mapView == null) {
      return;
    }
    int width = mapView.getWidth();
    int height = mapView.getHeight();
    if (width <= 0 || height <= 0) {
      LabelObservationResult emptyObservation = new LabelObservationResult();
      WritableMap snapshot =
        commitRenderedLabelObservation(
          instanceId,
          emptyObservation,
          0,
          0,
          labelObservation.commitVisibleLabelHits,
          labelObservation.configuredResetRequestKey
        );
      emitLabelObservationUpdated(instanceId, snapshot);
      completeLabelObservationRefresh(instanceId);
      return;
    }

    labelObservation.isRefreshInFlight = true;
    labelObservation.queuedRefreshDelayMs = null;
    instances.put(instanceId, state);

    ScreenBox queryBox = new ScreenBox(
      new ScreenCoordinate(0d, 0d),
      new ScreenCoordinate((double) width, (double) height)
    );
    RenderedQueryGeometry queryGeometry = new RenderedQueryGeometry(queryBox);
    ArrayList<String> resolvedLayerIds = resolveRenderedQueryLayerIdsForSource(state);
    if (resolvedLayerIds.isEmpty()) {
      emitLabelObservationUpdated(instanceId, currentRenderedLabelObservationSnapshot(instanceId));
      completeLabelObservationRefresh(instanceId);
      return;
    }
    RenderedQueryOptions primaryOptions = new RenderedQueryOptions(resolvedLayerIds, null);
    mapView
      .getMapboxMap()
      .queryRenderedFeatures(
        queryGeometry,
        primaryOptions,
        primaryResult -> mainHandler.post(() -> {
          InstanceState latestState = instances.get(instanceId);
          if (latestState == null) {
            return;
          }
          LabelFamilyObservationState latestLabelObservation =
            derivedFamilyState(latestState, latestState.labelSourceId).labelObservation;
          if (primaryResult.isError()) {
            completeLabelObservationRefresh(instanceId);
            return;
          }
          List<QueriedRenderedFeature> primaryFeatures = primaryResult.getValue();
          LabelObservationResult primaryObservation =
            buildRenderedLabelObservation(primaryFeatures, new LinkedHashSet<>(latestState.pinSlotSourceIds));
          WritableMap snapshot =
            commitRenderedLabelObservation(
              instanceId,
              primaryObservation,
              primaryFeatures.size(),
              primaryFeatures.size(),
              latestLabelObservation.commitVisibleLabelHits,
              latestLabelObservation.configuredResetRequestKey
            );
          emitLabelObservationUpdated(instanceId, snapshot);
          completeLabelObservationRefresh(instanceId);
        })
      );
  }

  private static WritableMap buildRenderedPinPressTarget(
    List<QueriedRenderedFeature> features,
    Set<String> requiredSourceIds
  ) {
    WritableMap bestTarget = null;
    double bestLodZ = -Double.MAX_VALUE;
    double bestRank = Double.POSITIVE_INFINITY;
    int bestFeatureIndex = Integer.MAX_VALUE;
    for (int featureIndex = 0; featureIndex < features.size(); featureIndex += 1) {
      QueriedRenderedFeature queriedRenderedFeature = features.get(featureIndex);
      if (
        queriedRenderedFeature == null ||
        queriedRenderedFeature.getQueriedFeature() == null ||
        !requiredSourceIds.contains(queriedRenderedFeature.getQueriedFeature().getSource())
      ) {
        continue;
      }
      Feature feature = queriedRenderedFeature.getQueriedFeature().getFeature();
      if (feature == null) {
        continue;
      }
      JsonObject properties = feature.properties();
      if (
        properties == null ||
        !properties.has("restaurantId") ||
        !properties.get("restaurantId").isJsonPrimitive()
      ) {
        continue;
      }
      String restaurantId = properties.get("restaurantId").getAsString();
      if (restaurantId == null || restaurantId.isEmpty()) {
        continue;
      }
      double lodZ =
        properties.has("nativeLodZ") && properties.get("nativeLodZ").isJsonPrimitive()
          ? properties.get("nativeLodZ").getAsDouble()
          : (
            properties.has("lodZ") && properties.get("lodZ").isJsonPrimitive()
              ? properties.get("lodZ").getAsDouble()
              : -Double.MAX_VALUE
          );
      double rank =
        properties.has("rank") && properties.get("rank").isJsonPrimitive()
          ? properties.get("rank").getAsDouble()
          : Double.POSITIVE_INFINITY;
      if (
        bestTarget != null &&
        (lodZ < bestLodZ ||
          (lodZ == bestLodZ && rank > bestRank) ||
          (lodZ == bestLodZ && rank == bestRank && featureIndex > bestFeatureIndex))
      ) {
        continue;
      }
      WritableMap target = Arguments.createMap();
      target.putString("restaurantId", restaurantId);
      if (feature.geometry() instanceof Point) {
        Point point = (Point) feature.geometry();
        WritableMap coordinate = Arguments.createMap();
        coordinate.putDouble("lng", point.longitude());
        coordinate.putDouble("lat", point.latitude());
        target.putMap("coordinate", coordinate);
      } else {
        target.putNull("coordinate");
      }
      target.putString("targetKind", "pin");
      bestTarget = target;
      bestLodZ = lodZ;
      bestRank = rank;
      bestFeatureIndex = featureIndex;
    }
    return bestTarget;
  }

  private static WritableMap buildRenderedDotPressTarget(
    List<QueriedRenderedFeature> features,
    String requiredSourceId,
    Double tapLng,
    Double tapLat
  ) {
    WritableMap bestTarget = null;
    double bestDistance = Double.POSITIVE_INFINITY;
    int bestFeatureIndex = Integer.MAX_VALUE;
    for (int featureIndex = 0; featureIndex < features.size(); featureIndex += 1) {
      QueriedRenderedFeature queriedRenderedFeature = features.get(featureIndex);
      if (
        queriedRenderedFeature == null ||
        queriedRenderedFeature.getQueriedFeature() == null ||
        !stringEquals(requiredSourceId, queriedRenderedFeature.getQueriedFeature().getSource())
      ) {
        continue;
      }
      Feature feature = queriedRenderedFeature.getQueriedFeature().getFeature();
      if (feature == null) {
        continue;
      }
      JsonObject properties = feature.properties();
      if (
        properties == null ||
        !properties.has("restaurantId") ||
        !properties.get("restaurantId").isJsonPrimitive()
      ) {
        continue;
      }
      String restaurantId = properties.get("restaurantId").getAsString();
      if (restaurantId == null || restaurantId.isEmpty()) {
        continue;
      }

      double distance = (double) featureIndex;
      WritableMap coordinate = null;
      if (feature.geometry() instanceof Point) {
        Point point = (Point) feature.geometry();
        coordinate = Arguments.createMap();
        coordinate.putDouble("lng", point.longitude());
        coordinate.putDouble("lat", point.latitude());
        if (tapLng != null && tapLat != null) {
          double dx = tapLng.doubleValue() - point.longitude();
          double dy = tapLat.doubleValue() - point.latitude();
          distance = dx * dx + dy * dy;
        }
      }
      if (
        bestTarget != null &&
        (distance > bestDistance || (distance == bestDistance && featureIndex > bestFeatureIndex))
      ) {
        continue;
      }
      WritableMap target = Arguments.createMap();
      target.putString("restaurantId", restaurantId);
      if (coordinate != null) {
        target.putMap("coordinate", coordinate);
      } else {
        target.putNull("coordinate");
      }
      target.putString("targetKind", "dot");
      bestTarget = target;
      bestDistance = distance;
      bestFeatureIndex = featureIndex;
    }
    return bestTarget;
  }

  private static LabelTapHitboxConfig parseLabelTapHitboxConfig(ReadableMap payload) {
    if (payload == null) {
      return null;
    }
    String[] requiredKeys = new String[] {
      "textSize",
      "radialXEm",
      "radialYEm",
      "radialTopEm",
      "upShiftEm",
      "charWidthFactor",
      "lineHeightFactor",
      "paddingPx",
      "minWidthPx",
      "maxWidthPx",
    };
    for (String key : requiredKeys) {
      if (!payload.hasKey(key) || payload.isNull(key)) {
        return null;
      }
    }
    return new LabelTapHitboxConfig(
      payload.getDouble("textSize"),
      payload.getDouble("radialXEm"),
      payload.getDouble("radialYEm"),
      payload.getDouble("radialTopEm"),
      payload.getDouble("upShiftEm"),
      payload.getDouble("charWidthFactor"),
      payload.getDouble("lineHeightFactor"),
      payload.getDouble("paddingPx"),
      payload.getDouble("minWidthPx"),
      payload.getDouble("maxWidthPx")
    );
  }

  private static ArrayList<String> parseStringArray(ReadableMap payload, String key) {
    ArrayList<String> values = new ArrayList<>();
    if (payload == null || !payload.hasKey(key) || payload.isNull(key)) {
      return values;
    }
    ReadableArray readableArray = payload.getArray(key);
    if (readableArray == null) {
      return values;
    }
    for (int index = 0; index < readableArray.size(); index += 1) {
      if (readableArray.isNull(index)) {
        continue;
      }
      String value = readableArray.getString(index);
      if (value != null && !value.isEmpty()) {
        values.add(value);
      }
    }
    return values;
  }

  private static Set<String> parseStringSet(ReadableMap payload, String key) {
    return new LinkedHashSet<>(parseStringArray(payload, key));
  }

  private static String restaurantIdFromFeature(Feature feature) {
    if (feature == null) {
      return null;
    }
    JsonObject properties = feature.properties();
    if (properties == null || !properties.has("restaurantId")) {
      return null;
    }
    JsonElement value = properties.get("restaurantId");
    if (value == null || !value.isJsonPrimitive()) {
      return null;
    }
    String restaurantId = value.getAsString();
    return restaurantId != null && !restaurantId.isEmpty() ? restaurantId : null;
  }

  private static boolean isRenderedLabelPressFeatureIntentional(
    Feature feature,
    RNMBXMapView mapView,
    double tapX,
    double tapY,
    LabelTapHitboxConfig hitbox
  ) {
    if (hitbox == null) {
      return false;
    }
    if (!(feature.geometry() instanceof Point)) {
      return false;
    }
    JsonObject properties = feature.properties();
    if (properties == null) {
      return false;
    }
    String candidate = null;
    if (
      properties.has("labelCandidate") &&
      properties.get("labelCandidate").isJsonPrimitive()
    ) {
      candidate = properties.get("labelCandidate").getAsString();
    }
    if (candidate == null || candidate.isEmpty()) {
      return false;
    }
    String labelText = null;
    if (
      properties.has("restaurantName") &&
      properties.get("restaurantName").isJsonPrimitive()
    ) {
      labelText = properties.get("restaurantName").getAsString();
    }
    if (labelText == null || labelText.isEmpty()) {
      return false;
    }

    String[] lines = labelText.split("\\n", -1);
    int longestLineLength = 0;
    for (String line : lines) {
      longestLineLength = Math.max(longestLineLength, line.length());
    }
    double estimatedWidth = Math.min(
      Math.max(longestLineLength * hitbox.textSize * hitbox.charWidthFactor + 10d, hitbox.minWidthPx),
      hitbox.maxWidthPx
    );
    double estimatedHeight = Math.max(lines.length, 1) * hitbox.textSize * hitbox.lineHeightFactor + 4d;

    double offsetXPx = 0d;
    double offsetYPx = 0d;
    if ("bottom".equals(candidate)) {
      offsetYPx = (hitbox.radialYEm - hitbox.upShiftEm) * hitbox.textSize;
    } else if ("right".equals(candidate)) {
      offsetXPx = hitbox.radialXEm * hitbox.textSize;
      offsetYPx = -hitbox.upShiftEm * hitbox.textSize;
    } else if ("top".equals(candidate)) {
      offsetYPx = -(hitbox.radialTopEm + hitbox.upShiftEm) * hitbox.textSize;
    } else if ("left".equals(candidate)) {
      offsetXPx = -hitbox.radialXEm * hitbox.textSize;
      offsetYPx = -hitbox.upShiftEm * hitbox.textSize;
    } else {
      return false;
    }

    Point point = (Point) feature.geometry();
    ScreenCoordinate anchorPoint = mapView
      .getMapboxMap()
      .pixelForCoordinate(Point.fromLngLat(point.longitude(), point.latitude()));
    double anchorX = anchorPoint.getX() + offsetXPx;
    double anchorY = anchorPoint.getY() + offsetYPx;

    double left = anchorX - estimatedWidth / 2d;
    double right = anchorX + estimatedWidth / 2d;
    double top = anchorY - estimatedHeight / 2d;
    double bottom = anchorY + estimatedHeight / 2d;

    if ("bottom".equals(candidate)) {
      top = anchorY;
      bottom = anchorY + estimatedHeight;
    } else if ("top".equals(candidate)) {
      top = anchorY - estimatedHeight;
      bottom = anchorY;
    } else if ("left".equals(candidate)) {
      left = anchorX - estimatedWidth;
      right = anchorX;
    } else if ("right".equals(candidate)) {
      left = anchorX;
      right = anchorX + estimatedWidth;
    }

    return tapX >= left - hitbox.paddingPx &&
      tapX <= right + hitbox.paddingPx &&
      tapY >= top - hitbox.paddingPx &&
      tapY <= bottom + hitbox.paddingPx;
  }

  private static WritableMap buildRenderedLabelPressTarget(
    List<QueriedRenderedFeature> features,
    Set<String> requiredSourceIds,
    RNMBXMapView mapView,
    double tapX,
    double tapY,
    LabelTapHitboxConfig labelTapHitbox
  ) {
    for (QueriedRenderedFeature queriedRenderedFeature : features) {
      if (
        queriedRenderedFeature == null ||
        queriedRenderedFeature.getQueriedFeature() == null ||
        !requiredSourceIds.contains(queriedRenderedFeature.getQueriedFeature().getSource())
      ) {
        continue;
      }
      Feature feature = queriedRenderedFeature.getQueriedFeature().getFeature();
      if (feature == null) {
        continue;
      }
      JsonObject properties = feature.properties();
      if (
        properties == null ||
        !properties.has("restaurantId") ||
        !properties.get("restaurantId").isJsonPrimitive()
      ) {
        continue;
      }
      String restaurantId = properties.get("restaurantId").getAsString();
      if (restaurantId == null || restaurantId.isEmpty()) {
        continue;
      }
      if (
        !isRenderedLabelPressFeatureIntentional(
          feature,
          mapView,
          tapX,
          tapY,
          labelTapHitbox
        )
      ) {
        continue;
      }
      WritableMap target = Arguments.createMap();
      target.putString("restaurantId", restaurantId);
      if (feature.geometry() instanceof Point) {
        Point point = (Point) feature.geometry();
        WritableMap coordinate = Arguments.createMap();
        coordinate.putDouble("lng", point.longitude());
        coordinate.putDouble("lat", point.latitude());
        target.putMap("coordinate", coordinate);
      } else {
        target.putNull("coordinate");
      }
      target.putString("targetKind", "label");
      return target;
    }
    return null;
  }

  private ArrayList<String> resolveRenderedQueryLayerIdsForSource(InstanceState state) {
    return new ArrayList<>(state.labelLayerIds);
  }

  private static String normalizeRenderedLabelCandidate(String value) {
    if (
      "bottom".equals(value) ||
      "right".equals(value) ||
      "top".equals(value) ||
      "left".equals(value)
    ) {
      return value;
    }
    return null;
  }

  private static String parseRenderedLabelMarkerKeyFromFeatureId(String featureId) {
    if (featureId == null) {
      return null;
    }
    int delimiterIndex = featureId.lastIndexOf("::label::");
    if (delimiterIndex <= 0) {
      return null;
    }
    return featureId.substring(0, delimiterIndex);
  }

  private static String parseRenderedLabelCandidateFromFeatureId(String featureId) {
    if (featureId == null) {
      return null;
    }
    int delimiterIndex = featureId.lastIndexOf("::label::");
    if (delimiterIndex <= 0) {
      return null;
    }
    return normalizeRenderedLabelCandidate(featureId.substring(delimiterIndex + "::label::".length()));
  }

  private static String buildRenderedLabelCandidateFeatureId(String markerKey, String candidate) {
    return markerKey + "::label::" + candidate;
  }

  private List<String> managedSourceIds(InstanceState state) {
    return visualAndInteractionSourceIds(state);
  }

  private static String sourceRevisionForSyncedFrame(InstanceState state, String sourceId) {
    if (
      VISUAL_SOURCE_HIDDEN.equals(state.visualSourceLifecycleState) &&
      state.residentDesiredSourceCacheBySourceId.containsKey(sourceId)
    ) {
      return state.residentDesiredSourceCacheBySourceId.get(sourceId).sourceRevision;
    }
    SourceState sourceState = mountedSourceState(state, sourceId);
    return sourceState != null ? sourceState.sourceRevision : "";
  }

  private List<String> sourceIdsFromSnapshots(String[][] snapshots) {
    ArrayList<String> sourceIds = new ArrayList<>();
    for (String[] snapshot : snapshots) {
      if (snapshot.length > 0) {
        sourceIds.add(snapshot[0]);
      }
    }
    return sourceIds;
  }

  private boolean ensureSourcesReady(
    InstanceState state,
    String instanceId,
    List<String> sourceIds,
    String reason,
    boolean allowRecoveryEscalation
  ) throws Exception {
    ArrayList<String> uniqueSourceIds = new ArrayList<>(new LinkedHashSet<>(sourceIds));
    if (uniqueSourceIds.isEmpty()) {
      return true;
    }
    boolean arePresent = withStyleResult(state.mapTag, style -> {
      for (String sourceId : uniqueSourceIds) {
        if (!styleHasSource(style, sourceId)) {
          return false;
        }
      }
      return true;
    });
    if (arePresent) {
      return true;
    }
    if (!allowRecoveryEscalation && !state.isAwaitingSourceRecovery) {
      emitError(
        "__native_diag__",
        "source_ready_skip reason=" +
        reason +
        " mapTag=" +
        state.mapTag +
        " sources=" +
        String.join(",", uniqueSourceIds)
      );
      return false;
    }
    state.isAwaitingSourceRecovery = true;
    if (state.sourceRecoveryPausedAtMs == null) {
      state.sourceRecoveryPausedAtMs = nowMs();
    }
    if (instanceId != null) {
      instances.put(instanceId, state);
      scheduleSourceRecoveryReplay(instanceId, reason, 0);
    }
    return false;
  }

  private void scheduleSourceRecoveryReplay(String instanceId, String reason, int attempt) {
    if (sourceRecoveryRunnables.containsKey(instanceId)) {
      return;
    }
    Runnable runnable = new Runnable() {
      @Override
      public void run() {
        sourceRecoveryRunnables.remove(instanceId);
        InstanceState state = instances.get(instanceId);
        if (state == null) {
          return;
        }
        try {
          if (
            !ensureSourcesReady(
              state,
              instanceId,
              managedSourceIds(state),
              "source_recovery_wait",
              true
            )
          ) {
            if (attempt < 120) {
              scheduleSourceRecoveryReplay(instanceId, reason, attempt + 1);
            }
            return;
          }
          if (state.sourceRecoveryPausedAtMs != null) {
            double deltaMs = Math.max(0d, nowMs() - state.sourceRecoveryPausedAtMs);
            if (deltaMs > 0d) {
              DerivedFamilyState pinFamilyState = derivedFamilyState(state, state.pinSourceId);
              for (LivePinTransition transition : pinFamilyState.livePinTransitionsByMarkerKey.values()) {
                if (!transition.isAwaitingSourceCommit) {
                  transition.startedAtMs += deltaMs;
                }
              }
            }
          }
          state.isAwaitingSourceRecovery = false;
          state.sourceRecoveryPausedAtMs = null;
          instances.put(instanceId, state);
          applyDesiredFrameSnapshots(instanceId);
          InstanceState updatedState = instances.get(instanceId);
          if (updatedState != null) {
            applyHighlightedMarkerState(updatedState);
            if (shouldSuppressInteractions(updatedState)) {
              applyInteractionSuppression(updatedState);
            }
            applyPresentationOpacity(updatedState, updatedState.currentPresentationOpacityTarget);
            promoteBlockedCommitFencesIfReady(instanceId, updatedState);
            updatedState.isAwaitingSourceRecovery = false;
            updatedState.isOwnerInvalidated = false;
            updatedState.sourceRecoveryPausedAtMs = null;
            instances.put(instanceId, updatedState);
            WritableMap recoveredEvent = Arguments.createMap();
            recoveredEvent.putString("type", "render_owner_recovered_after_style_reload");
            recoveredEvent.putString("instanceId", instanceId);
            recoveredEvent.putString("frameGenerationId", updatedState.activeFrameGenerationId);
            recoveredEvent.putInt("ownerEpoch", updatedState.ownerEpoch);
            recoveredEvent.putDouble("recoveredAtMs", nowMs());
            emit(recoveredEvent);
          }
        } catch (Exception error) {
          if (attempt < 120) {
            scheduleSourceRecoveryReplay(instanceId, reason, attempt + 1);
          } else {
            emitError(
              instanceId,
              error.getMessage() != null ? error.getMessage() : "style reload replay failed"
            );
          }
        }
      }
    };
    sourceRecoveryRunnables.put(instanceId, runnable);
    mainHandler.postDelayed(runnable, SOURCE_RECOVERY_RETRY_DELAY_MS);
  }

  private void withStyle(int mapTag, StyleOperation operation) throws Exception {
    RNMBXMapView mapView = resolveMapView(mapTag);
    if (mapView == null) {
      throw new IllegalStateException("Map view not found for react tag " + mapTag);
    }

    final Exception[] capturedError = new Exception[1];
    final boolean[] completed = new boolean[] { false };
    mapView.getMapboxMap().getStyle(style -> {
      try {
        operation.run(style);
      } catch (Exception error) {
        capturedError[0] = error;
      } finally {
        completed[0] = true;
      }
    });
    if (capturedError[0] != null) {
      throw capturedError[0];
    }
    if (!completed[0]) {
      throw new IllegalStateException("Map style was not available for react tag " + mapTag);
    }
  }

  private <T> T withStyleResult(int mapTag, StyleResultOperation<T> operation) throws Exception {
    final Object[] result = new Object[1];
    withStyle(mapTag, style -> result[0] = operation.run(style));
    @SuppressWarnings("unchecked")
    T typedResult = (T) result[0];
    return typedResult;
  }

  private boolean styleHasSource(Style style, String sourceId) {
    for (String methodName : new String[] { "styleSourceExists", "sourceExists" }) {
      try {
        Method method = style.getClass().getMethod(methodName, String.class);
        Object value = method.invoke(style, sourceId);
        if (value instanceof Boolean) {
          return (Boolean) value;
        }
      } catch (Exception ignored) {
        // Try the next known API shape.
      }
    }
    for (String methodName : new String[] { "getStyleSource", "getSource" }) {
      try {
        Method method = style.getClass().getMethod(methodName, String.class);
        return method.invoke(style, sourceId) != null;
      } catch (Exception ignored) {
        // Try the next known API shape.
      }
    }
    return false;
  }

  private RNMBXMapView resolveMapView(int mapTag) {
    ReactApplicationContext reactContext = getReactApplicationContext();
    UIManager defaultManager = UIManagerHelper.getUIManager(reactContext, UIManagerType.DEFAULT);
    if (defaultManager != null) {
      View resolved = defaultManager.resolveView(mapTag);
      if (resolved instanceof RNMBXMapView) {
        return (RNMBXMapView) resolved;
      }
    }
    UIManager fabricManager = UIManagerHelper.getUIManager(reactContext, UIManagerType.FABRIC);
    if (fabricManager != null) {
      View resolved = fabricManager.resolveView(mapTag);
      if (resolved instanceof RNMBXMapView) {
        return (RNMBXMapView) resolved;
      }
    }
    return null;
  }

  private void ensureMapSubscriptions(InstanceState state) {
    String mapKey = Integer.toString(state.mapTag);
    RNMBXMapView mapView = resolveMapView(state.mapTag);
    if (mapView == null) {
      throw new IllegalStateException("Map view not found for react tag " + state.mapTag);
    }
    if (!sourceDataLoadedSubscriptions.containsKey(mapKey)) {
      Cancelable cancelable =
        mapView.getMapboxMap().subscribeSourceDataLoaded(
          new SourceDataLoadedCallback() {
            @Override
            public void run(SourceDataLoaded event) {
              mainHandler.post(() -> handleSourceDataLoaded(state.mapTag, event));
            }
          }
        );
      sourceDataLoadedSubscriptions.put(mapKey, cancelable);
    }
    if (!styleLoadedSubscriptions.containsKey(mapKey)) {
      Cancelable cancelable =
        mapView
          .getMapboxMap()
          .subscribeStyleLoaded((StyleLoadedCallback) event -> mainHandler.post(() -> handleStyleLoaded(state.mapTag)));
      styleLoadedSubscriptions.put(mapKey, cancelable);
    }
    if (!cameraChangedSubscriptions.containsKey(mapKey)) {
      Cancelable cancelable =
        mapView
          .getMapboxMap()
          .subscribeCameraChanged(
            new CameraChangedCallback() {
              @Override
              public void run(@NonNull CameraChanged event) {
                mainHandler.post(() -> handleNativeCameraChanged(state.mapTag, true));
              }
            }
          );
      cameraChangedSubscriptions.put(mapKey, cancelable);
    }
    if (!mapIdleListeners.containsKey(mapKey)) {
      OnMapIdleListener listener =
        eventData -> mainHandler.post(() -> handleNativeCameraChanged(state.mapTag, false));
      mapView.getMapboxMap().addOnMapIdleListener(listener);
      mapIdleListeners.put(mapKey, listener);
    }
    if (!nativePressTouchListeners.containsKey(mapKey)) {
      View.OnTouchListener listener = (view, motionEvent) -> {
        handleNativePressTouch(state.mapTag, motionEvent);
        return false;
      };
      mapView.setOnTouchListener(listener);
      nativePressTouchListeners.put(mapKey, listener);
    }
  }

  private void cleanupMapSubscriptionsIfUnused(int mapTag) {
    for (InstanceState state : instances.values()) {
      if (state.mapTag == mapTag) {
        return;
      }
    }
    String mapKey = Integer.toString(mapTag);
    Cancelable sourceCancelable = sourceDataLoadedSubscriptions.remove(mapKey);
    if (sourceCancelable != null) {
      sourceCancelable.cancel();
    }
    Cancelable styleCancelable = styleLoadedSubscriptions.remove(mapKey);
    if (styleCancelable != null) {
      styleCancelable.cancel();
    }
    Cancelable cameraCancelable = cameraChangedSubscriptions.remove(mapKey);
    if (cameraCancelable != null) {
      cameraCancelable.cancel();
    }
    OnMapIdleListener mapIdleListener = mapIdleListeners.remove(mapKey);
    View.OnTouchListener nativePressTouchListener = nativePressTouchListeners.remove(mapKey);
    RNMBXMapView mapView = resolveMapView(mapTag);
    if (mapView != null) {
      if (mapIdleListener != null) {
        mapView.getMapboxMap().removeOnMapIdleListener(mapIdleListener);
      }
      if (nativePressTouchListener != null) {
        mapView.setOnTouchListener(null);
      }
    }
    nativePressSessions.remove(mapKey);
    nativePressSequences.remove(mapKey);
    lastNativeCameraDiagSignatureByMapKey.remove(mapKey);
    lastNativeCameraDiagAtMsByMapKey.remove(mapKey);
  }

  private boolean readMapGestureActive(RNMBXMapView mapView) {
    for (String fieldName : new String[] { "isGestureActive", "wasGestureActive" }) {
      try {
        Field field = RNMBXMapView.class.getDeclaredField(fieldName);
        field.setAccessible(true);
        Object value = field.get(mapView);
        if (value instanceof Boolean) {
          return (Boolean) value;
        }
      } catch (NoSuchFieldException | IllegalAccessException ignored) {
        // Fall through to the next known field name.
      }
    }
    return false;
  }

  private void handleNativePressTouch(int mapTag, MotionEvent event) {
    if (event == null) {
      return;
    }
    String mapKey = Integer.toString(mapTag);
    int action = event.getActionMasked();
    if (action == MotionEvent.ACTION_DOWN) {
      handleNativePressBegan(mapTag, event.getX(), event.getY());
      return;
    }
    if (action == MotionEvent.ACTION_POINTER_DOWN || action == MotionEvent.ACTION_CANCEL) {
      nativePressSessions.remove(mapKey);
      return;
    }
    if (action == MotionEvent.ACTION_MOVE) {
      handleNativePressMoved(mapTag, event.getX(), event.getY());
      return;
    }
    if (action == MotionEvent.ACTION_UP) {
      handleNativePressEnded(mapTag, event.getX(), event.getY());
    }
  }

  private void handleNativePressBegan(int mapTag, double x, double y) {
    String mapKey = Integer.toString(mapTag);
    NativePressContext context = activeNativePressContext(mapTag);
    if (context == null) {
      nativePressSessions.remove(mapKey);
      return;
    }
    int sequence = nativePressSequences.containsKey(mapKey) ? nativePressSequences.get(mapKey) + 1 : 1;
    nativePressSequences.put(mapKey, sequence);
    NativePressSession session = new NativePressSession(
      sequence,
      context.instanceId,
      nowMs(),
      x,
      y
    );
    nativePressSessions.put(mapKey, session);

    RNMBXMapView mapView = resolveMapView(mapTag);
    if (mapView == null) {
      nativePressSessions.remove(mapKey);
      return;
    }
    Point tapCoordinate = null;
    try {
      tapCoordinate = mapView.getMapboxMap().coordinateForPixel(new ScreenCoordinate(x, y));
    } catch (Exception ignored) {
      tapCoordinate = null;
    }
    double dotRadius = Math.max(0d, context.config.dotTapIntentRadiusPx);
    double[] dotQueryBox =
      dotRadius > 0d
        ? new double[] { x - dotRadius, y - dotRadius, x + dotRadius, y + dotRadius }
        : null;
    Double tapLng = tapCoordinate != null ? tapCoordinate.longitude() : null;
    Double tapLat = tapCoordinate != null ? tapCoordinate.latitude() : null;

    resolveRenderedPressTarget(
      mapView,
      context.state,
      context.config.pinLayerIds,
      context.config.labelLayerIds,
      context.config.dotLayerIds,
      x,
      y,
      dotQueryBox,
      tapLng,
      tapLat,
      context.config.labelTapHitbox,
      new PressTargetResolutionCallback() {
        @Override
        public void resolve(WritableMap target) {
          NativePressSession latestSession = nativePressSessions.get(mapKey);
          InstanceState latestState = instances.get(context.instanceId);
          if (
            latestSession == null ||
            latestSession.sequence != sequence ||
            latestSession.didCancel ||
            latestState == null ||
            isNativePressSuppressed(latestState)
          ) {
            return;
          }
          latestSession.resolvedTarget = target;
          latestSession.didResolve = true;
          nativePressSessions.put(mapKey, latestSession);
          if (latestSession.didRelease) {
            emitNativePressResolution(mapTag, latestSession);
          }
        }

        @Override
        public void reject(String code, String message, Throwable error) {
          emitError(
            context.instanceId,
            "native_press_target_resolution_failed: " + (message != null ? message : code)
          );
          nativePressSessions.remove(mapKey);
        }
      }
    );
  }

  private void handleNativePressMoved(int mapTag, double x, double y) {
    String mapKey = Integer.toString(mapTag);
    NativePressSession session = nativePressSessions.get(mapKey);
    if (session == null) {
      return;
    }
    InstanceState state = instances.get(session.instanceId);
    if (state == null || isNativePressSuppressed(state)) {
      nativePressSessions.remove(mapKey);
      return;
    }
    session.latestX = x;
    session.latestY = y;
    double dx = x - session.startX;
    double dy = y - session.startY;
    if (Math.hypot(dx, dy) > NATIVE_PRESS_CANCEL_MOVEMENT_THRESHOLD_PX) {
      session.didCancel = true;
      nativePressSessions.remove(mapKey);
      return;
    }
    nativePressSessions.put(mapKey, session);
  }

  private void handleNativePressEnded(int mapTag, double x, double y) {
    String mapKey = Integer.toString(mapTag);
    NativePressSession session = nativePressSessions.get(mapKey);
    if (session == null) {
      return;
    }
    InstanceState state = instances.get(session.instanceId);
    if (state == null || isNativePressSuppressed(state)) {
      nativePressSessions.remove(mapKey);
      return;
    }
    session.latestX = x;
    session.latestY = y;
    double dx = x - session.startX;
    double dy = y - session.startY;
    if (Math.hypot(dx, dy) > NATIVE_PRESS_CANCEL_MOVEMENT_THRESHOLD_PX) {
      nativePressSessions.remove(mapKey);
      return;
    }
    session.didRelease = true;
    nativePressSessions.put(mapKey, session);
    if (session.didResolve) {
      emitNativePressResolution(mapTag, session);
    }
  }

  private NativePressContext activeNativePressContext(int mapTag) {
    ArrayList<String> instanceIds = new ArrayList<>(instances.keySet());
    Collections.sort(instanceIds);
    for (String instanceId : instanceIds) {
      InstanceState state = instances.get(instanceId);
      if (
        state == null ||
        state.mapTag != mapTag ||
        state.nativePressTargetConfig == null ||
        !state.nativePressTargetConfig.enabled ||
        !"enabled".equals(state.interactionMode) ||
        isNativePressSuppressed(state)
      ) {
        continue;
      }
      return new NativePressContext(instanceId, state, state.nativePressTargetConfig);
    }
    return null;
  }

  private boolean isNativePressSuppressed(InstanceState state) {
    return
      state == null ||
      VISUAL_SOURCE_DISMISSING.equals(state.visualSourceLifecycleState) ||
      VISUAL_SOURCE_HIDDEN.equals(state.visualSourceLifecycleState);
  }

  private void emitNativePressResolution(int mapTag, NativePressSession session) {
    String mapKey = Integer.toString(mapTag);
    NativePressSession activeSession = nativePressSessions.get(mapKey);
    if (activeSession == null || activeSession.sequence != session.sequence) {
      return;
    }
    nativePressSessions.remove(mapKey);
    InstanceState state = instances.get(session.instanceId);
    if (
      state == null ||
      state.mapTag != mapTag ||
      state.nativePressTargetConfig == null ||
      !state.nativePressTargetConfig.enabled ||
      !"enabled".equals(state.interactionMode) ||
      isNativePressSuppressed(state)
    ) {
      return;
    }
    WritableMap point = Arguments.createMap();
    point.putDouble("x", session.startX);
    point.putDouble("y", session.startY);

    WritableMap pressCoordinateMap = null;
    RNMBXMapView mapView = resolveMapView(mapTag);
    if (mapView != null) {
      try {
        Point pressCoordinate = mapView
          .getMapboxMap()
          .coordinateForPixel(new ScreenCoordinate(session.startX, session.startY));
        pressCoordinateMap = Arguments.createMap();
        pressCoordinateMap.putDouble("lng", pressCoordinate.longitude());
        pressCoordinateMap.putDouble("lat", pressCoordinate.latitude());
      } catch (Exception ignored) {
        pressCoordinateMap = null;
      }
    }

    WritableMap event = Arguments.createMap();
    event.putString("type", "native_press_target_resolved");
    event.putString("instanceId", session.instanceId);
    event.putInt("sequence", session.sequence);
    if (session.resolvedTarget != null) {
      event.putMap("target", session.resolvedTarget);
    } else {
      event.putNull("target");
    }
    event.putMap("point", point);
    if (pressCoordinateMap != null) {
      event.putMap("pressCoordinate", pressCoordinateMap);
    } else {
      event.putNull("pressCoordinate");
    }
    event.putDouble("durationMs", Math.max(0d, nowMs() - session.startedAtMs));
    event.putDouble("resolvedAtMs", nowMs());
    emit(event);
  }

  private void handleSourceDataLoaded(int mapTag, SourceDataLoaded event) {
    if (event == null) {
      return;
    }
    String sourceId = event.getSourceId();
    String dataId = event.getDataId();
    Boolean loaded = event.getLoaded();
    if (sourceId == null || dataId == null || Boolean.FALSE.equals(loaded)) {
      return;
    }
    for (Map.Entry<String, InstanceState> entry : instances.entrySet()) {
      InstanceState state = entry.getValue();
      if (state.mapTag != mapTag) {
        continue;
      }
      Set<String> pendingDataIds = state.pendingSourceCommitDataIdsBySourceId.get(sourceId);
      if (pendingDataIds == null || !removeCommittedPendingDataIds(sourceId, dataId, pendingDataIds)) {
        continue;
      }
      if (pendingDataIds.isEmpty()) {
        state.pendingSourceCommitDataIdsBySourceId.remove(sourceId);
      }
      removeCommittedPendingDataIds(state.blockedEnterStartCommitFenceDataIdsBySourceId, sourceId, dataId);
      removeCommittedPendingDataIds(state.blockedPresentationCommitFenceDataIdsBySourceId, sourceId, dataId);
      if (state.pinSlotSourceIds.contains(sourceId)) {
        startAwaitingLivePinTransitions(entry.getKey(), sourceId, dataId, state);
      }
      if (sourceId.equals(state.dotSourceId)) {
        startAwaitingLiveDotTransitions(entry.getKey(), dataId, state);
      }
      if (state.pinSlotSourceIds.contains(sourceId)) {
        LabelFamilyObservationState labelObservation =
          derivedFamilyState(state, state.labelSourceId).labelObservation;
        if (labelObservation.observationEnabled) {
          double refreshDelayMs =
            state.currentViewportIsMoving
              ? labelObservation.refreshMsMoving
              : labelObservation.refreshMsIdle;
          scheduleLabelObservationRefresh(entry.getKey(), refreshDelayMs);
        }
      }
      promoteBlockedCommitFencesIfReady(entry.getKey(), state);
      instances.put(entry.getKey(), state);
    }
  }

  private void handleStyleLoaded(int mapTag) {
    for (Map.Entry<String, InstanceState> entry : instances.entrySet()) {
      String instanceId = entry.getKey();
      InstanceState state = entry.getValue();
      if (state.mapTag != mapTag) {
        continue;
      }
      state.pendingSourceCommitDataIdsBySourceId.clear();
      state.pendingPresentationSettleRequestKey = null;
      state.pendingPresentationSettleKind = null;
      state.blockedEnterStartRequestKey = null;
      state.blockedPresentationSettleRequestKey = null;
      state.blockedPresentationSettleKind = null;
      state.blockedEnterStartCommitFenceDataIdsBySourceId.clear();
      state.blockedPresentationCommitFenceDataIdsBySourceId.clear();
      state.isAwaitingSourceRecovery = true;
      if (state.sourceRecoveryPausedAtMs == null) {
        state.sourceRecoveryPausedAtMs = nowMs();
      }
      Runnable revealFrameFallback = revealFrameFallbackRunnables.remove(instanceId);
      if (revealFrameFallback != null) {
        mainHandler.removeCallbacks(revealFrameFallback);
      }
      Runnable dismissFrameFallback = dismissFrameFallbackRunnables.remove(instanceId);
      if (dismissFrameFallback != null) {
        mainHandler.removeCallbacks(dismissFrameFallback);
      }
      Runnable sourceRecoveryRunnable = sourceRecoveryRunnables.remove(instanceId);
      if (sourceRecoveryRunnable != null) {
        mainHandler.removeCallbacks(sourceRecoveryRunnable);
      }
      instances.put(instanceId, state);
      scheduleSourceRecoveryReplay(instanceId, "style_loaded", 0);
    }
  }

  private void handleNativeCameraChanged(int mapTag, boolean isMoving) {
    RNMBXMapView mapView = resolveMapView(mapTag);
    if (mapView == null) {
      return;
    }
    boolean isGestureActive = readMapGestureActive(mapView);
    Point center = mapView.getMapboxMap().getCameraState().getCenter();
    if (center == null) {
      return;
    }
    double zoom = mapView.getMapboxMap().getCameraState().getZoom();
    CoordinateBounds visibleBounds =
      mapView
        .getMapboxMap()
        .coordinateBoundsForRect(new RectF(0f, 0f, mapView.getWidth(), mapView.getHeight()));
    Point northEast = visibleBounds.getNortheast();
    Point southWest = visibleBounds.getSouthwest();
    String mapKey = Integer.toString(mapTag);
    String signature =
      Long.toString(Math.round(center.latitude() * 10000d)) +
      "|" +
      Long.toString(Math.round(center.longitude() * 10000d)) +
      "|" +
      Long.toString(Math.round(zoom * 100d));
    if (isMoving && stringEquals(signature, lastNativeCameraDiagSignatureByMapKey.get(mapKey))) {
      return;
    }
    double nowMs = nowMs();
    Double lastAtMs = lastNativeCameraDiagAtMsByMapKey.get(mapKey);
    if (isMoving && lastAtMs != null && nowMs - lastAtMs < NATIVE_VIEWPORT_EVENT_THROTTLE_MS) {
      return;
    }
    lastNativeCameraDiagSignatureByMapKey.put(mapKey, signature);
    lastNativeCameraDiagAtMsByMapKey.put(mapKey, nowMs);
    for (Map.Entry<String, InstanceState> entry : instances.entrySet()) {
      InstanceState state = entry.getValue();
      if (state.mapTag != mapTag) {
        continue;
      }
      state.currentViewportIsMoving = isMoving;
      LabelFamilyObservationState labelObservation =
        derivedFamilyState(state, state.labelSourceId).labelObservation;
      if (labelObservation.observationEnabled) {
        double refreshDelayMs = isMoving ? labelObservation.refreshMsMoving : 0d;
        scheduleLabelObservationRefresh(entry.getKey(), refreshDelayMs);
      }
      instances.put(entry.getKey(), state);
      WritableMap event = Arguments.createMap();
      event.putString("type", "camera_changed");
      event.putString("instanceId", entry.getKey());
      event.putDouble("centerLat", center.latitude());
      event.putDouble("centerLng", center.longitude());
      event.putDouble("zoom", zoom);
      event.putDouble("northEastLat", northEast.latitude());
      event.putDouble("northEastLng", northEast.longitude());
      event.putDouble("southWestLat", southWest.latitude());
      event.putDouble("southWestLng", southWest.longitude());
      event.putBoolean("isGestureActive", isGestureActive);
      event.putBoolean("isMoving", isMoving);
      emit(event);
    }
  }

  private void registerPendingSourceCommit(
    InstanceState state,
    String sourceId,
    MutationSummary mutationSummary
  ) {
    if (mutationSummary == null || !mutationSummary.hasMutations() || mutationSummary.dataId == null) {
      return;
    }
    state
      .pendingSourceCommitDataIdsBySourceId
      .computeIfAbsent(sourceId, ignored -> new HashSet<>())
      .add(mutationSummary.dataId);
  }

  private String nextSourceCommitDataId(InstanceState state, String sourceId) {
    state.nextSourceCommitSequence += 1L;
    return sourceId + "::" + state.nextSourceCommitSequence;
  }

  private void promoteBlockedCommitFencesIfReady(String instanceId, InstanceState state) {
    if (
      state.blockedEnterStartRequestKey != null &&
      !hasPendingCommitFence(state.blockedEnterStartCommitFenceDataIdsBySourceId)
    ) {
      String blockedEnterStartRequestKey = state.blockedEnterStartRequestKey;
      state.blockedEnterStartRequestKey = null;
      state.blockedEnterStartCommitFenceDataIdsBySourceId.clear();
      state.currentPresentationRenderPhase = "reveal_preroll";
      instances.put(instanceId, state);
      maybeEmitExecutionBatchArmed(instanceId, state);
      if (
        "entering".equals(readEnterStatus(state.lastPresentationStateJson)) &&
        readEnterStartToken(state.lastPresentationStateJson) != null
      ) {
        try {
          startEnterPresentation(
            instanceId,
            blockedEnterStartRequestKey,
            readEnterStartToken(state.lastPresentationStateJson),
            null,
            null
          );
          state = instances.get(instanceId);
          if (state == null) {
            return;
          }
        } catch (Exception error) {
          emitError(instanceId, "reveal_start_opacity_apply_failed: " + error.getMessage());
          state = instances.get(instanceId);
          if (state == null) {
            return;
          }
        }
      }
    }
    if (
      state.blockedPresentationSettleRequestKey != null &&
      !hasPendingCommitFence(state.blockedPresentationCommitFenceDataIdsBySourceId)
    ) {
      state.pendingPresentationSettleRequestKey = state.blockedPresentationSettleRequestKey;
      state.pendingPresentationSettleKind = state.blockedPresentationSettleKind;
      state.currentPresentationRenderPhase =
        "exit".equals(state.blockedPresentationSettleKind) ? "exiting" : "enter_settling";
      String blockedPresentationSettleRequestKey = state.blockedPresentationSettleRequestKey;
      state.blockedPresentationSettleRequestKey = null;
      state.blockedPresentationSettleKind = null;
      state.blockedPresentationCommitFenceDataIdsBySourceId.clear();
      if ("exit".equals(state.pendingPresentationSettleKind)) {
        armNativeDismissSettle(instanceId, blockedPresentationSettleRequestKey);
      } else {
        armNativeEnterSettle(instanceId, blockedPresentationSettleRequestKey);
      }
    }
  }

  private static String phaseSummary(InstanceState state) {
    DerivedFamilyState pinFamilyState = derivedFamilyState(state, state.pinSourceId);
    DerivedFamilyState dotFamilyState = derivedFamilyState(state, state.dotSourceId);
    DerivedFamilyState labelFamilyState = derivedFamilyState(state, state.labelSourceId);
    SourceState pinSourceState = mountedSourceState(state, state.pinSourceId);
    SourceState dotSourceState = mountedSourceState(state, state.dotSourceId);
    SourceState labelSourceState = mountedSourceState(state, state.labelSourceId);
    return
      "pinMounted=" +
      (pinSourceState != null ? pinSourceState.diffKeyById.size() : 0) +
      " dotMounted=" +
      (dotSourceState != null ? dotSourceState.diffKeyById.size() : 0) +
      " labelMounted=" +
      (labelSourceState != null ? labelSourceState.diffKeyById.size() : 0) +
      " pinDesired=" +
      pinFamilyState.lastDesiredPinSnapshot.pinIdsInOrder.size() +
      " dotDesired=" +
      dotFamilyState.lastDesiredCollection.idsInOrder.size() +
      " labelDesired=" +
      labelFamilyState.desiredCollection.idsInOrder.size() +
      " pinFeatureStateOverrides=" +
      pinFamilyState.transientFeatureStateById.size() +
      " dotFeatureStateOverrides=" +
      dotFamilyState.transientFeatureStateById.size() +
      " labelFeatureStateOverrides=" +
      labelFamilyState.transientFeatureStateById.size() +
      " pinLodAnimations=" +
      pinFamilyState.livePinTransitionsByMarkerKey.size() +
      " dotLodAnimations=" +
      dotFamilyState.liveDotTransitionsByMarkerKey.size();
  }

  private Map<String, Set<String>> capturePendingVisualSourceCommitFence(InstanceState state) {
    Map<String, Set<String>> fence = new HashMap<>();
    ArrayList<String> sourceIds = new ArrayList<>();
    sourceIds.addAll(visualSourceIds(state));
    for (String sourceId : sourceIds) {
      Set<String> pending = state.pendingSourceCommitDataIdsBySourceId.get(sourceId);
      if (pending != null && !pending.isEmpty()) {
        fence.put(sourceId, new HashSet<>(pending));
      }
    }
    return fence;
  }

  private boolean hasPendingCommitFence(Map<String, Set<String>> fenceBySourceId) {
    for (Set<String> pending : fenceBySourceId.values()) {
      if (pending != null && !pending.isEmpty()) {
        return true;
      }
    }
    return false;
  }

  private Long commitSequence(String dataId, String sourceId) {
    if (dataId == null || !dataId.startsWith(sourceId + "::")) {
      return null;
    }
    try {
      return Long.parseLong(dataId.substring(sourceId.length() + 2));
    } catch (NumberFormatException ignored) {
      return null;
    }
  }

  private boolean shouldAcknowledgePendingCommitDataId(
    String pendingDataId,
    String sourceId,
    String acknowledgedDataId
  ) {
    if (pendingDataId == null) {
      return false;
    }
    if (pendingDataId.equals(acknowledgedDataId)) {
      return true;
    }
    Long acknowledgedSequence = commitSequence(acknowledgedDataId, sourceId);
    Long pendingSequence = commitSequence(pendingDataId, sourceId);
    if (acknowledgedSequence == null || pendingSequence == null) {
      return false;
    }
    return pendingSequence <= acknowledgedSequence;
  }

  private boolean shouldStartAwaitingTransition(
    String awaitingSourceDataId,
    String sourceId,
    String acknowledgedDataId
  ) {
    if (acknowledgedDataId == null) {
      return true;
    }
    return shouldAcknowledgePendingCommitDataId(awaitingSourceDataId, sourceId, acknowledgedDataId);
  }

  private boolean removeCommittedPendingDataIds(
    String sourceId,
    String acknowledgedDataId,
    Set<String> pendingDataIds
  ) {
    ArrayList<String> removedIds = new ArrayList<>();
    for (String pendingDataId : pendingDataIds) {
      if (shouldAcknowledgePendingCommitDataId(pendingDataId, sourceId, acknowledgedDataId)) {
        removedIds.add(pendingDataId);
      }
    }
    if (removedIds.isEmpty()) {
      return false;
    }
    pendingDataIds.removeAll(removedIds);
    return true;
  }

  private void removeCommittedPendingDataIds(
    Map<String, Set<String>> fenceBySourceId,
    String sourceId,
    String acknowledgedDataId
  ) {
    Set<String> pending = fenceBySourceId.get(sourceId);
    if (pending == null || !removeCommittedPendingDataIds(sourceId, acknowledgedDataId, pending)) {
      return;
    }
    if (pending.isEmpty()) {
      fenceBySourceId.remove(sourceId);
    }
  }

  private String describeCommitFence(Map<String, Set<String>> fenceBySourceId) {
    ArrayList<String> parts = new ArrayList<>();
    ArrayList<String> sourceIds = new ArrayList<>(fenceBySourceId.keySet());
    Collections.sort(sourceIds);
    for (String sourceId : sourceIds) {
      Set<String> pending = fenceBySourceId.get(sourceId);
      if (pending != null && !pending.isEmpty()) {
        parts.add(sourceId + "=" + pending.size());
      }
    }
    return String.join(",", parts);
  }

  private void armNativeEnterSettle(String instanceId, String requestKey) {
    Runnable pending = revealFrameFallbackRunnables.remove(instanceId);
    if (pending != null) {
      mainHandler.removeCallbacks(pending);
    }
    Runnable runnable = () -> {
      InstanceState state = instances.get(instanceId);
      if (
        state == null ||
        !stringEquals(state.pendingPresentationSettleRequestKey, requestKey) ||
        !"enter".equals(state.pendingPresentationSettleKind)
      ) {
        return;
      }
      settleEnterAfterRenderedFrame(instanceId, requestKey);
    };
    revealFrameFallbackRunnables.put(instanceId, runnable);
    mainHandler.postDelayed(runnable, FRAME_SETTLE_FALLBACK_DELAY_MS);
  }

  private void armNativeDismissSettle(String instanceId, String requestKey) {
    Runnable pending = dismissFrameFallbackRunnables.remove(instanceId);
    if (pending != null) {
      mainHandler.removeCallbacks(pending);
    }
    Runnable runnable = () -> {
      InstanceState state = instances.get(instanceId);
      if (
        state == null ||
        !stringEquals(state.pendingPresentationSettleRequestKey, requestKey) ||
        !"exit".equals(state.pendingPresentationSettleKind)
      ) {
        return;
      }
      settleDismissAfterRenderedFrame(instanceId, requestKey);
    };
    dismissFrameFallbackRunnables.put(instanceId, runnable);
    mainHandler.postDelayed(runnable, FRAME_SETTLE_FALLBACK_DELAY_MS);
  }

  private MutationSummary applySourceMutation(
    Style style,
    InstanceState state,
    String sourceId,
    SourceLifecyclePhase previousSourceLifecyclePhase,
    String previousSourceRevision,
    ParsedFeatureCollection next
  ) throws Exception {
    if (previousSourceRevision.equals(next.sourceRevision)) {
      return new MutationSummary(0, 0, 0, null, Collections.emptyList());
    }
    if (previousSourceLifecyclePhase != SourceLifecyclePhase.INCREMENTAL) {
      replaceSourceData(style, sourceId, next);
      return new MutationSummary(
        next.idsInOrder.size(),
        0,
        0,
        null,
        new ArrayList<>(next.idsInOrder)
      );
    }
    ArrayList<String> removeIds = new ArrayList<>(next.removedFeatureIdsInOrder);
    ArrayList<Feature> addFeatures = new ArrayList<>(next.addedFeatures);
    ArrayList<Feature> updateFeatures = new ArrayList<>(next.updatedFeatures);

    String dataId = null;
    if (!removeIds.isEmpty() || !addFeatures.isEmpty() || !updateFeatures.isEmpty()) {
      dataId = nextSourceCommitDataId(state, sourceId);
    }

    if (!removeIds.isEmpty()) {
      invokeStyleMutation(style, "removeGeoJSONSourceFeatures", sourceId, dataId, removeIds);
    }
    if (!addFeatures.isEmpty()) {
      invokeStyleMutation(style, "addGeoJSONSourceFeatures", sourceId, dataId, addFeatures);
    }
    if (!updateFeatures.isEmpty()) {
      invokeStyleMutation(style, "updateGeoJSONSourceFeatures", sourceId, dataId, updateFeatures);
    }
    return new MutationSummary(
      addFeatures.size(),
      updateFeatures.size(),
      removeIds.size(),
      dataId,
      new ArrayList<>(next.addedFeatureIdsInOrder)
    );
  }

  private void replaceSourceData(Style style, String sourceId, ParsedFeatureCollection next) {
    ArrayList<Feature> orderedFeatures = new ArrayList<>(next.idsInOrder.size());
    for (String featureId : next.idsInOrder) {
      Feature feature = next.featureById.get(featureId);
      if (feature != null) {
        orderedFeatures.add(feature);
      }
    }
    style.setStyleSourceProperty(
      sourceId,
      "data",
      Value.valueOf(FeatureCollection.fromFeatures(orderedFeatures).toJson())
    );
  }

  private ResolvedSourceMutationPlan resolveSourceMutationPlan(
    InstanceState state,
    String sourceId,
    SourceLifecyclePhase previousSourceLifecyclePhase,
    String previousSourceRevision,
    ParsedFeatureCollection next,
    boolean forceReplaceSourceData
  ) {
    if (previousSourceRevision.equals(next.sourceRevision)) {
      return new ResolvedSourceMutationPlan(
        sourceId,
        previousSourceLifecyclePhase,
        previousSourceRevision,
        next,
        SourceMutationMode.NONE,
        new MutationSummary(0, 0, 0, null, Collections.emptyList()),
        null
      );
    }

    if (forceReplaceSourceData || previousSourceLifecyclePhase != SourceLifecyclePhase.INCREMENTAL) {
      return new ResolvedSourceMutationPlan(
        sourceId,
        previousSourceLifecyclePhase,
        previousSourceRevision,
        next,
        SourceMutationMode.BASELINE_REPLACE,
        new MutationSummary(
          next.idsInOrder.size(),
          0,
          0,
          null,
          new ArrayList<>(next.idsInOrder)
        ),
        null
      );
    }
    ArrayList<String> removeIds = new ArrayList<>(next.removedFeatureIdsInOrder);
    ArrayList<String> addFeatureIds = new ArrayList<>(next.addedFeatureIdsInOrder);
    ArrayList<String> updateFeatureIds = new ArrayList<>(next.updatedFeatureIdsInOrder);
    String dataId = null;
    if (!removeIds.isEmpty() || !addFeatureIds.isEmpty() || !updateFeatureIds.isEmpty()) {
      dataId = nextSourceCommitDataId(state, sourceId);
    }

    return new ResolvedSourceMutationPlan(
      sourceId,
      previousSourceLifecyclePhase,
      previousSourceRevision,
      next,
      SourceMutationMode.INCREMENTAL_PATCH,
      new MutationSummary(
        addFeatureIds.size(),
        updateFeatureIds.size(),
        removeIds.size(),
        dataId,
        addFeatureIds
      ),
      dataId
    );
  }

  private void applySourceMutationBatch(Style style, List<ResolvedSourceMutationPlan> plans) throws Exception {
    for (ResolvedSourceMutationPlan plan : plans) {
      if (
        plan.mutationMode == SourceMutationMode.BASELINE_REPLACE &&
        !plan.previousSourceRevision.equals(plan.next.sourceRevision)
      ) {
        replaceSourceData(style, plan.sourceId, plan.next);
      }
    }

    for (ResolvedSourceMutationPlan plan : plans) {
      if (
        plan.mutationMode == SourceMutationMode.INCREMENTAL_PATCH &&
        !plan.previousSourceRevision.equals(plan.next.sourceRevision) &&
        !plan.next.removedFeatureIdsInOrder.isEmpty()
      ) {
        invokeStyleMutation(
          style,
          "removeGeoJSONSourceFeatures",
          plan.sourceId,
          plan.dataId,
          new ArrayList<>(plan.next.removedFeatureIdsInOrder)
        );
      }
    }

    for (ResolvedSourceMutationPlan plan : plans) {
      if (
        plan.mutationMode == SourceMutationMode.INCREMENTAL_PATCH &&
        !plan.previousSourceRevision.equals(plan.next.sourceRevision) &&
        !plan.next.addedFeatures.isEmpty()
      ) {
        invokeStyleMutation(
          style,
          "addGeoJSONSourceFeatures",
          plan.sourceId,
          plan.dataId,
          new ArrayList<>(plan.next.addedFeatures)
        );
      }
    }

    for (ResolvedSourceMutationPlan plan : plans) {
      if (
        plan.mutationMode == SourceMutationMode.INCREMENTAL_PATCH &&
        !plan.previousSourceRevision.equals(plan.next.sourceRevision) &&
        !plan.next.updatedFeatures.isEmpty()
      ) {
        invokeStyleMutation(
          style,
          "updateGeoJSONSourceFeatures",
          plan.sourceId,
          plan.dataId,
          new ArrayList<>(plan.next.updatedFeatures)
        );
      }
    }
  }

  private void invokeStyleMutation(
    Style style,
    String methodName,
    String sourceId,
    String dataId,
    List<?> entries
  ) throws Exception {
    Method method = style.getClass().getMethod(methodName, String.class, String.class, List.class);
    method.invoke(style, sourceId, dataId, entries);
  }

  private void invokeSetStyleLayerProperty(
    Style style,
    String layerId,
    String property,
    Value value
  ) throws Exception {
    Method method = style.getClass().getMethod("setStyleLayerProperty", String.class, String.class, Value.class);
    method.invoke(style, layerId, property, value);
  }

  private void removeFeatureStateKey(
    MapboxMap mapboxMap,
    String sourceId,
    String featureId,
    String stateKey
  ) {
    mapboxMap.removeFeatureState(sourceId, null, featureId, stateKey, result -> { });
  }

  private static SourceState sourceStateFromCollection(ParsedFeatureCollection collection) {
    SourceState state = new SourceState();
    state.lifecyclePhase =
      collection.sourceRevision.isEmpty() ? SourceLifecyclePhase.UNINITIALIZED : SourceLifecyclePhase.INCREMENTAL;
    state.sourceRevision = collection.sourceRevision;
    state.featureStateRevision = collection.featureStateRevision;
    state.featureStateEntryRevisionById.putAll(collection.featureStateEntryRevisionById);
    state.featureStateChangedIds.addAll(collection.featureStateChangedIds);
    state.idsInOrder.addAll(collection.idsInOrder);
    state.featureIds.addAll(collection.featureIds);
    state.addedFeatureIdsInOrder.addAll(collection.addedFeatureIdsInOrder);
    state.updatedFeatureIdsInOrder.addAll(collection.updatedFeatureIdsInOrder);
    state.removedFeatureIds.addAll(collection.removedFeatureIds);
    state.diffKeyById.putAll(collection.diffKeyById);
    state.markerKeyByFeatureId.putAll(collection.markerKeyByFeatureId);
    state.featureStateById.putAll(collection.featureStateById);
    return state;
  }

  private static SourceState applyCollectionMetadataToSourceState(
    ParsedFeatureCollection collection,
    SourceState previousSourceState
  ) {
    if (previousSourceState == null) {
      return sourceStateFromCollection(collection);
    }
    previousSourceState.lifecyclePhase =
      collection.sourceRevision.isEmpty() ? SourceLifecyclePhase.UNINITIALIZED : SourceLifecyclePhase.INCREMENTAL;
    previousSourceState.sourceRevision = collection.sourceRevision;
    previousSourceState.featureStateRevision = collection.featureStateRevision;
    previousSourceState.featureStateChangedIds.clear();
    previousSourceState.featureStateChangedIds.addAll(collection.featureStateChangedIds);
    previousSourceState.idsInOrder.clear();
    previousSourceState.idsInOrder.addAll(collection.idsInOrder);
    previousSourceState.featureIds.clear();
    previousSourceState.featureIds.addAll(collection.featureIds);
    previousSourceState.addedFeatureIdsInOrder.clear();
    previousSourceState.addedFeatureIdsInOrder.addAll(collection.addedFeatureIdsInOrder);
    previousSourceState.updatedFeatureIdsInOrder.clear();
    previousSourceState.updatedFeatureIdsInOrder.addAll(collection.updatedFeatureIdsInOrder);
    previousSourceState.removedFeatureIds.clear();
    previousSourceState.removedFeatureIds.addAll(collection.removedFeatureIds);

    for (String featureId : collection.removedFeatureIds) {
      previousSourceState.diffKeyById.remove(featureId);
      previousSourceState.markerKeyByFeatureId.remove(featureId);
      previousSourceState.featureStateById.remove(featureId);
      previousSourceState.featureStateEntryRevisionById.remove(featureId);
    }

    for (String featureId : collection.addedFeatureIdsInOrder) {
      String diffKey = collection.diffKeyById.get(featureId);
      if (diffKey != null) {
        previousSourceState.diffKeyById.put(featureId, diffKey);
      }
      String markerKey = collection.markerKeyByFeatureId.get(featureId);
      if (markerKey != null) {
        previousSourceState.markerKeyByFeatureId.put(featureId, markerKey);
      }
    }

    for (String featureId : collection.updatedFeatureIdsInOrder) {
      String diffKey = collection.diffKeyById.get(featureId);
      if (diffKey != null) {
        previousSourceState.diffKeyById.put(featureId, diffKey);
      }
      String markerKey = collection.markerKeyByFeatureId.get(featureId);
      if (markerKey != null) {
        previousSourceState.markerKeyByFeatureId.put(featureId, markerKey);
      }
    }

    for (String featureId : collection.featureStateChangedIds) {
      HashMap<String, Value> featureState = collection.featureStateById.get(featureId);
      if (featureState != null && !featureState.isEmpty()) {
        previousSourceState.featureStateById.put(featureId, featureState);
      } else {
        previousSourceState.featureStateById.remove(featureId);
      }
      String featureStateEntryRevision = collection.featureStateEntryRevisionById.get(featureId);
      if (featureStateEntryRevision != null) {
        previousSourceState.featureStateEntryRevisionById.put(featureId, featureStateEntryRevision);
      } else {
        previousSourceState.featureStateEntryRevisionById.remove(featureId);
      }
    }

    return previousSourceState;
  }

  private AppliedSourceUpdate applyParsedCollection(
    Style style,
    InstanceState state,
    String sourceId,
    ParsedFeatureCollection next,
    SourceState previousSourceState
  ) throws Exception {
    SourceState nextSourceState;
    if (
      previousSourceState != null &&
      previousSourceState.sourceRevision.equals(next.sourceRevision) &&
      previousSourceState.featureStateRevision.equals(next.featureStateRevision)
    ) {
      previousSourceState.featureStateChangedIds.clear();
      previousSourceState.addedFeatureIdsInOrder.clear();
      previousSourceState.updatedFeatureIdsInOrder.clear();
      previousSourceState.removedFeatureIds.clear();
      MutationSummary mutationSummary =
        applySourceMutation(
          style,
          state,
          sourceId,
          previousSourceState.lifecyclePhase,
          previousSourceState.sourceRevision,
          next
        );
      return new AppliedSourceUpdate(previousSourceState, mutationSummary);
    }
    if (
      previousSourceState != null &&
      (
        !previousSourceState.sourceRevision.equals(next.baseSourceRevision) ||
        !previousSourceState.featureStateRevision.equals(next.baseFeatureStateRevision)
      )
    ) {
      throw new Exception(
        "Parsed collection base mismatch for " +
        sourceId +
        ": expected source=" +
        previousSourceState.sourceRevision +
        " featureState=" +
        previousSourceState.featureStateRevision +
        " got source=" +
        next.baseSourceRevision +
        " featureState=" +
        next.baseFeatureStateRevision
      );
    }
    nextSourceState = applyCollectionMetadataToSourceState(next, previousSourceState);
    MutationSummary mutationSummary =
      applySourceMutation(
        style,
        state,
        sourceId,
        previousSourceState != null ? previousSourceState.lifecyclePhase : SourceLifecyclePhase.UNINITIALIZED,
        previousSourceState != null ? previousSourceState.sourceRevision : "",
        next
      );
    return new AppliedSourceUpdate(nextSourceState, mutationSummary);
  }

  private static ResolvedParsedCollectionApplyPlan resolveParsedCollectionApplyPlan(
    ParsedCollectionApplyPlan plan
  ) throws Exception {
    SourceState nextSourceState;
    if (
      plan.previousSourceState != null &&
      plan.previousSourceState.sourceRevision.equals(plan.next.sourceRevision) &&
      plan.previousSourceState.featureStateRevision.equals(plan.next.featureStateRevision)
    ) {
      plan.previousSourceState.featureStateChangedIds.clear();
      plan.previousSourceState.addedFeatureIdsInOrder.clear();
      plan.previousSourceState.updatedFeatureIdsInOrder.clear();
      plan.previousSourceState.removedFeatureIds.clear();
      nextSourceState = plan.previousSourceState;
    } else {
      if (
        plan.previousSourceState != null &&
        (
          !plan.previousSourceState.sourceRevision.equals(plan.next.baseSourceRevision) ||
          !plan.previousSourceState.featureStateRevision.equals(plan.next.baseFeatureStateRevision)
        )
      ) {
        throw new Exception(
          "Parsed collection base mismatch for " +
          plan.sourceId +
          ": expected source=" +
          plan.previousSourceState.sourceRevision +
          " featureState=" +
          plan.previousSourceState.featureStateRevision +
          " got source=" +
          plan.next.baseSourceRevision +
          " featureState=" +
          plan.next.baseFeatureStateRevision
        );
      }
      nextSourceState = applyCollectionMetadataToSourceState(plan.next, plan.previousSourceState);
    }
    return new ResolvedParsedCollectionApplyPlan(
      plan.sourceId,
      plan.next,
      plan.previousSourceState != null ? plan.previousSourceState.lifecyclePhase : SourceLifecyclePhase.UNINITIALIZED,
      plan.previousSourceState != null ? plan.previousSourceState.sourceRevision : "",
      plan.previousFeatureStateById,
      plan.previousFeatureStateRevision,
      nextSourceState,
      plan.forceReplaceSourceData
    );
  }

  private Map<String, MutationSummary> applyParsedCollectionBatch(
    Style style,
    InstanceState state,
    String instanceId,
    List<ParsedCollectionApplyPlan> plans
  ) throws Exception {
    if (plans.isEmpty()) {
      return Collections.emptyMap();
    }
    ArrayList<ResolvedParsedCollectionApplyPlan> resolvedPlans = new ArrayList<>(plans.size());
    for (ParsedCollectionApplyPlan plan : plans) {
      resolvedPlans.add(resolveParsedCollectionApplyPlan(plan));
    }
    LinkedHashMap<String, MutationSummary> mutationSummaryBySourceId = new LinkedHashMap<>();
    ArrayList<ResolvedSourceMutationPlan> resolvedMutationPlans = new ArrayList<>(resolvedPlans.size());
    for (ResolvedParsedCollectionApplyPlan plan : resolvedPlans) {
      ResolvedSourceMutationPlan resolvedMutationPlan =
        resolveSourceMutationPlan(
          state,
          plan.sourceId,
          plan.previousSourceLifecyclePhase,
          plan.previousSourceRevision,
          plan.next,
          plan.forceReplaceSourceData
        );
      mutationSummaryBySourceId.put(
        plan.sourceId,
        resolvedMutationPlan.mutationSummary
      );
      resolvedMutationPlans.add(resolvedMutationPlan);
    }
    applySourceMutationBatch(style, resolvedMutationPlans);
    for (ResolvedParsedCollectionApplyPlan plan : resolvedPlans) {
      MutationSummary mutationSummary = mutationSummaryBySourceId.get(plan.sourceId);
      if (mutationSummary == null) {
        mutationSummary = new MutationSummary(0, 0, 0, null, Collections.emptyList());
      }
      applyFeatureStates(
        state,
        plan.sourceId,
        plan.previousFeatureStateRevision,
        plan.nextSourceState.featureStateRevision,
        plan.nextSourceState.featureStateChangedIds,
        plan.nextSourceState.featureStateById,
        plan.previousFeatureStateById
      );
      registerPendingSourceCommit(state, plan.sourceId, mutationSummary);
      syncMountedSourceState(state, plan.sourceId, plan.nextSourceState);
    }
    return mutationSummaryBySourceId;
  }

  private static ParsedFeatureCollection parseFeatureCollection(String sourceId, String json) throws Exception {
    FeatureCollection collection = FeatureCollection.fromJson(json);
    JSONObject rawObject = new JSONObject(json);
    JSONArray rawFeatures = rawObject.optJSONArray("features");
    ParsedFeatureCollection parsed = new ParsedFeatureCollection();
    List<Feature> features = collection.features();
    Set<String> seenFeatureIds = new LinkedHashSet<>();
    if (features == null) {
      return parsed;
    }
    for (int index = 0; index < features.size(); index += 1) {
      Feature feature = features.get(index);
      String id = feature.id();
      if (id == null || id.isEmpty()) {
        throw new Exception("Feature missing id in parsed source " + sourceId);
      }
      if (!seenFeatureIds.add(id)) {
        throw new Exception("Duplicate feature id " + id + " in parsed source " + sourceId);
      }
      parsed.idsInOrder.add(id);
      parsed.featureById.put(id, feature);
      String encodedFeatureJson = feature.toJson();
      parsed.diffKeyById.put(id, makeFeatureDiffKey(encodedFeatureJson));
      JSONObject rawFeature =
        rawFeatures != null && index < rawFeatures.length() ? rawFeatures.optJSONObject(index) : null;
      String markerKey = extractMarkerKey(sourceId, rawFeature, id);
      parsed.markerKeyByFeatureId.put(id, markerKey);
      parsed.featureStateById.put(id, extractFeatureState(rawFeature));
    }
    parsed.sourceRevision = buildParsedCollectionRevision(parsed.idsInOrder, parsed.diffKeyById);
    parsed.featureStateEntryRevisionById.putAll(makeFeatureStateEntryRevisionById(parsed.featureStateById));
    parsed.featureStateRevision =
      buildFeatureStateRevisionFromEntries(parsed.featureStateEntryRevisionById);
    parsed.featureIds.addAll(parsed.idsInOrder);
    parsed.featureStateChangedIds.addAll(parsed.featureStateEntryRevisionById.keySet());
    parsed.addedFeatureIdsInOrder.addAll(parsed.idsInOrder);
    return parsed;
  }

  private static ParsedFeatureCollectionDelta[] parseSourceDeltas(ReadableArray rawDeltas) throws Exception {
    ParsedFeatureCollectionDelta[] deltas = new ParsedFeatureCollectionDelta[rawDeltas.size()];
    for (int index = 0; index < rawDeltas.size(); index += 1) {
      ReadableMap rawDelta = rawDeltas.getMap(index);
      if (rawDelta == null) {
        throw new Exception("Source delta missing entry");
      }
      String sourceId =
        rawDelta.hasKey("sourceId") && !rawDelta.isNull("sourceId")
          ? rawDelta.getString("sourceId")
          : "";
      if (sourceId.isEmpty()) {
        throw new Exception("Source delta missing sourceId");
      }
      String mode =
        rawDelta.hasKey("mode") && !rawDelta.isNull("mode") ? rawDelta.getString("mode") : "patch";
      ReadableArray rawNextFeatureIds =
        rawDelta.hasKey("nextFeatureIdsInOrder") && !rawDelta.isNull("nextFeatureIdsInOrder")
          ? rawDelta.getArray("nextFeatureIdsInOrder")
          : null;
      ArrayList<String> nextFeatureIdsInOrder = new ArrayList<>();
      if (rawNextFeatureIds != null) {
        for (int featureIndex = 0; featureIndex < rawNextFeatureIds.size(); featureIndex += 1) {
          String featureId =
            rawNextFeatureIds.isNull(featureIndex) ? null : rawNextFeatureIds.getString(featureIndex);
          if (featureId == null || featureId.isEmpty()) {
            throw new Exception("Source delta " + sourceId + " has missing feature id in nextFeatureIdsInOrder");
          }
          nextFeatureIdsInOrder.add(featureId);
        }
      }
      nextFeatureIdsInOrder =
        assertUniqueOrderedFeatureIds(nextFeatureIdsInOrder, "source delta " + sourceId + " nextFeatureIdsInOrder");
      ReadableArray rawRemoveIds =
        rawDelta.hasKey("removeIds") && !rawDelta.isNull("removeIds")
          ? rawDelta.getArray("removeIds")
          : null;
      ArrayList<String> rawRemoveIdList = new ArrayList<>();
      if (rawRemoveIds != null) {
        for (int removeIndex = 0; removeIndex < rawRemoveIds.size(); removeIndex += 1) {
          String featureId =
            rawRemoveIds.isNull(removeIndex) ? null : rawRemoveIds.getString(removeIndex);
          if (featureId == null || featureId.isEmpty()) {
            throw new Exception("Source delta " + sourceId + " has missing feature id in removeIds");
          }
          rawRemoveIdList.add(featureId);
        }
      }
      Set<String> removeIds =
        assertUniqueStringSet(rawRemoveIdList, "source delta " + sourceId + " removeIds");
      ReadableArray rawDirtyGroupIds =
        rawDelta.hasKey("dirtyGroupIds") && !rawDelta.isNull("dirtyGroupIds")
          ? rawDelta.getArray("dirtyGroupIds")
          : null;
      ArrayList<String> rawDirtyGroupIdList = new ArrayList<>();
      if (rawDirtyGroupIds != null) {
        for (int groupIndex = 0; groupIndex < rawDirtyGroupIds.size(); groupIndex += 1) {
          String groupId =
            rawDirtyGroupIds.isNull(groupIndex) ? null : rawDirtyGroupIds.getString(groupIndex);
          if (groupId == null || groupId.isEmpty()) {
            throw new Exception("Source delta " + sourceId + " has missing group id in dirtyGroupIds");
          }
          rawDirtyGroupIdList.add(groupId);
        }
      }
      Set<String> dirtyGroupIds =
        assertUniqueStringSet(rawDirtyGroupIdList, "source delta " + sourceId + " dirtyGroupIds");
      ReadableArray rawOrderChangedGroupIds =
        rawDelta.hasKey("orderChangedGroupIds") && !rawDelta.isNull("orderChangedGroupIds")
          ? rawDelta.getArray("orderChangedGroupIds")
          : null;
      ArrayList<String> rawOrderChangedGroupIdList = new ArrayList<>();
      if (rawOrderChangedGroupIds != null) {
        for (int groupIndex = 0; groupIndex < rawOrderChangedGroupIds.size(); groupIndex += 1) {
          String groupId =
            rawOrderChangedGroupIds.isNull(groupIndex) ? null : rawOrderChangedGroupIds.getString(groupIndex);
          if (groupId == null || groupId.isEmpty()) {
            throw new Exception(
              "Source delta " + sourceId + " has missing group id in orderChangedGroupIds"
            );
          }
          rawOrderChangedGroupIdList.add(groupId);
        }
      }
      Set<String> orderChangedGroupIds =
        assertUniqueStringSet(
          rawOrderChangedGroupIdList,
          "source delta " + sourceId + " orderChangedGroupIds"
        );
      ReadableArray rawRemovedGroupIds =
        rawDelta.hasKey("removedGroupIds") && !rawDelta.isNull("removedGroupIds")
          ? rawDelta.getArray("removedGroupIds")
          : null;
      ArrayList<String> rawRemovedGroupIdList = new ArrayList<>();
      if (rawRemovedGroupIds != null) {
        for (int groupIndex = 0; groupIndex < rawRemovedGroupIds.size(); groupIndex += 1) {
          String groupId =
            rawRemovedGroupIds.isNull(groupIndex) ? null : rawRemovedGroupIds.getString(groupIndex);
          if (groupId == null || groupId.isEmpty()) {
            throw new Exception("Source delta " + sourceId + " has missing group id in removedGroupIds");
          }
          rawRemovedGroupIdList.add(groupId);
        }
      }
      Set<String> removedGroupIds =
        assertUniqueStringSet(rawRemovedGroupIdList, "source delta " + sourceId + " removedGroupIds");
      ParsedFeatureCollection upsertCollection =
        rawDelta.hasKey("upsertFeatures") && !rawDelta.isNull("upsertFeatures")
          ? parseTransportFeatures(rawDelta.getArray("upsertFeatures"))
          : null;
      deltas[index] =
        new ParsedFeatureCollectionDelta(
          sourceId,
          mode,
          nextFeatureIdsInOrder,
          removeIds,
          dirtyGroupIds,
          orderChangedGroupIds,
          removedGroupIds,
          upsertCollection
        );
    }
    return deltas;
  }

  private static ParsedFeatureCollection parseTransportFeatures(
    ReadableArray rawFeatures
  ) throws Exception {
    ParsedFeatureCollection parsed = new ParsedFeatureCollection();
    Set<String> seenFeatureIds = new LinkedHashSet<>();
    for (int index = 0; index < rawFeatures.size(); index += 1) {
      ReadableMap rawFeature =
        rawFeatures.isNull(index) ? null : rawFeatures.getMap(index);
      if (rawFeature == null) {
        throw new Exception("Transport feature missing entry at index " + index);
      }
      String id =
        rawFeature.hasKey("id") && !rawFeature.isNull("id") ? rawFeature.getString("id") : null;
      Double lng =
        rawFeature.hasKey("lng") && !rawFeature.isNull("lng")
          ? rawFeature.getDouble("lng")
          : null;
      Double lat =
        rawFeature.hasKey("lat") && !rawFeature.isNull("lat")
          ? rawFeature.getDouble("lat")
          : null;
      if (id == null || id.isEmpty() || lng == null || lat == null) {
        throw new Exception("Transport feature missing required id/lng/lat payload");
      }
      if (!seenFeatureIds.add(id)) {
        throw new Exception("Duplicate feature id " + id + " in transport features");
      }
      JsonObject properties =
        rawFeature.hasKey("properties") && !rawFeature.isNull("properties")
          ? readableMapToJsonObject(rawFeature.getMap("properties"))
          : new JsonObject();
      Feature feature = Feature.fromGeometry(Point.fromLngLat(lng, lat), properties, id, null);
      parsed.idsInOrder.add(id);
      parsed.featureById.put(id, feature);
      String diffKey =
        rawFeature.hasKey("diffKey") && !rawFeature.isNull("diffKey")
          ? rawFeature.getString("diffKey")
          : null;
      parsed.diffKeyById.put(id, diffKey != null && !diffKey.isEmpty() ? diffKey : id);
      String markerKey =
        rawFeature.hasKey("markerKey") && !rawFeature.isNull("markerKey")
          ? rawFeature.getString("markerKey")
          : null;
      parsed.markerKeyByFeatureId.put(id, markerKey != null && !markerKey.isEmpty() ? markerKey : id);
      if (rawFeature.hasKey("featureState") && !rawFeature.isNull("featureState")) {
        ReadableMap rawFeatureState = rawFeature.getMap("featureState");
        if (rawFeatureState != null) {
          HashMap<String, Value> featureState = new HashMap<>();
          for (String key : TRANSIENT_VISUAL_PROPERTY_KEYS) {
            if (rawFeatureState.hasKey(key) && !rawFeatureState.isNull(key)) {
              featureState.put(key, Value.valueOf(rawFeatureState.getDouble(key)));
            }
          }
          if (!featureState.isEmpty()) {
            parsed.featureStateById.put(id, featureState);
          }
        }
      }
    }
    parsed.sourceRevision = buildParsedCollectionRevision(parsed.idsInOrder, parsed.diffKeyById);
    parsed.featureStateEntryRevisionById.putAll(makeFeatureStateEntryRevisionById(parsed.featureStateById));
    parsed.featureStateRevision =
      buildFeatureStateRevisionFromEntries(parsed.featureStateEntryRevisionById);
    parsed.featureIds.addAll(parsed.idsInOrder);
    parsed.dirtyGroupIds.addAll(parsed.markerKeyByFeatureId.values());
    parsed.orderChangedGroupIds.addAll(parsed.markerKeyByFeatureId.values());
    parsed.featureStateChangedIds.addAll(parsed.featureStateEntryRevisionById.keySet());
    parsed.addedFeatureIdsInOrder.addAll(parsed.idsInOrder);
    return parsed;
  }

  private static JsonObject readableMapToJsonObject(ReadableMap readableMap) {
    JsonObject object = new JsonObject();
    if (readableMap == null) {
      return object;
    }
    ReadableMapKeySetIterator iterator = readableMap.keySetIterator();
    while (iterator.hasNextKey()) {
      String key = iterator.nextKey();
      object.add(key, readableValueToJsonElement(readableMap, key));
    }
    return object;
  }

  private static JsonElement readableArrayToJsonElement(ReadableArray readableArray) {
    JsonArray array = new JsonArray();
    for (int index = 0; index < readableArray.size(); index += 1) {
      switch (readableArray.getType(index)) {
        case Null:
          array.add(JsonNull.INSTANCE);
          break;
        case Boolean:
          array.add(new JsonPrimitive(readableArray.getBoolean(index)));
          break;
        case Number:
          array.add(new JsonPrimitive(readableArray.getDouble(index)));
          break;
        case String:
          array.add(new JsonPrimitive(readableArray.getString(index)));
          break;
        case Map:
          array.add(readableMapToJsonObject(readableArray.getMap(index)));
          break;
        case Array:
          array.add(readableArrayToJsonElement(readableArray.getArray(index)));
          break;
      }
    }
    return array;
  }

  private static JsonElement readableValueToJsonElement(ReadableMap readableMap, String key) {
    ReadableType type = readableMap.getType(key);
    switch (type) {
      case Null:
        return JsonNull.INSTANCE;
      case Boolean:
        return new JsonPrimitive(readableMap.getBoolean(key));
      case Number:
        return new JsonPrimitive(readableMap.getDouble(key));
      case String:
        return new JsonPrimitive(readableMap.getString(key));
      case Map:
        return readableMapToJsonObject(readableMap.getMap(key));
      case Array:
        return readableArrayToJsonElement(readableMap.getArray(key));
      default:
        return JsonNull.INSTANCE;
    }
  }

  private static ParsedFeatureCollection applyParsedCollectionDelta(
    ParsedFeatureCollectionDelta delta,
    ParsedFeatureCollection base
  ) throws Exception {
    ParsedFeatureCollection effectiveBase = base;
    Map<String, Feature> featureById = new HashMap<>(effectiveBase.featureById);
    Map<String, String> diffKeyById = new HashMap<>(effectiveBase.diffKeyById);
    Map<String, HashMap<String, Value>> featureStateById = new HashMap<>(effectiveBase.featureStateById);
    Map<String, String> featureStateEntryRevisionById =
      new HashMap<>(effectiveBase.featureStateEntryRevisionById);
    Map<String, String> markerKeyByFeatureId = new HashMap<>(effectiveBase.markerKeyByFeatureId);

    for (String removeId : delta.removeIds) {
      featureById.remove(removeId);
      diffKeyById.remove(removeId);
      featureStateById.remove(removeId);
      featureStateEntryRevisionById.remove(removeId);
      markerKeyByFeatureId.remove(removeId);
    }

    if (delta.upsertCollection != null) {
      for (String featureId : delta.upsertCollection.idsInOrder) {
        Feature feature = delta.upsertCollection.featureById.get(featureId);
        if (feature == null) {
          throw new Exception(
            "Source delta upsert missing feature " + featureId + " for " + delta.sourceId
          );
        }
        featureById.put(featureId, feature);
      }
      diffKeyById.putAll(delta.upsertCollection.diffKeyById);
      featureStateById.putAll(delta.upsertCollection.featureStateById);
      featureStateEntryRevisionById.putAll(delta.upsertCollection.featureStateEntryRevisionById);
      markerKeyByFeatureId.putAll(delta.upsertCollection.markerKeyByFeatureId);
    }

    ParsedFeatureCollection next = new ParsedFeatureCollection();
    Set<String> seenFeatureIds = new LinkedHashSet<>();
    for (String featureId : assertUniqueOrderedFeatureIds(delta.nextFeatureIdsInOrder, "source delta " + delta.sourceId)) {
      if (!seenFeatureIds.add(featureId)) {
        throw new Exception("Duplicate feature id " + featureId + " in source delta " + delta.sourceId);
      }
      Feature feature = featureById.get(featureId);
      String diffKey = diffKeyById.get(featureId);
      String markerKey = markerKeyByFeatureId.get(featureId);
      if (feature == null || diffKey == null || markerKey == null) {
        throw new Exception(
          "Source delta missing feature " + featureId + " for " + delta.sourceId
        );
      }
      next.idsInOrder.add(featureId);
      next.featureById.put(featureId, feature);
      next.diffKeyById.put(featureId, diffKey);
      if (featureStateById.containsKey(featureId)) {
        next.featureStateById.put(featureId, featureStateById.get(featureId));
        next.featureStateEntryRevisionById.put(
          featureId,
          featureStateEntryRevisionById.containsKey(featureId)
            ? featureStateEntryRevisionById.get(featureId)
            : buildFeatureStateEntryRevision(featureStateById.get(featureId))
        );
      }
      next.markerKeyByFeatureId.put(featureId, markerKey);
    }
    next.sourceRevision =
      effectiveBase.idsInOrder.equals(next.idsInOrder) && effectiveBase.diffKeyById.equals(next.diffKeyById)
        ? effectiveBase.sourceRevision
        : buildParsedCollectionRevision(next.idsInOrder, next.diffKeyById);
    next.featureStateRevision =
      effectiveBase.featureStateEntryRevisionById.equals(next.featureStateEntryRevisionById)
        ? effectiveBase.featureStateRevision
        : buildFeatureStateRevisionFromEntries(next.featureStateEntryRevisionById);
    next.featureIds.addAll(next.idsInOrder);
    Set<String> derivedRemovedGroupIds = new LinkedHashSet<>();
    for (String removedFeatureId : effectiveBase.featureIds) {
      if (!next.featureIds.contains(removedFeatureId)) {
        String removedMarkerKey = effectiveBase.markerKeyByFeatureId.get(removedFeatureId);
        if (removedMarkerKey != null && !removedMarkerKey.isEmpty()) {
          derivedRemovedGroupIds.add(removedMarkerKey);
        }
      }
    }
    next.dirtyGroupIds.addAll(
      delta.dirtyGroupIds.isEmpty() ? next.markerKeyByFeatureId.values() : delta.dirtyGroupIds
    );
    next.dirtyGroupIds.addAll(derivedRemovedGroupIds);
    next.orderChangedGroupIds.addAll(
      delta.orderChangedGroupIds.isEmpty() ? next.dirtyGroupIds : delta.orderChangedGroupIds
    );
    next.orderChangedGroupIds.addAll(derivedRemovedGroupIds);
    next.removedGroupIds.addAll(delta.removedGroupIds);
    next.removedGroupIds.addAll(derivedRemovedGroupIds);
    for (Map.Entry<String, String> entry : next.featureStateEntryRevisionById.entrySet()) {
      if (!Objects.equals(effectiveBase.featureStateEntryRevisionById.get(entry.getKey()), entry.getValue())) {
        next.featureStateChangedIds.add(entry.getKey());
      }
    }
    for (String featureId : next.idsInOrder) {
      if (!effectiveBase.featureIds.contains(featureId)) {
        next.addedFeatureIdsInOrder.add(featureId);
        Feature feature = next.featureById.get(featureId);
        if (feature != null) {
          next.addedFeatures.add(feature);
        }
      } else if (!Objects.equals(effectiveBase.diffKeyById.get(featureId), next.diffKeyById.get(featureId))) {
        next.updatedFeatureIdsInOrder.add(featureId);
        Feature feature = next.featureById.get(featureId);
        if (feature != null) {
          next.updatedFeatures.add(feature);
        }
      }
    }
    for (String previousFeatureId : effectiveBase.featureIds) {
      if (!next.featureIds.contains(previousFeatureId)) {
        next.removedFeatureIds.add(previousFeatureId);
        next.removedFeatureIdsInOrder.add(previousFeatureId);
      }
    }
    next.baseSourceRevision = effectiveBase.sourceRevision;
    next.baseFeatureStateRevision = effectiveBase.featureStateRevision;
    return next;
  }

  private static String buildParsedCollectionRevision(
    List<String> idsInOrder,
    Map<String, String> diffKeyById
  ) {
    long hash = fnv1a64Append(FNV1A64_OFFSET_BASIS, Integer.toString(idsInOrder.size()));
    for (String featureId : idsInOrder) {
      hash = fnv1a64Append(hash, "|");
      hash = fnv1a64Append(hash, featureId);
      hash = fnv1a64Append(hash, "=");
      hash = fnv1a64Append(hash, diffKeyById.containsKey(featureId) ? diffKeyById.get(featureId) : "");
    }
    return idsInOrder.size() + ":" + Long.toUnsignedString(hash, 16);
  }

  private static long fnv1a64Append(long hash, String value) {
    byte[] bytes = value.getBytes(StandardCharsets.UTF_8);
    for (byte nextByte : bytes) {
      hash ^= (nextByte & 0xffL);
      hash *= FNV1A64_PRIME;
    }
    return hash;
  }

  private static String buildFeatureStateRevision(
    Map<String, HashMap<String, Value>> featureStateById
  ) {
    return buildFeatureStateRevisionFromEntries(makeFeatureStateEntryRevisionById(featureStateById));
  }

  private static Map<String, String> makeFeatureStateEntryRevisionById(
    Map<String, HashMap<String, Value>> featureStateById
  ) {
    Map<String, String> revisionById = new HashMap<>();
    for (Map.Entry<String, HashMap<String, Value>> entry : featureStateById.entrySet()) {
      revisionById.put(entry.getKey(), buildFeatureStateEntryRevision(entry.getValue()));
    }
    return revisionById;
  }

  private static String buildFeatureStateRevisionFromEntries(
    Map<String, String> featureStateEntryRevisionById
  ) {
    ArrayList<String> featureIds = new ArrayList<>(featureStateEntryRevisionById.keySet());
    Collections.sort(featureIds);
    long hash = fnv1a64Append(FNV1A64_OFFSET_BASIS, Integer.toString(featureIds.size()));
    for (String featureId : featureIds) {
      hash = fnv1a64Append(hash, "|");
      hash = fnv1a64Append(hash, featureId);
      hash = fnv1a64Append(hash, "=");
      hash =
        fnv1a64Append(
          hash,
          featureStateEntryRevisionById.containsKey(featureId)
            ? featureStateEntryRevisionById.get(featureId)
            : ""
        );
    }
    return finishHashedRevision(hash, featureIds.size());
  }

  private static String finishHashedRevision(long hash, int count) {
    return count + ":" + Long.toUnsignedString(hash, 16);
  }

  private static String buildFeatureStateEntryRevision(HashMap<String, Value> featureState) {
    if (featureState == null || featureState.isEmpty()) {
      return "";
    }
    ArrayList<String> stateKeys = new ArrayList<>(featureState.keySet());
    Collections.sort(stateKeys);
    StringBuilder builder = new StringBuilder();
    for (String stateKey : stateKeys) {
      builder.append(stateKey);
      builder.append(':');
      Value value = featureState.get(stateKey);
      builder.append(value != null ? value.toString() : "null");
      builder.append(',');
    }
    return builder.toString();
  }

  private static String extractMarkerKey(
    String sourceId,
    JSONObject rawFeature,
    String featureId
  ) throws Exception {
    if (rawFeature == null) {
      throw new Exception(
        "Feature " + featureId + " missing markerKey payload sourceId=" + sourceId
      );
    }
    JSONObject properties = rawFeature.optJSONObject("properties");
    if (properties == null) {
      throw new Exception(
        "Feature " + featureId + " missing markerKey properties payload sourceId=" + sourceId
      );
    }
    String markerKey = properties.optString("markerKey", "");
    if (markerKey.isEmpty()) {
      throw new Exception(
        "Feature " +
        featureId +
        " missing required markerKey sourceId=" +
        sourceId +
        " labelCandidate=" +
        properties.optString("labelCandidate", "") +
        " restaurantId=" +
        properties.optString("restaurantId", "")
      );
    }
    if (properties.has("labelCandidate")) {
      String expectedPrefix = markerKey + "::label::";
      if (!featureId.startsWith(expectedPrefix)) {
        throw new Exception(
          "Feature " +
          featureId +
          " markerKey mismatch sourceId=" +
          sourceId +
          " labelCandidate=" +
          properties.optString("labelCandidate", "") +
          " restaurantId=" +
          properties.optString("restaurantId", "") +
          " expected label feature.id prefix " +
          expectedPrefix +
          " gotFeatureId=" +
          featureId +
          " markerKey=" +
          markerKey
        );
      }
      return markerKey;
    }
    if (!featureId.equals(markerKey)) {
      throw new Exception(
        "Feature " +
        featureId +
        " markerKey mismatch sourceId=" +
        sourceId +
        " restaurantId=" +
        properties.optString("restaurantId", "") +
        " expected feature.id contract, got " +
        markerKey
      );
    }
    return markerKey;
  }


  private static HashMap<String, Value> extractFeatureState(JSONObject rawFeature) {
    HashMap<String, Value> state = new HashMap<>();
    if (rawFeature == null) {
      return state;
    }
    JSONObject properties = rawFeature.optJSONObject("properties");
    if (properties == null) {
      return state;
    }
    for (String key : TRANSIENT_VISUAL_PROPERTY_KEYS) {
      addFeatureStateValue(state, properties, key);
    }
    return state;
  }

  private static void addFeatureStateValue(
    HashMap<String, Value> state,
    JSONObject properties,
    String key
  ) {
    if (!properties.has(key)) {
      return;
    }
    state.put(key, Value.valueOf(properties.optDouble(key, 1)));
  }

  private static String makeFeatureDiffKey(String encodedFeatureJson) {
    try {
      JsonElement parsedFeature = JsonParser.parseString(encodedFeatureJson);
      if (!parsedFeature.isJsonObject()) {
        return encodedFeatureJson;
      }
      return canonicalizeJsonElement(sanitizeFeatureDiffObject(parsedFeature.getAsJsonObject(), true));
    } catch (Exception ignored) {
      return encodedFeatureJson;
    }
  }

  private static String makeFeatureDiffKey(Feature feature) {
    if (feature == null) {
      return null;
    }
    JsonObject rawFeature = new JsonObject();
    rawFeature.addProperty("type", "Feature");
    if (feature.geometry() instanceof Point) {
      Point point = (Point) feature.geometry();
      JsonObject geometry = new JsonObject();
      geometry.addProperty("type", "Point");
      JsonArray coordinates = new JsonArray();
      coordinates.add(point.longitude());
      coordinates.add(point.latitude());
      geometry.add("coordinates", coordinates);
      rawFeature.add("geometry", geometry);
    } else if (feature.geometry() != null) {
      return null;
    }
    if (feature.properties() != null) {
      rawFeature.add("properties", feature.properties().deepCopy());
    }
    return canonicalizeJsonElement(sanitizeFeatureDiffObject(rawFeature, true));
  }

  private static JsonObject sanitizeFeatureDiffObject(JsonObject source, boolean isFeatureRoot) {
    JsonObject sanitized = new JsonObject();
    ArrayList<String> keys = new ArrayList<>();
    for (Map.Entry<String, JsonElement> entry : source.entrySet()) {
      keys.add(entry.getKey());
    }
    Collections.sort(keys);
    for (String key : keys) {
      if (isFeatureRoot && "id".equals(key)) {
        continue;
      }
      JsonElement value = source.get(key);
      if ("properties".equals(key) && value != null && value.isJsonObject()) {
        sanitized.add(key, sanitizeFeatureDiffProperties(value.getAsJsonObject()));
        continue;
      }
      sanitized.add(key, sanitizeFeatureDiffElement(value));
    }
    return sanitized;
  }

  private static JsonObject sanitizeFeatureDiffProperties(JsonObject properties) {
    JsonObject sanitized = new JsonObject();
    ArrayList<String> keys = new ArrayList<>();
    for (Map.Entry<String, JsonElement> entry : properties.entrySet()) {
      keys.add(entry.getKey());
    }
    Collections.sort(keys);
    for (String key : keys) {
      if (TRANSIENT_VISUAL_PROPERTY_KEYS.contains(key)) {
        continue;
      }
      sanitized.add(key, sanitizeFeatureDiffElement(properties.get(key)));
    }
    return sanitized;
  }

  private static JsonElement sanitizeFeatureDiffElement(JsonElement element) {
    if (element == null || element.isJsonNull()) {
      return JsonNull.INSTANCE;
    }
    if (element.isJsonObject()) {
      return sanitizeFeatureDiffObject(element.getAsJsonObject(), false);
    }
    if (element.isJsonArray()) {
      JsonArray sanitized = new JsonArray();
      for (JsonElement child : element.getAsJsonArray()) {
        sanitized.add(sanitizeFeatureDiffElement(child));
      }
      return sanitized;
    }
    return element.deepCopy();
  }

  private static String canonicalizeJsonElement(JsonElement element) {
    if (element == null || element.isJsonNull()) {
      return "null";
    }
    if (element.isJsonObject()) {
      JsonObject object = element.getAsJsonObject();
      ArrayList<String> keys = new ArrayList<>();
      for (Map.Entry<String, JsonElement> entry : object.entrySet()) {
        keys.add(entry.getKey());
      }
      Collections.sort(keys);
      StringBuilder builder = new StringBuilder("{");
      for (int index = 0; index < keys.size(); index += 1) {
        String key = keys.get(index);
        if (index > 0) {
          builder.append(',');
        }
        builder.append(JSONObject.quote(key));
        builder.append(':');
        builder.append(canonicalizeJsonElement(object.get(key)));
      }
      builder.append('}');
      return builder.toString();
    }
    if (element.isJsonArray()) {
      JsonArray array = element.getAsJsonArray();
      StringBuilder builder = new StringBuilder("[");
      for (int index = 0; index < array.size(); index += 1) {
        if (index > 0) {
          builder.append(',');
        }
        builder.append(canonicalizeJsonElement(array.get(index)));
      }
      builder.append(']');
      return builder.toString();
    }
    JsonPrimitive primitive = element.getAsJsonPrimitive();
    if (primitive.isString()) {
      return JSONObject.quote(primitive.getAsString());
    }
    if (primitive.isBoolean()) {
      return primitive.getAsBoolean() ? "true" : "false";
    }
    return primitive.getAsString();
  }

  private void settleEnterAfterRenderedFrame(String instanceId, String requestKey) {
    Runnable revealFrameFallback = revealFrameFallbackRunnables.remove(instanceId);
    if (revealFrameFallback != null) {
      mainHandler.removeCallbacks(revealFrameFallback);
    }
    InstanceState state = instances.get(instanceId);
    if (state == null) {
      return;
    }
    if (!stringEquals(state.lastEnterRequestKey, requestKey)) {
      return;
    }
    if (!stringEquals(state.lastEnterStartedRequestKey, requestKey)) {
      return;
    }
    if (stringEquals(state.lastEnterSettledRequestKey, requestKey)) {
      return;
    }
    if (state.lastDismissRequestKey != null) {
      return;
    }
    state.enterLane.liveBaseline = state.enterLane.entering;
    state.enterLane.requestedRequestKey = null;
    state.enterLane.mountedHidden = null;
    state.enterLane.armed = null;
    state.enterLane.entering = null;
    state.lastEnterSettledRequestKey = requestKey;
    state.pendingPresentationSettleRequestKey = null;
    state.pendingPresentationSettleKind = null;
    state.blockedPresentationSettleRequestKey = null;
    state.blockedPresentationSettleKind = null;
    state.blockedPresentationCommitFenceDataIdsBySourceId.clear();
    state.currentPresentationRenderPhase = "live";
    state.visualSourceLifecycleState = VISUAL_SOURCE_VISIBLE;
    state.keepSourcesHiddenUntilEnter = false;
    state.currentPresentationOpacityTarget = 1;
    state.currentPresentationOpacityValue = 1;
    instances.put(instanceId, state);
    WritableMap settledEvent = Arguments.createMap();
    settledEvent.putString("type", "presentation_enter_settled");
    settledEvent.putString("instanceId", instanceId);
    settledEvent.putString("requestKey", requestKey);
    settledEvent.putString(
      "frameGenerationId",
      state.enterLane.liveBaseline != null ? state.enterLane.liveBaseline.generationId : null
    );
    settledEvent.putString(
      "executionBatchId",
      state.enterLane.liveBaseline != null ? state.enterLane.liveBaseline.batchId : null
    );
    settledEvent.putDouble("settledAtMs", nowMs());
    emit(settledEvent);
  }

  private void settleDismissAfterRenderedFrame(String instanceId, String requestKey) {
    Runnable dismissFrameFallback = dismissFrameFallbackRunnables.remove(instanceId);
    if (dismissFrameFallback != null) {
      mainHandler.removeCallbacks(dismissFrameFallback);
    }
    Runnable deferredDismissSourceCleanup = deferredDismissSourceCleanupRunnables.remove(instanceId);
    if (deferredDismissSourceCleanup != null) {
      mainHandler.removeCallbacks(deferredDismissSourceCleanup);
    }
    InstanceState state = instances.get(instanceId);
    if (state == null) {
      return;
    }
    if (!stringEquals(state.lastDismissRequestKey, requestKey)) {
      return;
    }
    completeDismissVisualLifecycle(instanceId, state, requestKey, "exit_settled");
    state = instances.get(instanceId);
    if (state == null) {
      return;
    }
    WritableMap settledEvent = Arguments.createMap();
    settledEvent.putString("type", "presentation_exit_settled");
    settledEvent.putString("instanceId", instanceId);
    settledEvent.putString("requestKey", requestKey);
    settledEvent.putString("frameGenerationId", state.activeFrameGenerationId);
    settledEvent.putDouble("settledAtMs", nowMs());
    emit(settledEvent);
  }

  private static Map<String, Feature> toFeatureMap(List<FeatureRecord> features) {
    Map<String, Feature> next = new HashMap<>();
    for (FeatureRecord feature : features) {
      next.put(feature.id, feature.feature);
    }
    return next;
  }

  private static Map<String, ArrayList<FeatureRecord>> groupFeaturesByMarkerKey(
    ParsedFeatureCollection collection
  ) {
    Map<String, ArrayList<FeatureRecord>> grouped = new HashMap<>();
    for (String featureId : collection.idsInOrder) {
      Feature feature = collection.featureById.get(featureId);
      if (feature == null) {
        continue;
      }
      String markerKey =
        collection.markerKeyByFeatureId.containsKey(featureId)
          ? collection.markerKeyByFeatureId.get(featureId)
          : featureId;
      grouped.computeIfAbsent(markerKey, ignored -> new ArrayList<>()).add(new FeatureRecord(featureId, feature));
    }
    return grouped;
  }

  private static ParsedFeatureCollection makeParsedFeatureCollection(
    List<FeatureRecord> features
  ) {
    return makeParsedFeatureCollection(features, new HashMap<>(), new HashMap<>());
  }

  private static ParsedFeatureCollection makeParsedFeatureCollection(
    List<FeatureRecord> features,
    Map<String, HashMap<String, Value>> featureStateById
  ) {
    return makeParsedFeatureCollection(features, featureStateById, new HashMap<>());
  }

  private static ParsedFeatureCollection makeParsedFeatureCollection(
    List<FeatureRecord> features,
    Map<String, HashMap<String, Value>> featureStateById,
    Map<String, String> markerKeyByFeatureId
  ) {
    ArrayList<String> idsInOrder = new ArrayList<>(features.size());
    Map<String, Feature> featureById = new HashMap<>(features.size());
    for (FeatureRecord feature : features) {
      idsInOrder.add(feature.id);
      featureById.put(feature.id, feature.feature);
    }
    return makeParsedFeatureCollection(
      idsInOrder,
      featureById,
      featureStateById,
      markerKeyByFeatureId
    );
  }

  private static ParsedFeatureCollection makeParsedFeatureCollection(
    List<String> idsInOrder,
    Map<String, Feature> featureById,
    Map<String, HashMap<String, Value>> featureStateById,
    Map<String, String> markerKeyByFeatureId
  ) {
    ParsedFeatureCollection collection = new ParsedFeatureCollection();
    for (String featureId : idsInOrder) {
      Feature feature = featureById.get(featureId);
      if (feature == null) {
        continue;
      }
      collection.idsInOrder.add(featureId);
      collection.featureById.put(featureId, feature);
      String diffKey = makeFeatureDiffKey(feature);
      if (diffKey != null) {
        collection.diffKeyById.put(featureId, diffKey);
      }
      if (featureStateById.containsKey(featureId)) {
        collection.featureStateById.put(featureId, featureStateById.get(featureId));
        collection.featureStateEntryRevisionById.put(
          featureId,
          buildFeatureStateEntryRevision(featureStateById.get(featureId))
        );
      }
      collection.markerKeyByFeatureId.put(featureId, markerKeyByFeatureId.containsKey(featureId) ? markerKeyByFeatureId.get(featureId) : featureId);
    }
    collection.featureIds.addAll(collection.idsInOrder);
    collection.featureStateChangedIds.addAll(collection.featureStateEntryRevisionById.keySet());
    collection.addedFeatureIdsInOrder.addAll(collection.idsInOrder);
    for (String featureId : collection.addedFeatureIdsInOrder) {
      Feature feature = collection.featureById.get(featureId);
      if (feature != null) {
        collection.addedFeatures.add(feature);
      }
    }
    collection.sourceRevision = buildParsedCollectionRevision(collection.idsInOrder, collection.diffKeyById);
    collection.featureStateRevision =
      buildFeatureStateRevisionFromEntries(collection.featureStateEntryRevisionById);
    return collection;
  }

  private static ParsedFeatureCollection parsedCollectionBase(SourceState sourceState) {
    ParsedFeatureCollection collection = new ParsedFeatureCollection();
    collection.baseSourceRevision = sourceState.sourceRevision;
    collection.baseFeatureStateRevision = sourceState.featureStateRevision;
    collection.sourceRevision = sourceState.sourceRevision;
    collection.featureStateRevision = sourceState.featureStateRevision;
    collection.dirtyGroupIds.clear();
    collection.orderChangedGroupIds.clear();
    collection.removedGroupIds.clear();
    collection.featureStateEntryRevisionById.putAll(sourceState.featureStateEntryRevisionById);
    collection.idsInOrder.addAll(sourceState.idsInOrder);
    collection.featureIds.addAll(sourceState.featureIds);
    collection.diffKeyById.putAll(sourceState.diffKeyById);
    collection.featureStateById.putAll(sourceState.featureStateById);
    collection.markerKeyByFeatureId.putAll(sourceState.markerKeyByFeatureId);
    return collection;
  }

  private static ArrayList<String> assertUniqueOrderedFeatureIds(
    List<String> sourceIdsInOrder,
    String context
  ) {
    LinkedHashSet<String> seenFeatureIds = new LinkedHashSet<>();
    ArrayList<String> idsInOrder = new ArrayList<>(sourceIdsInOrder.size());
    for (String featureId : sourceIdsInOrder) {
      if (featureId == null || featureId.isEmpty()) {
        throw new IllegalStateException("Missing feature id in " + context);
      }
      if (!seenFeatureIds.add(featureId)) {
        throw new IllegalStateException("Duplicate feature id " + featureId + " in " + context);
      }
      idsInOrder.add(featureId);
    }
    return idsInOrder;
  }

  private static LinkedHashSet<String> assertUniqueStringSet(
    List<String> values,
    String context
  ) {
    LinkedHashSet<String> nextValues = new LinkedHashSet<>();
    for (String value : values) {
      if (value == null || value.isEmpty()) {
        throw new IllegalStateException("Missing value in " + context);
      }
      if (!nextValues.add(value)) {
        throw new IllegalStateException("Duplicate value " + value + " in " + context);
      }
    }
    return nextValues;
  }

  private static void replaceParsedFeatureCollection(
    ParsedFeatureCollection collection,
    SourceState baseSourceState,
    List<String> sourceIdsInOrder,
    Map<String, Feature> featureById,
    Map<String, HashMap<String, Value>> featureStateById,
    Map<String, String> markerKeyByFeatureId,
    Set<String> explicitDirtyGroupIds,
    Set<String> explicitOrderChangedGroupIds,
    Set<String> explicitRemovedGroupIds
  ) {
    ParsedFeatureCollection base = baseSourceState != null ? parsedCollectionBase(baseSourceState) : collection;
    Map<String, Feature> previousFeatureById = new HashMap<>(collection.featureById);
    Map<String, String> previousDiffKeyById = new HashMap<>(collection.diffKeyById);
    Map<String, String> previousFeatureStateEntryRevisionById =
      new HashMap<>(collection.featureStateEntryRevisionById);
    Map<String, HashMap<String, Value>> previousFeatureStateById = new HashMap<>(collection.featureStateById);
    clearParsedFeatureCollection(collection);
    ArrayList<String> dedupedSourceIdsInOrder =
      assertUniqueOrderedFeatureIds(sourceIdsInOrder, "replaceParsedFeatureCollection");
    boolean matchesBaseSourceShape = base.idsInOrder.size() == dedupedSourceIdsInOrder.size();
    int index = 0;
    for (String featureId : dedupedSourceIdsInOrder) {
      Feature feature = featureById.get(featureId);
      if (feature == null) {
        throw new IllegalStateException(
          "Missing feature " + featureId + " in replaceParsedFeatureCollection"
        );
      }
      collection.idsInOrder.add(featureId);
      collection.featureById.put(featureId, feature);
      if (matchesBaseSourceShape && !Objects.equals(base.idsInOrder.get(index), featureId)) {
        matchesBaseSourceShape = false;
      }
      index += 1;
      String diffKey =
        Objects.equals(previousFeatureById.get(featureId), feature)
          ? previousDiffKeyById.get(featureId)
          : makeFeatureDiffKey(feature);
      if (diffKey != null) {
        collection.diffKeyById.put(featureId, diffKey);
        if (matchesBaseSourceShape && !Objects.equals(base.diffKeyById.get(featureId), diffKey)) {
          matchesBaseSourceShape = false;
        }
      } else {
        matchesBaseSourceShape = false;
      }
      if (featureStateById.containsKey(featureId)) {
        HashMap<String, Value> nextFeatureState = featureStateById.get(featureId);
        collection.featureStateById.put(featureId, nextFeatureState);
        collection.featureStateEntryRevisionById.put(
          featureId,
          Objects.equals(nextFeatureState, previousFeatureStateById.get(featureId)) &&
          previousFeatureStateEntryRevisionById.containsKey(featureId)
            ? previousFeatureStateEntryRevisionById.get(featureId)
            : buildFeatureStateEntryRevision(nextFeatureState)
        );
      }
      collection.markerKeyByFeatureId.put(
        featureId,
        markerKeyByFeatureId.containsKey(featureId) ? markerKeyByFeatureId.get(featureId) : featureId
      );
      String groupId = collection.markerKeyByFeatureId.get(featureId);
      if (!collection.groupedFeatureIdsByGroup.containsKey(groupId)) {
        collection.groupOrder.add(groupId);
        collection.groupedFeatureIdsByGroup.put(groupId, new ArrayList<>());
      }
      collection.groupedFeatureIdsByGroup.get(groupId).add(featureId);
    }
    collection.featureIds.addAll(collection.idsInOrder);
    for (String featureId : collection.featureStateEntryRevisionById.keySet()) {
      if (
        !Objects.equals(
          base.featureStateEntryRevisionById.get(featureId),
          collection.featureStateEntryRevisionById.get(featureId)
        )
      ) {
        collection.featureStateChangedIds.add(featureId);
      }
    }
    for (String featureId : collection.idsInOrder) {
      if (!base.featureIds.contains(featureId)) {
        collection.addedFeatureIdsInOrder.add(featureId);
        Feature feature = collection.featureById.get(featureId);
        if (feature != null) {
          collection.addedFeatures.add(feature);
        }
      } else if (!Objects.equals(base.diffKeyById.get(featureId), collection.diffKeyById.get(featureId))) {
        collection.updatedFeatureIdsInOrder.add(featureId);
        Feature feature = collection.featureById.get(featureId);
        if (feature != null) {
          collection.updatedFeatures.add(feature);
        }
      }
    }
    for (String previousFeatureId : base.featureIds) {
      if (!collection.featureIds.contains(previousFeatureId)) {
        collection.removedFeatureIds.add(previousFeatureId);
        collection.removedFeatureIdsInOrder.add(previousFeatureId);
      }
    }
    collection.baseSourceRevision = base.sourceRevision;
    collection.baseFeatureStateRevision = base.featureStateRevision;
    collection.sourceRevision =
      matchesBaseSourceShape
        ? base.sourceRevision
        : buildParsedCollectionRevision(collection.idsInOrder, collection.diffKeyById);
    collection.featureStateRevision =
      base.featureStateEntryRevisionById.equals(collection.featureStateEntryRevisionById)
        ? base.featureStateRevision
        : buildFeatureStateRevisionFromEntries(collection.featureStateEntryRevisionById);
    collection.dirtyGroupIds.addAll(explicitDirtyGroupIds);
    collection.orderChangedGroupIds.addAll(explicitOrderChangedGroupIds);
    collection.removedGroupIds.addAll(explicitRemovedGroupIds);
  }

  private void emit(WritableMap event) {
    ReactApplicationContext reactContext = getReactApplicationContext();
    if (!reactContext.hasActiveCatalystInstance()) {
      return;
    }
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
      .emit(EVENT_NAME, event);
  }

  private void emitError(String instanceId, String message) {
    WritableMap event = Arguments.createMap();
    event.putString("type", "error");
    event.putString("instanceId", instanceId);
    event.putString("message", message);
    emit(event);
  }

  private void emitVisualDiag(String instanceId, String message) {
    if (!ENABLE_VISUAL_DIAGNOSTICS) {
      return;
    }
    emitError("__native_diag__", message);
  }

  private static int readFeatureCount(String json) {
    if (json == null) {
      return 0;
    }
    try {
      JSONObject object = new JSONObject(json);
      JSONArray features = object.optJSONArray("features");
      return features != null ? features.length() : 0;
    } catch (Exception error) {
      return 0;
    }
  }

  private static VisualFrameTransaction parseVisualFrameTransaction(ReadableMap payload) {
    if (!payload.hasKey("visualFrameTransaction") || payload.isNull("visualFrameTransaction")) {
      throw new IllegalArgumentException("invalid render frame payload: missing visualFrameTransaction");
    }
    ReadableMap rawTransaction = payload.getMap("visualFrameTransaction");
    if (
      rawTransaction == null ||
      !rawTransaction.hasKey("kind") ||
      rawTransaction.isNull("kind") ||
      !rawTransaction.hasKey("presentationPhase") ||
      rawTransaction.isNull("presentationPhase") ||
      !rawTransaction.hasKey("sourceFrameKey") ||
      rawTransaction.isNull("sourceFrameKey") ||
      !rawTransaction.hasKey("sourceDataKey") ||
      rawTransaction.isNull("sourceDataKey") ||
      !rawTransaction.hasKey("sourceSnapshotKind") ||
      rawTransaction.isNull("sourceSnapshotKind")
    ) {
      throw new IllegalArgumentException("invalid render frame payload: incomplete visualFrameTransaction");
    }
    String kind = rawTransaction.getString("kind");
    String presentationPhase = rawTransaction.getString("presentationPhase");
    String sourceSnapshotKind = rawTransaction.getString("sourceSnapshotKind");
    if (
      !(
        "bootstrap".equals(kind) ||
        "hidden_preload".equals(kind) ||
        "enter".equals(kind) ||
        "live_update".equals(kind) ||
        "dismiss".equals(kind) ||
        "clear_hidden".equals(kind)
      ) ||
      !(
        "idle".equals(presentationPhase) ||
        "covered".equals(presentationPhase) ||
        "enter_requested".equals(presentationPhase) ||
        "entering".equals(presentationPhase) ||
        "live".equals(presentationPhase) ||
        "exit_preroll".equals(presentationPhase) ||
        "exiting".equals(presentationPhase)
      ) ||
      !("pending".equals(sourceSnapshotKind) || "ready".equals(sourceSnapshotKind) || "empty".equals(sourceSnapshotKind))
    ) {
      throw new IllegalArgumentException("invalid render frame payload: unsupported visualFrameTransaction");
    }
    VisualFrameTransaction transaction = new VisualFrameTransaction();
    transaction.kind = kind;
    transaction.presentationPhase = presentationPhase;
    transaction.requestKey =
      rawTransaction.hasKey("requestKey") && !rawTransaction.isNull("requestKey")
        ? rawTransaction.getString("requestKey")
        : null;
    transaction.visualCycleKey =
      rawTransaction.hasKey("visualCycleKey") && !rawTransaction.isNull("visualCycleKey")
        ? rawTransaction.getString("visualCycleKey")
        : null;
    transaction.readinessKey =
      rawTransaction.hasKey("readinessKey") && !rawTransaction.isNull("readinessKey")
        ? rawTransaction.getString("readinessKey")
        : null;
    transaction.shortcutCoverageRequestKey =
      rawTransaction.hasKey("shortcutCoverageRequestKey") &&
      !rawTransaction.isNull("shortcutCoverageRequestKey")
        ? rawTransaction.getString("shortcutCoverageRequestKey")
        : null;
    transaction.markersRenderKey =
      rawTransaction.hasKey("markersRenderKey") && !rawTransaction.isNull("markersRenderKey")
        ? rawTransaction.getString("markersRenderKey")
        : null;
    transaction.sourceFrameKey = rawTransaction.getString("sourceFrameKey");
    transaction.sourceDataKey = rawTransaction.getString("sourceDataKey");
    transaction.sourceSnapshotKind = sourceSnapshotKind;
    return transaction;
  }

  private static String readPresentationBatchPhase(String json) {
    if (json == null) {
      return "unknown";
    }
    try {
      JSONObject object = new JSONObject(json);
      String executionStage = object.optString("executionStage", "idle");
      String snapshotKind = object.optString("snapshotKind", null);
      if ("results_exit".equals(snapshotKind)) {
        if ("exit_executing".equals(executionStage)) {
          return "exiting";
        }
        if ("exit_requested".equals(executionStage)) {
          return "exit_preroll";
        }
      } else if (snapshotKind != null && !"null".equals(snapshotKind)) {
        if ("enter_executing".equals(executionStage)) {
          return "entering";
        }
        if (
          "enter_pending_mount".equals(executionStage) ||
          "enter_mounted_hidden".equals(executionStage)
        ) {
          return "enter_requested";
        }
        if ("settled".equals(executionStage)) {
          return "live";
        }
      }
      if ("initial_loading".equals(object.optString("coverState", null))) {
        return "covered";
      }
      return "idle";
    } catch (Exception error) {
      return "unknown";
    }
  }

  private static String readDismissRequestKey(String json) {
    if (json == null) {
      return null;
    }
    try {
      JSONObject object = new JSONObject(json);
      if ("results_exit".equals(object.optString("snapshotKind", null))) {
        return object.optString("transactionId", null);
      }
      return null;
    } catch (Exception error) {
      return null;
    }
  }

  private static String readEnterRequestKey(String json) {
    if (json == null) {
      return null;
    }
    try {
      JSONObject object = new JSONObject(json);
      String snapshotKind = object.optString("snapshotKind", null);
      if (snapshotKind != null && !"results_exit".equals(snapshotKind) && !"null".equals(snapshotKind)) {
        String requestKey = object.optString("transactionId", null);
        return requestKey != null && !"null".equals(requestKey) ? requestKey : null;
      }
      return null;
    } catch (Exception error) {
      return null;
    }
  }

  private static String readEnterStatus(String json) {
    if (json == null) {
      return null;
    }
    try {
      JSONObject object = new JSONObject(json);
      String snapshotKind = object.optString("snapshotKind", null);
      if (snapshotKind != null && !"results_exit".equals(snapshotKind) && !"null".equals(snapshotKind)) {
        String executionStage = object.optString("executionStage", null);
        if ("enter_pending_mount".equals(executionStage)) {
          return "pending_mount";
        }
        if ("enter_mounted_hidden".equals(executionStage)) {
          return "mounted_hidden";
        }
        if ("enter_executing".equals(executionStage)) {
          return "entering";
        }
        return null;
      }
      return null;
    } catch (Exception error) {
      return null;
    }
  }

  private static Double readEnterStartToken(String json) {
    if (json == null) {
      return null;
    }
    try {
      JSONObject object = new JSONObject(json);
      String snapshotKind = object.optString("snapshotKind", null);
      if (snapshotKind != null && !"results_exit".equals(snapshotKind) && !"null".equals(snapshotKind)) {
        if (object.isNull("startToken")) {
          return null;
        }
        return object.getDouble("startToken");
      }
      return null;
    } catch (Exception error) {
      return null;
    }
  }

  private static boolean isEnterStatusArmable(String status) {
    return "pending_mount".equals(status) || "mounted_hidden".equals(status) || "entering".equals(status);
  }

  private static boolean shouldHidePresentationWithoutActiveRequests(String phase) {
    return "covered".equals(phase) ||
      "enter_requested".equals(phase) ||
      "entering".equals(phase) ||
      "exit_preroll".equals(phase) ||
      "exiting".equals(phase);
  }

  private static boolean readAllowEmptyEnter(String json) {
    if (json == null) {
      return true;
    }
    try {
      JSONObject object = new JSONObject(json);
      return object.isNull("allowEmptyEnter") ? true : object.getBoolean("allowEmptyEnter");
    } catch (Exception error) {
      return true;
    }
  }

  private static boolean stringEquals(String left, String right) {
    if (left == null) {
      return right == null;
    }
    return left.equals(right);
  }

  private static boolean doubleEquals(Double left, Double right) {
    if (left == null) {
      return right == null;
    }
    if (right == null) {
      return false;
    }
    return Double.compare(left.doubleValue(), right.doubleValue()) == 0;
  }

  private static double nowMs() {
    return (double) System.currentTimeMillis();
  }

  private static boolean allowsIncrementalMarkerTransitions(
    InstanceState state,
    boolean allowNewTransitions
  ) {
    return allowNewTransitions &&
      "live".equals(state.lastPresentationBatchPhase) &&
      state.lastDismissRequestKey == null;
  }

  private static final String EMPTY_FEATURE_COLLECTION_JSON =
    "{\"type\":\"FeatureCollection\",\"features\":[]}";
}
