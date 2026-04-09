package com.crave;

import androidx.annotation.NonNull;

import android.graphics.RectF;
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
  private static final boolean ENABLE_VISUAL_DIAGNOSTICS = true;
  private static final long REVEAL_SETTLE_DELAY_MS = 300L;
  private static final long DISMISS_SETTLE_DELAY_MS = 300L;
  private static final long FRAME_SETTLE_FALLBACK_DELAY_MS = 96L;
  private static final long SOURCE_RECOVERY_RETRY_DELAY_MS = 32L;
  private static final long LIVE_PIN_TRANSITION_DURATION_MS = 180L;
  private static final double SLOW_ACTION_THRESHOLD_MS = 40d;
  private static final double NATIVE_VIEWPORT_EVENT_THROTTLE_MS = 16d;
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

    ParsedCollectionApplyPlan(
      String sourceId,
      ParsedFeatureCollection next,
      SourceState previousSourceState,
      Map<String, HashMap<String, Value>> previousFeatureStateById,
      String previousFeatureStateRevision
    ) {
      this.sourceId = sourceId;
      this.next = next;
      this.previousSourceState = previousSourceState;
      this.previousFeatureStateById = previousFeatureStateById;
      this.previousFeatureStateRevision = previousFeatureStateRevision;
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

    ResolvedParsedCollectionApplyPlan(
      String sourceId,
      ParsedFeatureCollection next,
      SourceLifecyclePhase previousSourceLifecyclePhase,
      String previousSourceRevision,
      Map<String, HashMap<String, Value>> previousFeatureStateById,
      String previousFeatureStateRevision,
      SourceState nextSourceState
    ) {
      this.sourceId = sourceId;
      this.next = next;
      this.previousSourceLifecyclePhase = previousSourceLifecyclePhase;
      this.previousSourceRevision = previousSourceRevision;
      this.previousFeatureStateById = previousFeatureStateById;
      this.previousFeatureStateRevision = previousFeatureStateRevision;
      this.nextSourceState = nextSourceState;
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
    final String pinSourceId;
    final long pinStartedAtNs;

    PreparedDerivedPinAndLabelOutput(
      List<ParsedCollectionApplyPlan> plans,
      String pinSourceId,
      long pinStartedAtNs
    ) {
      this.plans = plans;
      this.pinSourceId = pinSourceId;
      this.pinStartedAtNs = pinStartedAtNs;
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
    boolean allowFallback = false;
    boolean commitInteractionVisibility = false;
    double refreshMsIdle = 0d;
    double refreshMsMoving = 0d;
    boolean stickyEnabled = false;
    double stickyLockStableMsMoving = 0d;
    double stickyLockStableMsIdle = 0d;
    double stickyUnlockMissingMsMoving = 0d;
    double stickyUnlockMissingMsIdle = 0d;
    int stickyUnlockMissingStreakMoving = 1;
    String configuredResetRequestKey = null;
    final ArrayList<String> lastVisibleLabelFeatureIds = new ArrayList<>();
    int lastLayerRenderedFeatureCount = 0;
    int lastEffectiveRenderedFeatureCount = 0;
    int stickyRevision = 0;
    final Map<String, String> stickyCandidateByIdentity = new HashMap<>();
    // Track loss of the committed candidate, not just visibility of any candidate for an
    // identity. That keeps the lock asymmetrical: a committed side should stay put until that
    // committed side is actually displaced for long enough to unlock.
    final Map<String, Double> stickyCommittedLastSeenAtMsByIdentity = new HashMap<>();
    final Map<String, Integer> stickyCommittedMissingStreakByIdentity = new HashMap<>();
    final Map<String, String> stickyProposedCandidateByIdentity = new HashMap<>();
    final Map<String, Double> stickyProposedSinceAtMsByIdentity = new HashMap<>();
    String lastResetRequestKey = null;
    boolean isRefreshInFlight = false;
    Double queuedRefreshDelayMs = null;
    int movingNoopRefreshStreak = 0;
    double movingAdaptiveRefreshMs = 0d;
  }

  private static final class RenderedPlacedLabelObservation {
    final String markerKey;
    final String candidate;
    final String restaurantId;

    RenderedPlacedLabelObservation(String markerKey, String candidate, String restaurantId) {
      this.markerKey = markerKey;
      this.candidate = candidate;
      this.restaurantId = restaurantId;
    }
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
    String dotInteractionSourceId;
    String labelSourceId;
    String labelInteractionSourceId;
    String labelCollisionSourceId;
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
    String lastPresentationStateJson;
    String activeFrameGenerationId;
    String activeExecutionBatchId;
    String highlightedMarkerKey;
    String interactionMode;
    int ownerEpoch;
    boolean isOwnerInvalidated;
    boolean allowEmptyEnter = true;
    double currentPresentationOpacityTarget;
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
    boolean currentViewportIsMoving = false;
    boolean isAwaitingSourceRecovery;
    Double sourceRecoveryPausedAtMs;
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
    final ArrayList<RenderedPlacedLabelObservation> placedLabels = new ArrayList<>();
  }

  private static final class DotObservationResult {
    final ArrayList<String> restaurantIds = new ArrayList<>();
    final ArrayList<WritableMap> renderedDots = new ArrayList<>();
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
  private final Map<String, Runnable> sourceRecoveryRunnables = new ConcurrentHashMap<>();
  private final Map<String, Runnable> livePinTransitionRunnables = new ConcurrentHashMap<>();
  private final Map<String, Runnable> labelObservationRefreshRunnables = new ConcurrentHashMap<>();
  private final Map<String, Cancelable> sourceDataLoadedSubscriptions = new ConcurrentHashMap<>();
  private final Map<String, Cancelable> styleLoadedSubscriptions = new ConcurrentHashMap<>();
  private final Map<String, Cancelable> cameraChangedSubscriptions = new ConcurrentHashMap<>();
  private final Map<String, OnMapIdleListener> mapIdleListeners = new ConcurrentHashMap<>();
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
    InstanceState state = new InstanceState();
    state.mapTag = payload.hasKey("mapTag") ? payload.getInt("mapTag") : 0;
    state.pinSourceId =
      payload.hasKey("pinSourceId") ? payload.getString("pinSourceId") : "restaurant-style-pins-source";
    state.pinInteractionSourceId =
      payload.hasKey("pinInteractionSourceId")
        ? payload.getString("pinInteractionSourceId")
        : "restaurant-pin-interaction-source";
    state.dotSourceId =
      payload.hasKey("dotSourceId") ? payload.getString("dotSourceId") : "restaurant-dot-source";
    state.dotInteractionSourceId =
      payload.hasKey("dotInteractionSourceId")
        ? payload.getString("dotInteractionSourceId")
        : "restaurant-dot-interaction-source";
    state.labelSourceId =
      payload.hasKey("labelSourceId") ? payload.getString("labelSourceId") : "restaurant-source";
    state.labelInteractionSourceId =
      payload.hasKey("labelInteractionSourceId")
        ? payload.getString("labelInteractionSourceId")
        : "restaurant-label-interaction-source";
    state.labelCollisionSourceId =
      payload.hasKey("labelCollisionSourceId")
        ? payload.getString("labelCollisionSourceId")
        : "restaurant-label-collision-source";
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
    state.lastPresentationStateJson = null;
    state.activeFrameGenerationId = null;
    state.activeExecutionBatchId = null;
    state.highlightedMarkerKey = null;
    state.interactionMode = "enabled";
    state.ownerEpoch = allocateOwnerEpoch();
    state.isOwnerInvalidated = false;
    state.currentPresentationOpacityTarget = 1;
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
      String presentationStateJson =
        payload.hasKey("presentationStateJson") ? payload.getString("presentationStateJson") : null;
      boolean shouldBypassSnapshotApply =
        presentationStateJson != null &&
        readDismissRequestKey(presentationStateJson) != null &&
        (sourceDeltas == null || sourceDeltas.size() == 0);
      boolean didSyncResidentFrame;
      if (shouldBypassSnapshotApply) {
        InstanceState state = instances.get(instanceId);
        if (state == null) {
          throw new IllegalStateException("unknown instance");
        }
        state.activeFrameGenerationId = frameGenerationId;
        state.activeExecutionBatchId = executionBatchId;
        instances.put(instanceId, state);
        emitVisualDiag(
          instanceId,
          "frame_snapshot_bypass reason=dismiss_presentation_only phase=" +
          state.lastPresentationBatchPhase
        );
        applyPresentationPayload(instanceId, presentationStateJson);
        didSyncResidentFrame = true;
      } else {
        didSyncResidentFrame = applyRenderFrameSnapshotPayload(
          instanceId,
          frameGenerationId,
          executionBatchId,
          sourceDeltas
        );
        applyPresentationPayload(instanceId, presentationStateJson);
      }
      applyInteractionModePayload(
        instanceId,
        payload.hasKey("interactionMode") ? payload.getString("interactionMode") : "enabled"
      );
      applyHighlightedMarkerPayload(
        instanceId,
        payload.hasKey("highlightedMarkerKey") && !payload.isNull("highlightedMarkerKey")
          ? payload.getString("highlightedMarkerKey")
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
        WritableMap sourceRevisions = Arguments.createMap();
        sourceRevisions.putString(
          "pins",
          mountedSourceState(state, state.pinSourceId) != null
            ? mountedSourceState(state, state.pinSourceId).sourceRevision
            : ""
        );
        sourceRevisions.putString(
          "pinInteractions",
          mountedSourceState(state, state.pinInteractionSourceId) != null
            ? mountedSourceState(state, state.pinInteractionSourceId).sourceRevision
            : ""
        );
        sourceRevisions.putString(
          "dots",
          mountedSourceState(state, state.dotSourceId) != null
            ? mountedSourceState(state, state.dotSourceId).sourceRevision
            : ""
        );
        sourceRevisions.putString(
          "dotInteractions",
          mountedSourceState(state, state.dotInteractionSourceId) != null
            ? mountedSourceState(state, state.dotInteractionSourceId).sourceRevision
            : ""
        );
        sourceRevisions.putString(
          "labels",
          mountedSourceState(state, state.labelSourceId) != null
            ? mountedSourceState(state, state.labelSourceId).sourceRevision
            : ""
        );
        sourceRevisions.putString(
          "labelInteractions",
          mountedSourceState(state, state.labelInteractionSourceId) != null
            ? mountedSourceState(state, state.labelInteractionSourceId).sourceRevision
            : ""
        );
        sourceRevisions.putString(
          "labelCollisions",
          mountedSourceState(state, state.labelCollisionSourceId) != null
            ? mountedSourceState(state, state.labelCollisionSourceId).sourceRevision
            : ""
        );
        event.putMap("sourceRevisions", sourceRevisions);
        emit(event);
        maybeEmitExecutionBatchArmed(instanceId, state);
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

  @ReactMethod
  public void notifyFrameRendered(String instanceId, Promise promise) {
    promise.resolve(null);
  }

  private boolean applyRenderFrameSnapshotPayload(
    String instanceId,
    String generationId,
    String executionBatchId,
    ReadableArray sourceDeltas
  ) throws Exception {
    InstanceState state = instances.get(instanceId);
    if (state == null) {
      throw new IllegalStateException("unknown instance");
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
    if (sourceDeltas != null) {
      for (ParsedFeatureCollectionDelta delta : parseSourceDeltas(sourceDeltas)) {
        DerivedFamilyState familyState = derivedFamilyState(state, delta.sourceId);
        copyParsedFeatureCollection(
          applyParsedCollectionDelta(delta, familyState.desiredCollection),
          familyState.desiredCollection
        );
      }
    }
    ParsedFeatureCollection retainedPins = derivedFamilyState(state, state.pinSourceId).desiredCollection;
    ParsedFeatureCollection retainedDots = derivedFamilyState(state, state.dotSourceId).desiredCollection;
    ParsedFeatureCollection retainedLabels = derivedFamilyState(state, state.labelSourceId).desiredCollection;
    state.lastPinCount = retainedPins != null ? retainedPins.idsInOrder.size() : 0;
    state.lastDotCount = retainedDots != null ? retainedDots.idsInOrder.size() : 0;
    state.lastLabelCount = retainedLabels != null ? retainedLabels.idsInOrder.size() : 0;
    state.activeFrameGenerationId = generationId;
    state.activeExecutionBatchId = executionBatchId;
    instances.put(instanceId, state);
    applyDesiredFrameSnapshots(instanceId);
    state = instances.get(instanceId);
    if (state != null && state.isAwaitingSourceRecovery) {
      emitVisualDiag(
        instanceId,
        "frame_apply_deferred reason=source_recovery phase=" + state.lastPresentationBatchPhase
      );
      instances.put(instanceId, state);
      return false;
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
    applyHighlightedMarkerState(state);
    if (shouldSuppressInteractions(state)) {
      applyInteractionSuppression(state);
    }
    applyPresentationOpacity(state, state.currentPresentationOpacityTarget);
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
    return true;
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
    state.lastPresentationStateJson = presentationStateJson;
    state.lastPresentationBatchPhase = readPresentationBatchPhase(presentationStateJson);
    String revealRequestKey = readEnterRequestKey(presentationStateJson);
    String revealStatus = readEnterStatus(presentationStateJson);
    Double revealStartToken = readEnterStartToken(presentationStateJson);
    state.allowEmptyEnter = readAllowEmptyEnter(presentationStateJson);
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
      state.blockedEnterStartRequestKey = null;
      state.blockedEnterStartCommitFenceDataIdsBySourceId.clear();
      state.blockedPresentationSettleRequestKey = null;
      state.blockedPresentationSettleKind = null;
      state.blockedPresentationCommitFenceDataIdsBySourceId.clear();
      if (revealRequestKey != null) {
        resetLiveMarkerEnterState(instanceId, state, "new_reveal_request");
        state.currentPresentationRenderPhase = "reveal_preroll";
        state.currentPresentationOpacityTarget = 0;
        instances.put(instanceId, state);
        applyDesiredFrameSnapshots(instanceId);
        state = instances.get(instanceId);
        applyPresentationOpacity(state, 0);
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
    String dismissRequestKey = readDismissRequestKey(presentationStateJson);
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
        state.currentPresentationRenderPhase = "exiting";
        state.currentPresentationOpacityTarget = 0;
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
        state.currentPresentationRenderPhase = "idle".equals(state.lastPresentationBatchPhase) ? "live" : "idle";
        instances.put(instanceId, state);
        applyDesiredFrameSnapshots(instanceId);
        state = instances.get(instanceId);
        state.currentPresentationOpacityTarget = "idle".equals(state.lastPresentationBatchPhase) ? 1 : state.currentPresentationOpacityTarget;
        applyPresentationOpacity(state, state.currentPresentationOpacityTarget);
      }
    }
    if (
      state.lastDismissRequestKey == null &&
      state.lastEnterRequestKey == null &&
      shouldHidePresentationWithoutActiveRequests(state.lastPresentationBatchPhase) &&
      state.currentPresentationOpacityTarget != 0
    ) {
      state.currentPresentationOpacityTarget = 0;
      applyPresentationOpacity(state, state.currentPresentationOpacityTarget);
    }
    if (!"idle".equals(previousPresentationBatchPhase) && "idle".equals(state.lastPresentationBatchPhase)) {
      state.currentPresentationRenderPhase = "live";
      if (state.currentPresentationOpacityTarget != 1) {
        state.currentPresentationOpacityTarget = 1;
        applyPresentationOpacity(state, state.currentPresentationOpacityTarget);
      }
      instances.put(instanceId, state);
    }

  }

  private void applyHighlightedMarkerPayload(String instanceId, String markerKey) throws Exception {
    InstanceState state = instances.get(instanceId);
    if (state == null) {
      throw new IllegalStateException("unknown instance");
    }
    if (stringEquals(state.highlightedMarkerKey, markerKey)) {
      return;
    }
    state.highlightedMarkerKey = markerKey;
    instances.put(instanceId, state);
    applyHighlightedMarkerState(state);
  }

  private void applyInteractionModePayload(String instanceId, String mode) throws Exception {
    InstanceState state = instances.get(instanceId);
    if (state == null) {
      throw new IllegalStateException("unknown instance");
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
    boolean allowFallback = payload.hasKey("allowFallback") && payload.getBoolean("allowFallback");
    boolean commitInteractionVisibility =
      payload.hasKey("commitInteractionVisibility") && payload.getBoolean("commitInteractionVisibility");
    double refreshMsIdle =
      payload.hasKey("refreshMsIdle") && !payload.isNull("refreshMsIdle")
        ? payload.getDouble("refreshMsIdle")
        : 0d;
    double refreshMsMoving =
      payload.hasKey("refreshMsMoving") && !payload.isNull("refreshMsMoving")
        ? payload.getDouble("refreshMsMoving")
        : 0d;
    boolean enableStickyLabelCandidates =
      payload.hasKey("enableStickyLabelCandidates") &&
      payload.getBoolean("enableStickyLabelCandidates");
    double stickyLockStableMsMoving =
      payload.hasKey("stickyLockStableMsMoving") && !payload.isNull("stickyLockStableMsMoving")
        ? payload.getDouble("stickyLockStableMsMoving")
        : 0d;
    double stickyLockStableMsIdle =
      payload.hasKey("stickyLockStableMsIdle") && !payload.isNull("stickyLockStableMsIdle")
        ? payload.getDouble("stickyLockStableMsIdle")
        : 0d;
    double stickyUnlockMissingMsMoving =
      payload.hasKey("stickyUnlockMissingMsMoving") && !payload.isNull("stickyUnlockMissingMsMoving")
        ? payload.getDouble("stickyUnlockMissingMsMoving")
        : 0d;
    double stickyUnlockMissingMsIdle =
      payload.hasKey("stickyUnlockMissingMsIdle") && !payload.isNull("stickyUnlockMissingMsIdle")
        ? payload.getDouble("stickyUnlockMissingMsIdle")
        : 0d;
    int stickyUnlockMissingStreakMoving =
      payload.hasKey("stickyUnlockMissingStreakMoving") &&
      !payload.isNull("stickyUnlockMissingStreakMoving")
        ? payload.getInt("stickyUnlockMissingStreakMoving")
        : 1;
    String labelResetRequestKey =
      payload.hasKey("labelResetRequestKey") && !payload.isNull("labelResetRequestKey")
        ? payload.getString("labelResetRequestKey")
        : null;

    mainHandler.post(() -> {
      try {
        configureLabelObservation(
          instanceId,
          observationEnabled,
          allowFallback,
          commitInteractionVisibility,
          enableStickyLabelCandidates,
          refreshMsIdle,
          refreshMsMoving,
          stickyLockStableMsMoving,
          stickyLockStableMsIdle,
          stickyUnlockMissingMsMoving,
          stickyUnlockMissingMsIdle,
          stickyUnlockMissingStreakMoving,
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
  public void queryRenderedDotObservation(ReadableMap payload, Promise promise) {
    String instanceId = payload.hasKey("instanceId") ? payload.getString("instanceId") : null;
    if (instanceId == null) {
      promise.reject(
        "search_map_render_controller_query_rendered_dot_observation_invalid",
        "missing instanceId"
      );
      return;
    }
    InstanceState state = instances.get(instanceId);
    if (state == null) {
      promise.reject(
        "search_map_render_controller_query_rendered_dot_observation_invalid",
        "unknown instance"
      );
      return;
    }
    ArrayList<String> layerIds = new ArrayList<>();
    if (payload.hasKey("layerIds") && !payload.isNull("layerIds")) {
      com.facebook.react.bridge.ReadableArray readableLayerIds = payload.getArray("layerIds");
      if (readableLayerIds != null) {
        for (int index = 0; index < readableLayerIds.size(); index += 1) {
          if (!readableLayerIds.isNull(index)) {
            String layerId = readableLayerIds.getString(index);
            if (layerId != null && !layerId.isEmpty()) {
              layerIds.add(layerId);
            }
          }
        }
      }
    }

    mainHandler.post(() -> {
      try {
        RNMBXMapView mapView = resolveMapView(state.mapTag);
        if (mapView == null) {
          throw new IllegalStateException("Map view not found for react tag " + state.mapTag);
        }
        int width = mapView.getWidth();
        int height = mapView.getHeight();
        if (width <= 0 || height <= 0) {
          promise.resolve(emptyRenderedDotObservationResult());
          return;
        }
        ScreenBox queryBox;
        if (payload.hasKey("queryBox") && !payload.isNull("queryBox")) {
          com.facebook.react.bridge.ReadableArray readableQueryBox = payload.getArray("queryBox");
          if (readableQueryBox != null && readableQueryBox.size() == 4) {
            double x1 = readableQueryBox.getDouble(0);
            double y1 = readableQueryBox.getDouble(1);
            double x2 = readableQueryBox.getDouble(2);
            double y2 = readableQueryBox.getDouble(3);
            queryBox =
              new ScreenBox(
                new ScreenCoordinate(Math.min(x1, x2), Math.min(y1, y2)),
                new ScreenCoordinate(Math.max(x1, x2), Math.max(y1, y2))
              );
          } else {
            queryBox =
              new ScreenBox(
                new ScreenCoordinate(0d, 0d),
                new ScreenCoordinate((double) width, (double) height)
              );
          }
        } else {
          queryBox =
            new ScreenBox(
              new ScreenCoordinate(0d, 0d),
              new ScreenCoordinate((double) width, (double) height)
            );
        }
        RenderedQueryGeometry queryGeometry = new RenderedQueryGeometry(queryBox);
        RenderedQueryOptions queryOptions = new RenderedQueryOptions(layerIds, null);
        mapView.getMapboxMap().queryRenderedFeatures(
          queryGeometry,
          queryOptions,
          queryResult -> mainHandler.post(() -> {
            if (queryResult.isError()) {
              promise.reject(
                "search_map_render_controller_query_rendered_dot_observation_failed",
                queryResult.getError()
              );
              return;
            }
            List<QueriedRenderedFeature> queriedFeatures = queryResult.getValue();
            DotObservationResult observation = buildRenderedDotObservation(
              queriedFeatures,
              state.dotSourceId
            );
            WritableMap result = emptyRenderedDotObservationResult();
            result.putArray("restaurantIds", Arguments.fromList(observation.restaurantIds));
            result.putArray("renderedDots", toWritableMapArray(observation.renderedDots));
            result.putInt("renderedFeatureCount", queriedFeatures.size());
            promise.resolve(result);
          })
        );
      } catch (Exception error) {
        promise.reject(
          "search_map_render_controller_query_rendered_dot_observation_failed",
          error
        );
      }
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
    InstanceState state = instances.get(instanceId);
    if (state == null) {
      promise.reject(
        "search_map_render_controller_query_rendered_press_target_invalid",
        "unknown instance"
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
    ArrayList<String> pinLayerIds = new ArrayList<>();
    if (payload.hasKey("pinLayerIds") && !payload.isNull("pinLayerIds")) {
      ReadableArray readablePinLayerIds = payload.getArray("pinLayerIds");
      if (readablePinLayerIds != null) {
        for (int index = 0; index < readablePinLayerIds.size(); index += 1) {
          if (!readablePinLayerIds.isNull(index)) {
            String layerId = readablePinLayerIds.getString(index);
            if (layerId != null && !layerId.isEmpty()) {
              pinLayerIds.add(layerId);
            }
          }
        }
      }
    }
    ArrayList<String> labelLayerIds = new ArrayList<>();
    if (payload.hasKey("labelLayerIds") && !payload.isNull("labelLayerIds")) {
      ReadableArray readableLabelLayerIds = payload.getArray("labelLayerIds");
      if (readableLabelLayerIds != null) {
        for (int index = 0; index < readableLabelLayerIds.size(); index += 1) {
          if (!readableLabelLayerIds.isNull(index)) {
            String layerId = readableLabelLayerIds.getString(index);
            if (layerId != null && !layerId.isEmpty()) {
              labelLayerIds.add(layerId);
            }
          }
        }
      }
    }

    mainHandler.post(() -> {
      try {
        RNMBXMapView mapView = resolveMapView(state.mapTag);
        if (mapView == null) {
          throw new IllegalStateException("Map view not found for react tag " + state.mapTag);
        }
        if (pinLayerIds.isEmpty() && labelLayerIds.isEmpty()) {
          promise.resolve(null);
          return;
        }
        RenderedQueryGeometry queryGeometry =
          new RenderedQueryGeometry(
            new ScreenBox(
              new ScreenCoordinate(x - 0.5d, y - 0.5d),
              new ScreenCoordinate(x + 0.5d, y + 0.5d)
            )
          );
        if (pinLayerIds.isEmpty()) {
          RenderedQueryOptions labelQueryOptions = new RenderedQueryOptions(labelLayerIds, null);
          mapView.getMapboxMap().queryRenderedFeatures(
            queryGeometry,
            labelQueryOptions,
            labelQueryResult -> mainHandler.post(() -> {
              if (labelQueryResult.isError()) {
                promise.reject(
                  "search_map_render_controller_query_rendered_press_target_failed",
                  labelQueryResult.getError()
                );
                return;
              }
              WritableMap labelTarget = buildRenderedLabelPressTarget(
                labelQueryResult.getValue(),
                state.labelInteractionSourceId
              );
              promise.resolve(labelTarget);
            })
          );
          return;
        }
        RenderedQueryOptions pinQueryOptions = new RenderedQueryOptions(pinLayerIds, null);
        mapView.getMapboxMap().queryRenderedFeatures(
          queryGeometry,
          pinQueryOptions,
          pinQueryResult -> mainHandler.post(() -> {
            if (pinQueryResult.isError()) {
              promise.reject(
                "search_map_render_controller_query_rendered_press_target_failed",
                pinQueryResult.getError()
              );
              return;
            }
            WritableMap pinTarget = buildRenderedPinPressTarget(
              pinQueryResult.getValue(),
              state.pinInteractionSourceId
            );
            if (pinTarget != null) {
              promise.resolve(pinTarget);
              return;
            }
            if (labelLayerIds.isEmpty()) {
              promise.resolve(null);
              return;
            }
            RenderedQueryOptions labelQueryOptions = new RenderedQueryOptions(labelLayerIds, null);
            mapView.getMapboxMap().queryRenderedFeatures(
              queryGeometry,
              labelQueryOptions,
              labelQueryResult -> mainHandler.post(() -> {
                if (labelQueryResult.isError()) {
                  promise.reject(
                    "search_map_render_controller_query_rendered_press_target_failed",
                    labelQueryResult.getError()
                  );
                  return;
                }
                WritableMap labelTarget = buildRenderedLabelPressTarget(
                  labelQueryResult.getValue(),
                  state.labelInteractionSourceId
                );
                promise.resolve(labelTarget);
              })
            );
          })
        );
      } catch (Exception error) {
        promise.reject(
          "search_map_render_controller_query_rendered_press_target_failed",
          error
        );
      }
    });
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
      state.lastPresentationStateJson = null;
      state.activeFrameGenerationId = null;
      state.highlightedMarkerKey = null;
      state.interactionMode = "enabled";
      state.currentPresentationOpacityTarget = 1;
      state.nextSourceCommitSequence = 0L;
      state.pendingPresentationSettleRequestKey = null;
      state.pendingPresentationSettleKind = null;
      state.blockedEnterStartRequestKey = null;
      state.blockedPresentationSettleRequestKey = null;
      state.blockedPresentationSettleKind = null;
      state.blockedEnterStartCommitFenceDataIdsBySourceId.clear();
      state.blockedPresentationCommitFenceDataIdsBySourceId.clear();
      state.pendingSourceCommitDataIdsBySourceId.clear();
      state.currentViewportIsMoving = false;
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
      dirtyPinMarkerKeys.addAll(pinFamilyState.livePinTransitionsByMarkerKey.keySet());
      Set<String> dirtyPinInteractionMarkerKeys = new LinkedHashSet<>(desiredPinSnapshot.dirtyPinInteractionMarkerKeys);
      dirtyPinInteractionMarkerKeys.addAll(dirtyPinMarkerKeys);
      Set<String> dirtyLabelMarkerKeys = new LinkedHashSet<>(desiredPinSnapshot.dirtyLabelMarkerKeys);
      dirtyLabelMarkerKeys.addAll(pinFamilyState.livePinTransitionsByMarkerKey.keySet());
      Set<String> dirtyLabelCollisionMarkerKeys = new LinkedHashSet<>(desiredPinSnapshot.dirtyLabelCollisionMarkerKeys);
      boolean reusePins = dirtyPinMarkerKeys.isEmpty();
      boolean reusePinInteractions = dirtyPinInteractionMarkerKeys.isEmpty();
      boolean reuseLabels = dirtyLabelMarkerKeys.isEmpty();
      boolean reuseLabelCollisions = dirtyLabelCollisionMarkerKeys.isEmpty();
      DerivedFamilyState pinInteractionFamilyState = derivedFamilyState(state, state.pinInteractionSourceId);
      DerivedFamilyState labelFamilyState = derivedFamilyState(state, state.labelSourceId);
      DerivedFamilyState labelCollisionFamilyState = derivedFamilyState(state, state.labelCollisionSourceId);
      Map<String, String> stickyCandidateByIdentity = labelFamilyState.labelObservation.stickyCandidateByIdentity;
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

        boolean shouldRenderPinInteraction =
          desiredPresent &&
          (transition == null || transition.targetOpacity != 1d) &&
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
              Feature renderFeature =
                featureWithNumericProperties(
                  labelFeature.feature,
                  Collections.singletonMap("nativeLabelOpacity", shouldSeedLabelHidden ? 0d : 1d)
                );
              nextMarkerLabelIds.add(labelFeature.id);
              nextLabelFeatureById.put(labelFeature.id, renderFeature);
              nextLabelMarkerKeyByFeatureId.put(labelFeature.id, markerKey);
              HashMap<String, Value> featureState =
                retainedLabelFeatureState(labelFeature.feature, markerKey, stickyCandidateByIdentity);
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
            nextLabelCollisionFeatureById.put(markerKey, feature);
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
      return new PreparedDerivedPinAndLabelOutput(
        Arrays.asList(
          new ParsedCollectionApplyPlan(
            state.pinSourceId,
            nextPins,
            previousPinSourceState,
            previousPinSourceState != null
              ? previousPinSourceState.featureStateById
              : Collections.emptyMap(),
            previousPinSourceState != null
              ? previousPinSourceState.featureStateRevision
              : ""
          ),
          new ParsedCollectionApplyPlan(
            state.pinInteractionSourceId,
            nextPinInteractions,
            previousPinInteractionSourceState,
            previousPinInteractionSourceState != null
              ? previousPinInteractionSourceState.featureStateById
              : Collections.emptyMap(),
            previousPinInteractionSourceState != null
              ? previousPinInteractionSourceState.featureStateRevision
              : ""
          ),
          new ParsedCollectionApplyPlan(
            state.labelSourceId,
            nextLabels,
            previousLabelSourceState,
            previousLabelSourceState != null
              ? previousLabelSourceState.featureStateById
              : Collections.emptyMap(),
            previousLabelSourceState != null
              ? previousLabelSourceState.featureStateRevision
              : ""
          ),
          new ParsedCollectionApplyPlan(
            state.labelCollisionSourceId,
            nextLabelCollisions,
            previousLabelCollisionSourceState,
            previousLabelCollisionSourceState != null
              ? previousLabelCollisionSourceState.featureStateById
              : Collections.emptyMap(),
            previousLabelCollisionSourceState != null
              ? previousLabelCollisionSourceState.featureStateRevision
              : ""
          )
        ),
        state.pinSourceId,
        pinStartedAt
      );
  }

  private void finalizePreparedPinAndLabelOutput(
    String instanceId,
    InstanceState state,
    PreparedDerivedPinAndLabelOutput prepared,
    Map<String, MutationSummary> mutationSummaryBySourceId
  ) {
    MutationSummary pinMutationSummary =
      mutationSummaryBySourceId.getOrDefault(
        prepared.pinSourceId,
        new MutationSummary(0, 0, 0, null, Collections.emptyList())
      );
    if (pinMutationSummary.dataId != null && !pinMutationSummary.addedFeatureIds.isEmpty()) {
      DerivedFamilyState pinFamilyState = derivedFamilyState(state, state.pinSourceId);
      for (String featureId : pinMutationSummary.addedFeatureIds) {
        LivePinTransition transition = pinFamilyState.livePinTransitionsByMarkerKey.get(featureId);
        if (transition == null || !transition.isAwaitingSourceCommit) {
          continue;
        }
        transition.awaitingSourceDataId = pinMutationSummary.dataId;
      }
    }
    if (pinMutationSummary.hasMutations()) {
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
        pinMutationSummary.addCount +
        " update=" +
        pinMutationSummary.updateCount +
        " remove=" +
        pinMutationSummary.removeCount +
        " durationMs=" +
        Math.round(durationMs)
      );
    }
  }

  private List<ParsedCollectionApplyPlan> prepareDerivedLabelInteractionOutputPlans(
    InstanceState state,
    DesiredPinSnapshotState desiredPinSnapshot
  ) {
      DerivedFamilyState labelInteractionFamilyState =
        derivedFamilyState(state, state.labelInteractionSourceId);
      DerivedFamilyState labelFamilyState = derivedFamilyState(state, state.labelSourceId);
      DerivedFamilyState pinFamilyState = derivedFamilyState(state, state.pinSourceId);
      Map<String, String> stickyCandidateByIdentity =
        labelFamilyState.labelObservation.stickyCandidateByIdentity;
      SourceState previousLabelInteractionSourceState = labelInteractionFamilyState.sourceState;
      Set<String> previousVisibleLabelFeatureIds = new LinkedHashSet<>(labelInteractionFamilyState.collection.idsInOrder);
      Set<String> visibilityDirtyFeatureIds = new LinkedHashSet<>(previousVisibleLabelFeatureIds);
      visibilityDirtyFeatureIds.addAll(labelFamilyState.settledVisibleFeatureIds);
      visibilityDirtyFeatureIds.removeIf(featureId ->
        previousVisibleLabelFeatureIds.contains(featureId) && labelFamilyState.settledVisibleFeatureIds.contains(featureId)
      );
      Set<String> dirtyLabelInteractionMarkerKeys = new LinkedHashSet<>(desiredPinSnapshot.dirtyLabelMarkerKeys);
      for (String featureId : visibilityDirtyFeatureIds) {
        String markerKey =
          desiredPinSnapshot.labelMarkerKeyByFeatureId.containsKey(featureId)
            ? desiredPinSnapshot.labelMarkerKeyByFeatureId.get(featureId)
            : labelInteractionFamilyState.collection.markerKeyByFeatureId.get(featureId);
        if (markerKey != null && !markerKey.isEmpty()) {
          dirtyLabelInteractionMarkerKeys.add(markerKey);
        }
      }
      boolean markerOrderChanged =
        !pinFamilyState.lastDesiredPinSnapshot.pinIdsInOrder.equals(desiredPinSnapshot.pinIdsInOrder);
      ParsedFeatureCollection next;
      if (dirtyLabelInteractionMarkerKeys.isEmpty() && !markerOrderChanged) {
        next = labelInteractionFamilyState.collection;
      } else {
        Map<String, ArrayList<String>> previousLabelInteractionIdsByMarkerKey = new HashMap<>();
        for (Map.Entry<String, ArrayList<String>> entry : labelInteractionFamilyState.collection.groupedFeatureIdsByGroup.entrySet()) {
          previousLabelInteractionIdsByMarkerKey.put(entry.getKey(), new ArrayList<>(entry.getValue()));
        }
        ArrayList<String> previousLabelInteractionMarkerOrder =
          new ArrayList<>(labelInteractionFamilyState.collection.groupOrder);
        Map<String, ArrayList<String>> nextLabelInteractionIdsByMarkerKey =
          new HashMap<>(previousLabelInteractionIdsByMarkerKey);
        Map<String, Feature> nextLabelInteractionFeatureById = new HashMap<>(labelInteractionFamilyState.collection.featureById);
        Map<String, HashMap<String, Value>> nextLabelInteractionFeatureStateById =
          new HashMap<>(labelInteractionFamilyState.collection.featureStateById);
        Map<String, String> nextLabelInteractionMarkerKeyByFeatureId = new HashMap<>(labelInteractionFamilyState.collection.markerKeyByFeatureId);
        Set<String> removedLabelInteractionGroupIds = new LinkedHashSet<>();
        for (String markerKey : dirtyLabelInteractionMarkerKeys) {
          ArrayList<String> previousFeatureIds =
            previousLabelInteractionIdsByMarkerKey.containsKey(markerKey)
              ? previousLabelInteractionIdsByMarkerKey.get(markerKey)
              : new ArrayList<>();
          for (String featureId : previousFeatureIds) {
            nextLabelInteractionFeatureById.remove(featureId);
            nextLabelInteractionFeatureStateById.remove(featureId);
            nextLabelInteractionMarkerKeyByFeatureId.remove(featureId);
          }
          List<FeatureRecord> markerLabelFeatures = desiredPinSnapshot.labelFeaturesByMarkerKey.get(markerKey);
          ArrayList<String> nextFeatureIds = new ArrayList<>();
          if (markerLabelFeatures != null) {
            for (FeatureRecord labelFeature : markerLabelFeatures) {
              if (!labelFamilyState.settledVisibleFeatureIds.contains(labelFeature.id)) {
                continue;
              }
              nextFeatureIds.add(labelFeature.id);
              nextLabelInteractionFeatureById.put(labelFeature.id, labelFeature.feature);
              nextLabelInteractionFeatureStateById.put(
                labelFeature.id,
                retainedLabelFeatureState(labelFeature.feature, markerKey, stickyCandidateByIdentity)
              );
              nextLabelInteractionMarkerKeyByFeatureId.put(labelFeature.id, markerKey);
            }
          }
          if (nextFeatureIds.isEmpty()) {
            nextLabelInteractionIdsByMarkerKey.remove(markerKey);
            if (!previousFeatureIds.isEmpty()) {
              removedLabelInteractionGroupIds.add(markerKey);
            }
            continue;
          }
          nextLabelInteractionIdsByMarkerKey.put(markerKey, nextFeatureIds);
        }
        Set<String> visibleMarkerKeys = new LinkedHashSet<>();
        for (Map.Entry<String, ArrayList<String>> entry : nextLabelInteractionIdsByMarkerKey.entrySet()) {
          if (!entry.getValue().isEmpty()) {
            visibleMarkerKeys.add(entry.getKey());
          }
        }
        ArrayList<String> nextLabelInteractionMarkerOrder = new ArrayList<>();
        Set<String> seenMarkerKeys = new LinkedHashSet<>();
        for (String markerKey : desiredPinSnapshot.pinIdsInOrder) {
          if (visibleMarkerKeys.contains(markerKey) && seenMarkerKeys.add(markerKey)) {
            nextLabelInteractionMarkerOrder.add(markerKey);
          }
        }
        for (String markerKey : previousLabelInteractionMarkerOrder) {
          if (visibleMarkerKeys.contains(markerKey) && seenMarkerKeys.add(markerKey)) {
            nextLabelInteractionMarkerOrder.add(markerKey);
          }
        }
        ArrayList<String> remainingMarkerKeys = new ArrayList<>(visibleMarkerKeys);
        Collections.sort(remainingMarkerKeys);
        for (String markerKey : remainingMarkerKeys) {
          if (seenMarkerKeys.add(markerKey)) {
            nextLabelInteractionMarkerOrder.add(markerKey);
          }
        }
        Set<String> orderChangedGroupIds =
          previousLabelInteractionMarkerOrder.equals(nextLabelInteractionMarkerOrder)
            ? new LinkedHashSet<>()
            : new LinkedHashSet<>();
        if (!previousLabelInteractionMarkerOrder.equals(nextLabelInteractionMarkerOrder)) {
          orderChangedGroupIds.addAll(previousLabelInteractionMarkerOrder);
          orderChangedGroupIds.addAll(nextLabelInteractionMarkerOrder);
        }
        ArrayList<String> nextLabelInteractionIdsInOrder = new ArrayList<>();
        if (orderChangedGroupIds.isEmpty()) {
          Set<String> emittedDirtyMarkerKeys = new LinkedHashSet<>();
          for (String featureId : labelInteractionFamilyState.collection.idsInOrder) {
            String markerKey =
              labelInteractionFamilyState.collection.markerKeyByFeatureId.containsKey(featureId)
                ? labelInteractionFamilyState.collection.markerKeyByFeatureId.get(featureId)
                : featureId;
            if (!dirtyLabelInteractionMarkerKeys.contains(markerKey)) {
              nextLabelInteractionIdsInOrder.add(featureId);
              continue;
            }
            if (emittedDirtyMarkerKeys.add(markerKey) && nextLabelInteractionIdsByMarkerKey.containsKey(markerKey)) {
              nextLabelInteractionIdsInOrder.addAll(nextLabelInteractionIdsByMarkerKey.get(markerKey));
            }
          }
        } else {
          for (String markerKey : nextLabelInteractionMarkerOrder) {
            ArrayList<String> featureIds = nextLabelInteractionIdsByMarkerKey.get(markerKey);
            if (featureIds != null && !featureIds.isEmpty()) {
              nextLabelInteractionIdsInOrder.addAll(featureIds);
            }
          }
        }
        labelInteractionFamilyState.collection.groupedFeatureIdsByGroup.clear();
        labelInteractionFamilyState.collection.groupedFeatureIdsByGroup.putAll(nextLabelInteractionIdsByMarkerKey);
        labelInteractionFamilyState.collection.groupOrder.clear();
        labelInteractionFamilyState.collection.groupOrder.addAll(nextLabelInteractionMarkerOrder);
        Set<String> nextLabelInteractionDirtyGroupIds = new LinkedHashSet<>(dirtyLabelInteractionMarkerKeys);
        nextLabelInteractionDirtyGroupIds.addAll(orderChangedGroupIds);
        replaceParsedFeatureCollection(
          labelInteractionFamilyState.collection,
          previousLabelInteractionSourceState,
          nextLabelInteractionIdsInOrder,
          nextLabelInteractionFeatureById,
          nextLabelInteractionFeatureStateById,
          nextLabelInteractionMarkerKeyByFeatureId,
          nextLabelInteractionDirtyGroupIds,
          orderChangedGroupIds,
          removedLabelInteractionGroupIds
        );
        next = labelInteractionFamilyState.collection;
      }
      return Collections.singletonList(
        new ParsedCollectionApplyPlan(
          state.labelInteractionSourceId,
          next,
          previousLabelInteractionSourceState,
          previousLabelInteractionSourceState != null
            ? previousLabelInteractionSourceState.featureStateById
            : Collections.emptyMap(),
          previousLabelInteractionSourceState != null
            ? previousLabelInteractionSourceState.featureStateRevision
            : ""
        )
      );
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
      mountedHiddenExecutionBatch == null ||
      !stringEquals(state.activeFrameGenerationId, mountedHiddenExecutionBatch.generationId)
    ) {
      return;
    }
    if (!stringEquals(state.lastEnterRequestKey, requestKey)) {
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
    state.currentPresentationOpacityTarget = 1;
    instances.put(instanceId, state);
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
    WritableMap readyEvent = Arguments.createMap();
    readyEvent.putString("type", "presentation_execution_batch_mounted_hidden");
    readyEvent.putString("instanceId", instanceId);
    readyEvent.putString("requestKey", executionBatch.requestKey);
    readyEvent.putString("frameGenerationId", executionBatch.generationId);
    readyEvent.putString("executionBatchId", executionBatch.batchId);
    readyEvent.putDouble("readyAtMs", nowMs());
    emit(readyEvent);
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
    if (!stringEquals(state.activeFrameGenerationId, executionBatch.generationId)) {
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
    ParsedFeatureCollection desiredDotInteractions =
      derivedFamilyState(state, state.dotInteractionSourceId).desiredCollection;
    ParsedFeatureCollection desiredLabels =
      derivedFamilyState(state, state.labelSourceId).desiredCollection;
    ParsedFeatureCollection desiredLabelCollisions =
      derivedFamilyState(state, state.labelCollisionSourceId).desiredCollection;
    DerivedFamilyState labelFamilyState = derivedFamilyState(state, state.labelSourceId);
    String desiredPinSnapshotInputRevision =
      desiredPinSnapshotInputRevision(
        desiredPins,
        desiredPinInteractions,
        desiredLabels,
        desiredLabelCollisions,
        labelFamilyState.labelObservation.stickyRevision
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
        desiredLabelCollisions,
        labelFamilyState.labelObservation.stickyCandidateByIdentity,
        labelFamilyState.labelObservation.stickyRevision
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
        Arrays.asList(
          state.pinSourceId,
          state.pinInteractionSourceId,
          state.dotSourceId,
          state.dotInteractionSourceId,
          state.labelSourceId,
          state.labelInteractionSourceId,
          state.labelCollisionSourceId
        ),
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
        prepareDerivedDotOutput(state, desiredDots, desiredDotInteractions, nowMs);
      List<ParsedCollectionApplyPlan> labelInteractionPlans =
        prepareDerivedLabelInteractionOutputPlans(state, finalDesiredPinSnapshot);
      ArrayList<ParsedCollectionApplyPlan> plans = new ArrayList<>();
      plans.addAll(preparedPinAndLabelOutput.plans);
      plans.addAll(preparedDotOutput.plans);
      plans.addAll(labelInteractionPlans);
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
    ParsedFeatureCollection desiredDotInteractions,
    double nowMs
  ) {
      DerivedFamilyState dotFamilyState = derivedFamilyState(state, state.dotSourceId);
      DerivedFamilyState dotInteractionFamilyState =
        derivedFamilyState(state, state.dotInteractionSourceId);
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
      SourceState previousDotInteractionSourceState = dotInteractionFamilyState.sourceState;
      ParsedFeatureCollection nextDotInteractions;
      Set<String> dirtyDotInteractionIds = new LinkedHashSet<>(desiredDotInteractions.dirtyGroupIds);
      dirtyDotInteractionIds.addAll(desiredDotInteractions.orderChangedGroupIds);
      dirtyDotInteractionIds.addAll(desiredDotInteractions.removedGroupIds);
      dirtyDotInteractionIds.addAll(dirtyDotMarkerKeys);
      if (dirtyDotInteractionIds.isEmpty()) {
        nextDotInteractions = dotInteractionFamilyState.collection;
      } else {
        ArrayList<String> nextDotInteractionIdsInOrder = new ArrayList<>();
        Map<String, Feature> nextDotInteractionFeatureById = new HashMap<>(dotInteractionFamilyState.collection.featureById);
        Map<String, String> nextDotInteractionMarkerKeyByFeatureId = new HashMap<>(dotInteractionFamilyState.collection.markerKeyByFeatureId);
        Set<String> nextDotInteractionIdSet = new LinkedHashSet<>();
        for (String featureId : desiredDotInteractions.idsInOrder) {
          Feature feature = desiredDotInteractions.featureById.get(featureId);
          if (feature == null || !desiredDotFeatureByMarkerKey.containsKey(featureId)) {
            continue;
          }
          nextDotInteractionIdsInOrder.add(featureId);
          nextDotInteractionIdSet.add(featureId);
          if (dirtyDotInteractionIds.contains(featureId)) {
            nextDotInteractionFeatureById.put(featureId, feature);
            nextDotInteractionMarkerKeyByFeatureId.put(
              featureId,
              desiredDotInteractions.markerKeyByFeatureId.getOrDefault(featureId, featureId)
            );
          }
        }
        for (String retainedDotInteractionId : dirtyDotInteractionIds) {
          if (nextDotInteractionIdSet.contains(retainedDotInteractionId)) {
            continue;
          }
          nextDotInteractionFeatureById.remove(retainedDotInteractionId);
          nextDotInteractionMarkerKeyByFeatureId.remove(retainedDotInteractionId);
        }
        Set<String> removedDotInteractionGroupIds = new LinkedHashSet<>();
        for (String featureId : dirtyDotInteractionIds) {
          if (!nextDotInteractionIdSet.contains(featureId)) {
            removedDotInteractionGroupIds.add(featureId);
          }
        }
        replaceParsedFeatureCollection(
          dotInteractionFamilyState.collection,
          previousDotInteractionSourceState,
          nextDotInteractionIdsInOrder,
          nextDotInteractionFeatureById,
          new HashMap<>(),
          nextDotInteractionMarkerKeyByFeatureId,
          dirtyDotInteractionIds,
          dirtyDotInteractionIds,
          removedDotInteractionGroupIds
        );
        nextDotInteractions = dotInteractionFamilyState.collection;
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
          ),
          new ParsedCollectionApplyPlan(
            state.dotInteractionSourceId,
            nextDotInteractions,
            previousDotInteractionSourceState,
            previousDotInteractionSourceState != null
              ? previousDotInteractionSourceState.featureStateById
              : Collections.emptyMap(),
            previousDotInteractionSourceState != null
              ? previousDotInteractionSourceState.featureStateRevision
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
    ParsedFeatureCollection desiredLabelCollisions,
    Map<String, String> stickyCandidateByIdentity,
    int stickyRevision
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
        desiredLabelCollisions,
        stickyRevision
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
          hash =
            fnv1a64Append(
              hash,
              effectiveLabelPreference(record.feature, markerKey, stickyCandidateByIdentity)
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
    ParsedFeatureCollection desiredLabelCollisions,
    int stickyRevision
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
    hash = fnv1a64Append(hash, "stickyRevision");
    hash = fnv1a64Append(hash, Integer.toString(stickyRevision));
    return finishHashedRevision(hash, 5);
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
      state.isAwaitingSourceRecovery ||
      (derivedFamilyState(state, state.pinSourceId).livePinTransitionsByMarkerKey.isEmpty() &&
        derivedFamilyState(state, state.dotSourceId).liveDotTransitionsByMarkerKey.isEmpty()) ||
      !"live".equals(state.lastPresentationBatchPhase)
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
            (derivedFamilyState(latestState, latestState.pinSourceId).livePinTransitionsByMarkerKey.isEmpty() &&
              derivedFamilyState(latestState, latestState.dotSourceId).liveDotTransitionsByMarkerKey.isEmpty()) ||
            !"live".equals(latestState.lastPresentationBatchPhase)
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
      state.dotInteractionSourceId,
      state.labelSourceId,
      state.labelInteractionSourceId,
      state.labelCollisionSourceId
    )) {
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

  private void startAwaitingLivePinTransitions(String instanceId, String dataId, InstanceState state) {
    double nowMs = nowMs();
    boolean didStart = false;
    DerivedFamilyState pinFamilyState = derivedFamilyState(state, state.pinSourceId);
    DerivedFamilyState labelFamilyState = derivedFamilyState(state, state.labelSourceId);
    SourceState pinSourceState = pinFamilyState.sourceState;
    SourceState labelSourceState = labelFamilyState.sourceState;
    for (Map.Entry<String, LivePinTransition> entry : pinFamilyState.livePinTransitionsByMarkerKey.entrySet()) {
      if (
        !entry.getValue().isAwaitingSourceCommit ||
        !shouldAcknowledgePendingCommitDataId(entry.getValue().awaitingSourceDataId, state.pinSourceId, dataId)
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
    double nowMs = nowMs();
    boolean didStart = false;
    DerivedFamilyState dotFamilyState = derivedFamilyState(state, state.dotSourceId);
    SourceState dotSourceState = dotFamilyState.sourceState;
    for (Map.Entry<String, LiveDotTransition> entry : dotFamilyState.liveDotTransitionsByMarkerKey.entrySet()) {
      if (
        !entry.getValue().isAwaitingSourceCommit ||
        !shouldAcknowledgePendingCommitDataId(entry.getValue().awaitingSourceDataId, state.dotSourceId, dataId)
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
    if (state.isAwaitingSourceRecovery) {
      instances.put(instanceId, state);
      cancelLivePinTransitionAnimation(instanceId);
      return;
    }
    if (
      !ensureSourcesReady(
        state,
        instanceId,
        Arrays.asList(state.pinSourceId, state.dotSourceId, state.labelSourceId),
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
    ArrayList<Map.Entry<String, HashMap<String, Value>>> featureStatesToApply = new ArrayList<>();
    ArrayList<Map.Entry<String, HashMap<String, Value>>> dotFeatureStatesToApply = new ArrayList<>();
    ArrayList<Map.Entry<String, HashMap<String, Value>>> labelFeatureStatesToApply = new ArrayList<>();
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
      int previousPinApplyCount = featureStatesToApply.size();
      applyTransientFeatureState(
        pinSourceState,
        pinFamilyState,
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
      for (Map.Entry<String, HashMap<String, Value>> featureStateEntry : featureStatesToApply) {
        mapView
          .getMapboxMap()
          .setFeatureState(state.pinSourceId, null, featureStateEntry.getKey(), Value.valueOf(featureStateEntry.getValue()), result -> { });
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
      for (Map.Entry<String, HashMap<String, Value>> featureStateEntry : labelFeatureStatesToApply) {
        mapView
          .getMapboxMap()
          .setFeatureState(state.labelSourceId, null, featureStateEntry.getKey(), Value.valueOf(featureStateEntry.getValue()), result -> { });
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

  private static String effectiveLabelPreference(
    Feature feature,
    String markerKey,
    Map<String, String> stickyCandidateByIdentity
  ) {
    JsonObject properties = feature.properties();
    String restaurantId =
      properties != null && properties.has("restaurantId") && properties.get("restaurantId").isJsonPrimitive()
        ? properties.get("restaurantId").getAsString()
        : null;
    String stickyIdentityKey = buildLabelStickyIdentityKey(restaurantId, markerKey);
    if (stickyIdentityKey != null) {
      String stickyCandidate = normalizeRenderedLabelCandidate(stickyCandidateByIdentity.get(stickyIdentityKey));
      if (stickyCandidate != null) {
        return stickyCandidate;
      }
    }
    return "bottom";
  }

  private static HashMap<String, Value> retainedLabelFeatureState(
    Feature feature,
    String markerKey,
    Map<String, String> stickyCandidateByIdentity
  ) {
    HashMap<String, Value> state = new HashMap<>();
    state.put(
      "nativeLabelPreference",
      Value.valueOf(effectiveLabelPreference(feature, markerKey, stickyCandidateByIdentity))
    );
    return state;
  }

  private void applyInteractionSuppression(InstanceState state) throws Exception {
    applySnapshots(
      state,
      new String[][] {
        { state.pinInteractionSourceId, EMPTY_FEATURE_COLLECTION_JSON },
        { state.dotInteractionSourceId, EMPTY_FEATURE_COLLECTION_JSON },
        { state.labelInteractionSourceId, EMPTY_FEATURE_COLLECTION_JSON },
      }
    );
  }

  private boolean shouldSuppressInteractions(InstanceState state) {
    return !"enabled".equals(state.interactionMode);
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
    for (String sourceId : new String[] { state.pinSourceId, state.dotSourceId, state.labelSourceId }) {
      SourceState sourceState = mountedSourceState(state, sourceId);
      if (sourceState == null) {
        continue;
      }
      for (String featureId : sourceState.diffKeyById.keySet()) {
        String markerKey = sourceState.markerKeyByFeatureId.getOrDefault(featureId, featureId);
        HashMap<String, Value> featureState = new HashMap<>();
        featureState.put(
          "nativeHighlighted",
          Value.valueOf(
            state.highlightedMarkerKey != null && state.highlightedMarkerKey.equals(markerKey) ? 1 : 0
          )
        );
        mapView
          .getMapboxMap()
          .setFeatureState(sourceId, null, featureId, Value.valueOf(featureState), result -> { });
      }
    }
  }

  private void applyPresentationOpacity(InstanceState state, double opacity) throws Exception {
    String instanceId = findInstanceIdForState(state);
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
    for (String sourceId : new String[] { state.pinSourceId, state.dotSourceId, state.labelSourceId }) {
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
    if (featureStateById.isEmpty() || changedFeatureStateIds.isEmpty()) {
      return;
    }
    RNMBXMapView mapView = resolveMapView(state.mapTag);
    if (mapView == null) {
      throw new IllegalStateException("Map view not found for react tag " + state.mapTag);
    }
    for (String featureId : changedFeatureStateIds) {
      HashMap<String, Value> featureState = featureStateById.get(featureId);
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
    return Arrays.asList(state.pinSourceId, state.dotSourceId, state.labelSourceId);
  }

  private static WritableMap emptyRenderedLabelObservationResult() {
    WritableMap result = Arguments.createMap();
    result.putArray("visibleLabelFeatureIds", Arguments.createArray());
    result.putArray("placedLabels", Arguments.createArray());
    result.putInt("layerRenderedFeatureCount", 0);
    result.putInt("effectiveRenderedFeatureCount", 0);
    result.putBoolean("stickyChanged", false);
    return result;
  }

  private static com.facebook.react.bridge.WritableArray toWritableStringArray(List<String> values) {
    com.facebook.react.bridge.WritableArray array = Arguments.createArray();
    for (String value : values) {
      array.pushString(value);
    }
    return array;
  }

  private static List<WritableMap> serializeRenderedPlacedLabels(
    List<RenderedPlacedLabelObservation> placedLabels
  ) {
    ArrayList<WritableMap> maps = new ArrayList<>();
    for (RenderedPlacedLabelObservation placedLabel : placedLabels) {
      WritableMap map = Arguments.createMap();
      map.putString("markerKey", placedLabel.markerKey);
      map.putString("candidate", placedLabel.candidate);
      if (placedLabel.restaurantId != null) {
        map.putString("restaurantId", placedLabel.restaurantId);
      } else {
        map.putNull("restaurantId");
      }
      maps.add(map);
    }
    return maps;
  }

  private static WritableMap emptyRenderedDotObservationResult() {
    WritableMap result = Arguments.createMap();
    result.putArray("restaurantIds", Arguments.createArray());
    result.putArray("renderedDots", Arguments.createArray());
    result.putInt("renderedFeatureCount", 0);
    return result;
  }

  private static com.facebook.react.bridge.WritableArray toWritableMapArray(
    List<WritableMap> maps
  ) {
    com.facebook.react.bridge.WritableArray array = Arguments.createArray();
    for (WritableMap map : maps) {
      array.pushMap(map);
    }
    return array;
  }

  private static LabelObservationResult buildRenderedLabelObservation(
    List<QueriedRenderedFeature> features,
    String requiredSourceId
  ) {
    LabelObservationResult result = new LabelObservationResult();
    LinkedHashSet<String> visibleLabelFeatureIds = new LinkedHashSet<>();
    for (QueriedRenderedFeature queriedRenderedFeature : features) {
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
      String restaurantId =
        properties != null &&
        properties.has("restaurantId") &&
        properties.get("restaurantId").isJsonPrimitive()
          ? properties.get("restaurantId").getAsString()
          : null;
      result.placedLabels.add(new RenderedPlacedLabelObservation(markerKey, candidate, restaurantId));
    }
    ArrayList<String> sortedVisibleLabelFeatureIds = new ArrayList<>(visibleLabelFeatureIds);
    Collections.sort(sortedVisibleLabelFeatureIds);
    result.visibleLabelFeatureIds.addAll(sortedVisibleLabelFeatureIds);
    return result;
  }

  private static String buildLabelStickyIdentityKey(String restaurantId, String markerKey) {
    if (restaurantId != null && !restaurantId.isEmpty()) {
      return "restaurant:" + restaurantId;
    }
    if (markerKey != null && !markerKey.isEmpty()) {
      return "marker:" + markerKey;
    }
    return null;
  }

  private static Set<String> resetStickyLabelObservationIfNeeded(
    LabelFamilyObservationState labelObservation,
    String labelResetRequestKey
  ) {
    if (labelResetRequestKey == null || labelResetRequestKey.isEmpty()) {
      return new LinkedHashSet<>();
    }
    if (Objects.equals(labelObservation.lastResetRequestKey, labelResetRequestKey)) {
      return new LinkedHashSet<>();
    }
    labelObservation.lastResetRequestKey = labelResetRequestKey;
    LinkedHashSet<String> previousIdentityKeys =
      new LinkedHashSet<>(labelObservation.stickyCandidateByIdentity.keySet());
    labelObservation.stickyCandidateByIdentity.clear();
    labelObservation.stickyCommittedLastSeenAtMsByIdentity.clear();
    labelObservation.stickyCommittedMissingStreakByIdentity.clear();
    labelObservation.stickyProposedCandidateByIdentity.clear();
    labelObservation.stickyProposedSinceAtMsByIdentity.clear();
    if (!previousIdentityKeys.isEmpty()) {
      labelObservation.stickyRevision += 1;
    }
    return previousIdentityKeys;
  }

  private static Set<String> updateStickyLabelObservation(
    LabelFamilyObservationState labelObservation,
    List<RenderedPlacedLabelObservation> placedLabels,
    boolean isMoving,
    boolean enableStickyLabelCandidates,
    double stickyLockStableMsMoving,
    double stickyLockStableMsIdle,
    double stickyUnlockMissingMsMoving,
    double stickyUnlockMissingMsIdle,
    int stickyUnlockMissingStreakMoving,
    double nowMs
  ) {
    if (!enableStickyLabelCandidates) {
      LinkedHashSet<String> previousIdentityKeys =
        new LinkedHashSet<>(labelObservation.stickyCandidateByIdentity.keySet());
      labelObservation.stickyCandidateByIdentity.clear();
      labelObservation.stickyCommittedLastSeenAtMsByIdentity.clear();
      labelObservation.stickyCommittedMissingStreakByIdentity.clear();
      labelObservation.stickyProposedCandidateByIdentity.clear();
      labelObservation.stickyProposedSinceAtMsByIdentity.clear();
      if (!previousIdentityKeys.isEmpty()) {
        labelObservation.stickyRevision += 1;
      }
      return previousIdentityKeys;
    }

    HashMap<String, String> renderedCandidateByIdentity = new HashMap<>();
    for (RenderedPlacedLabelObservation placedLabel : placedLabels) {
      String stickyIdentityKey =
        buildLabelStickyIdentityKey(placedLabel.restaurantId, placedLabel.markerKey);
      if (stickyIdentityKey == null || renderedCandidateByIdentity.containsKey(stickyIdentityKey)) {
        continue;
      }
      renderedCandidateByIdentity.put(stickyIdentityKey, placedLabel.candidate);
    }

    LinkedHashSet<String> changedIdentityKeys = new LinkedHashSet<>();

    // Sticky memory is "last successful side wins and persists until a different placed side
    // actually wins". Temporary absence should not erase the remembered side.
    ArrayList<String> stickyIdentityKeys =
      new ArrayList<>(labelObservation.stickyCandidateByIdentity.keySet());
    for (String stickyIdentityKey : stickyIdentityKeys) {
      String observedCandidate = renderedCandidateByIdentity.get(stickyIdentityKey);
      if (observedCandidate != null) {
        if (!Objects.equals(labelObservation.stickyCandidateByIdentity.get(stickyIdentityKey), observedCandidate)) {
          labelObservation.stickyCandidateByIdentity.put(stickyIdentityKey, observedCandidate);
          changedIdentityKeys.add(stickyIdentityKey);
        }
        labelObservation.stickyCommittedLastSeenAtMsByIdentity.put(stickyIdentityKey, nowMs);
        labelObservation.stickyCommittedMissingStreakByIdentity.put(stickyIdentityKey, 0);
        labelObservation.stickyProposedCandidateByIdentity.remove(stickyIdentityKey);
        labelObservation.stickyProposedSinceAtMsByIdentity.remove(stickyIdentityKey);
        continue;
      }

      int nextMissingStreak =
        labelObservation.stickyCommittedMissingStreakByIdentity.containsKey(stickyIdentityKey)
          ? labelObservation.stickyCommittedMissingStreakByIdentity.get(stickyIdentityKey) + 1
          : 1;
      labelObservation.stickyCommittedMissingStreakByIdentity.put(stickyIdentityKey, nextMissingStreak);
      labelObservation.stickyProposedCandidateByIdentity.remove(stickyIdentityKey);
      labelObservation.stickyProposedSinceAtMsByIdentity.remove(stickyIdentityKey);
    }

    for (Map.Entry<String, String> entry : renderedCandidateByIdentity.entrySet()) {
      String stickyIdentityKey = entry.getKey();
      String candidate = entry.getValue();
      if (!Objects.equals(labelObservation.stickyCandidateByIdentity.get(stickyIdentityKey), candidate)) {
        labelObservation.stickyCandidateByIdentity.put(stickyIdentityKey, candidate);
        changedIdentityKeys.add(stickyIdentityKey);
      }
      labelObservation.stickyCommittedLastSeenAtMsByIdentity.put(stickyIdentityKey, nowMs);
      labelObservation.stickyCommittedMissingStreakByIdentity.put(stickyIdentityKey, 0);
      labelObservation.stickyProposedCandidateByIdentity.remove(stickyIdentityKey);
      labelObservation.stickyProposedSinceAtMsByIdentity.remove(stickyIdentityKey);
    }

    if (!changedIdentityKeys.isEmpty()) {
      labelObservation.stickyRevision += 1;
    }
    return changedIdentityKeys;
  }

  private WritableMap commitRenderedLabelObservation(
    String instanceId,
    LabelObservationResult observation,
    int layerRenderedFeatureCount,
    int effectiveRenderedFeatureCount,
    boolean commitInteractionVisibility,
    boolean enableStickyLabelCandidates,
    double stickyLockStableMsMoving,
    double stickyLockStableMsIdle,
    double stickyUnlockMissingMsMoving,
    double stickyUnlockMissingMsIdle,
    int stickyUnlockMissingStreakMoving,
    String labelResetRequestKey
  ) {
    InstanceState mutableState = instances.get(instanceId);
    if (mutableState == null) {
      return emptyRenderedLabelObservationResult();
    }
    DerivedFamilyState labelFamilyState = derivedFamilyState(mutableState, mutableState.labelSourceId);
    ArrayList<String> previousVisibleLabelFeatureIds =
      new ArrayList<>(labelFamilyState.labelObservation.lastVisibleLabelFeatureIds);
    if (commitInteractionVisibility) {
      labelFamilyState.settledVisibleFeatureIds.clear();
      labelFamilyState.settledVisibleFeatureIds.addAll(observation.visibleLabelFeatureIds);
    }
    Set<String> resetIdentityKeys =
      resetStickyLabelObservationIfNeeded(labelFamilyState.labelObservation, labelResetRequestKey);
    Set<String> changedIdentityKeys =
      updateStickyLabelObservation(
        labelFamilyState.labelObservation,
        observation.placedLabels,
        mutableState.currentViewportIsMoving,
        enableStickyLabelCandidates,
        stickyLockStableMsMoving,
        stickyLockStableMsIdle,
        stickyUnlockMissingMsMoving,
        stickyUnlockMissingMsIdle,
        stickyUnlockMissingStreakMoving,
        nowMs()
      );
    labelFamilyState.labelObservation.lastVisibleLabelFeatureIds.clear();
    labelFamilyState.labelObservation.lastVisibleLabelFeatureIds.addAll(observation.visibleLabelFeatureIds);
    labelFamilyState.labelObservation.lastLayerRenderedFeatureCount = layerRenderedFeatureCount;
    labelFamilyState.labelObservation.lastEffectiveRenderedFeatureCount = effectiveRenderedFeatureCount;
    instances.put(instanceId, mutableState);

    ArrayList<String> dirtyStickyIdentityKeys = new ArrayList<>();
    dirtyStickyIdentityKeys.addAll(resetIdentityKeys);
    for (String identityKey : changedIdentityKeys) {
      if (!dirtyStickyIdentityKeys.contains(identityKey)) {
        dirtyStickyIdentityKeys.add(identityKey);
      }
    }
    Collections.sort(dirtyStickyIdentityKeys);
    boolean didProduceMeaningfulChange =
      !dirtyStickyIdentityKeys.isEmpty() ||
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
    result.putArray("placedLabels", toWritableMapArray(serializeRenderedPlacedLabels(observation.placedLabels)));
    result.putInt("layerRenderedFeatureCount", layerRenderedFeatureCount);
    result.putInt("effectiveRenderedFeatureCount", effectiveRenderedFeatureCount);
    result.putBoolean("stickyChanged", !dirtyStickyIdentityKeys.isEmpty());
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
    result.putBoolean("stickyChanged", false);
    return result;
  }

  private void configureLabelObservation(
    String instanceId,
    boolean observationEnabled,
    boolean allowFallback,
    boolean commitInteractionVisibility,
    boolean enableStickyLabelCandidates,
    double refreshMsIdle,
    double refreshMsMoving,
    double stickyLockStableMsMoving,
    double stickyLockStableMsIdle,
    double stickyUnlockMissingMsMoving,
    double stickyUnlockMissingMsIdle,
    int stickyUnlockMissingStreakMoving,
    String labelResetRequestKey
  ) {
    InstanceState state = instances.get(instanceId);
    if (state == null) {
      return;
    }
    LabelFamilyObservationState labelObservation =
      derivedFamilyState(state, state.labelSourceId).labelObservation;
    labelObservation.observationEnabled = observationEnabled;
    labelObservation.allowFallback = allowFallback;
    labelObservation.commitInteractionVisibility = commitInteractionVisibility;
    labelObservation.refreshMsIdle = refreshMsIdle;
    labelObservation.refreshMsMoving = refreshMsMoving;
    labelObservation.stickyEnabled = enableStickyLabelCandidates;
    labelObservation.stickyLockStableMsMoving = stickyLockStableMsMoving;
    labelObservation.stickyLockStableMsIdle = stickyLockStableMsIdle;
    labelObservation.stickyUnlockMissingMsMoving = stickyUnlockMissingMsMoving;
    labelObservation.stickyUnlockMissingMsIdle = stickyUnlockMissingMsIdle;
    labelObservation.stickyUnlockMissingStreakMoving = stickyUnlockMissingStreakMoving;
    labelObservation.configuredResetRequestKey = labelResetRequestKey;
    labelObservation.movingNoopRefreshStreak = 0;
    labelObservation.movingAdaptiveRefreshMs = refreshMsMoving;
    if (!observationEnabled) {
      labelObservation.isRefreshInFlight = false;
      labelObservation.queuedRefreshDelayMs = null;
      Runnable pending = labelObservationRefreshRunnables.remove(instanceId);
      if (pending != null) {
        mainHandler.removeCallbacks(pending);
      }
    }
    instances.put(instanceId, state);
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
    event.putBoolean(
      "stickyChanged",
      snapshot != null && snapshot.hasKey("stickyChanged") && snapshot.getBoolean("stickyChanged")
    );
    return event;
  }

  private void reconcileStickyObservationIfNeeded(String instanceId, WritableMap snapshot) {
    if (snapshot == null || !snapshot.hasKey("stickyChanged") || !snapshot.getBoolean("stickyChanged")) {
      return;
    }
    try {
      applyDesiredFrameSnapshots(instanceId, false);
    } catch (Exception ignored) {
    }
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
          labelObservation.commitInteractionVisibility,
          labelObservation.stickyEnabled,
          labelObservation.stickyLockStableMsMoving,
          labelObservation.stickyLockStableMsIdle,
          labelObservation.stickyUnlockMissingMsMoving,
          labelObservation.stickyUnlockMissingMsIdle,
          labelObservation.stickyUnlockMissingStreakMoving,
          labelObservation.configuredResetRequestKey
        );
      reconcileStickyObservationIfNeeded(instanceId, snapshot);
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
            buildRenderedLabelObservation(primaryFeatures, latestState.labelSourceId);
          if (primaryFeatures.size() > 0 || !latestLabelObservation.allowFallback) {
            WritableMap snapshot =
              commitRenderedLabelObservation(
                instanceId,
                primaryObservation,
                primaryFeatures.size(),
                primaryFeatures.size(),
                latestLabelObservation.commitInteractionVisibility,
                latestLabelObservation.stickyEnabled,
                latestLabelObservation.stickyLockStableMsMoving,
                latestLabelObservation.stickyLockStableMsIdle,
                latestLabelObservation.stickyUnlockMissingMsMoving,
                latestLabelObservation.stickyUnlockMissingMsIdle,
                latestLabelObservation.stickyUnlockMissingStreakMoving,
                latestLabelObservation.configuredResetRequestKey
              );
            reconcileStickyObservationIfNeeded(instanceId, snapshot);
            emitLabelObservationUpdated(instanceId, snapshot);
            completeLabelObservationRefresh(instanceId);
            return;
          }

          ArrayList<String> fallbackLayerIds = resolveRenderedQueryLayerIdsForSource(latestState);
          RenderedQueryOptions fallbackOptions = new RenderedQueryOptions(
            fallbackLayerIds.isEmpty() ? resolvedLayerIds : fallbackLayerIds,
            null
          );
          mapView
            .getMapboxMap()
            .queryRenderedFeatures(
              queryGeometry,
              fallbackOptions,
              fallbackResult -> mainHandler.post(() -> {
                InstanceState fallbackState = instances.get(instanceId);
                if (fallbackState == null) {
                  return;
                }
                LabelFamilyObservationState fallbackLabelObservation =
                  derivedFamilyState(fallbackState, fallbackState.labelSourceId).labelObservation;
                if (fallbackResult.isError()) {
                  completeLabelObservationRefresh(instanceId);
                  return;
                }
                List<QueriedRenderedFeature> fallbackFeatures = fallbackResult.getValue();
                LabelObservationResult fallbackObservation =
                  buildRenderedLabelObservation(fallbackFeatures, fallbackState.labelSourceId);
                WritableMap snapshot =
                  commitRenderedLabelObservation(
                    instanceId,
                    fallbackObservation,
                    primaryFeatures.size(),
                    fallbackFeatures.size(),
                    fallbackLabelObservation.commitInteractionVisibility,
                    fallbackLabelObservation.stickyEnabled,
                    fallbackLabelObservation.stickyLockStableMsMoving,
                    fallbackLabelObservation.stickyLockStableMsIdle,
                    fallbackLabelObservation.stickyUnlockMissingMsMoving,
                    fallbackLabelObservation.stickyUnlockMissingMsIdle,
                    fallbackLabelObservation.stickyUnlockMissingStreakMoving,
                    fallbackLabelObservation.configuredResetRequestKey
                  );
                reconcileStickyObservationIfNeeded(instanceId, snapshot);
                emitLabelObservationUpdated(instanceId, snapshot);
                completeLabelObservationRefresh(instanceId);
              })
            );
        })
      );
  }

  private static DotObservationResult buildRenderedDotObservation(
    List<QueriedRenderedFeature> features,
    String requiredSourceId
  ) {
    DotObservationResult result = new DotObservationResult();
    java.util.HashSet<String> seenRestaurantIds = new java.util.HashSet<>();
    for (QueriedRenderedFeature queriedRenderedFeature : features) {
      if (queriedRenderedFeature == null || queriedRenderedFeature.getQueriedFeature() == null) {
        continue;
      }
      if (!stringEquals(queriedRenderedFeature.getQueriedFeature().getSource(), requiredSourceId)) {
        continue;
      }
      Feature feature = queriedRenderedFeature.getQueriedFeature().getFeature();
      if (feature == null) {
        continue;
      }
      com.google.gson.JsonObject properties = feature.properties();
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
      if (seenRestaurantIds.add(restaurantId)) {
        result.restaurantIds.add(restaurantId);
      }
      WritableMap renderedDot = Arguments.createMap();
      renderedDot.putString("restaurantId", restaurantId);
      if (feature.geometry() instanceof Point) {
        Point point = (Point) feature.geometry();
        WritableMap coordinate = Arguments.createMap();
        coordinate.putDouble("lng", point.longitude());
        coordinate.putDouble("lat", point.latitude());
        renderedDot.putMap("coordinate", coordinate);
      } else {
        renderedDot.putNull("coordinate");
      }
      result.renderedDots.add(renderedDot);
    }
    java.util.Collections.sort(result.restaurantIds);
    return result;
  }

  private static WritableMap buildRenderedPinPressTarget(
    List<QueriedRenderedFeature> features,
    String requiredSourceId
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

  private static WritableMap buildRenderedLabelPressTarget(
    List<QueriedRenderedFeature> features,
    String requiredSourceId
  ) {
    for (QueriedRenderedFeature queriedRenderedFeature : features) {
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
    ArrayList<String> layerIds = new ArrayList<>();
    try {
      withStyle(state.mapTag, style -> {
        JSONObject styleJson = new JSONObject(style.getStyleJSON());
        JSONArray layers = styleJson.optJSONArray("layers");
        if (layers == null) {
          return;
        }
        for (int index = 0; index < layers.length(); index += 1) {
          JSONObject layer = layers.optJSONObject(index);
          if (layer == null) {
            continue;
          }
          String sourceId = layer.optString("source", "");
          String layerId = layer.optString("id", "");
          if (stringEquals(sourceId, state.labelSourceId) && !layerId.isEmpty()) {
            layerIds.add(layerId);
          }
        }
      });
    } catch (Exception error) {
      return new ArrayList<>();
    }
    return layerIds;
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
    return Arrays.asList(
      state.pinSourceId,
      state.pinInteractionSourceId,
      state.dotSourceId,
      state.dotInteractionSourceId,
      state.labelSourceId,
      state.labelInteractionSourceId,
      state.labelCollisionSourceId
    );
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
    RNMBXMapView mapView = resolveMapView(mapTag);
    if (mapView != null) {
      if (mapIdleListener != null) {
        mapView.getMapboxMap().removeOnMapIdleListener(mapIdleListener);
      }
    }
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
      if (sourceId.equals(state.pinSourceId)) {
        startAwaitingLivePinTransitions(entry.getKey(), dataId, state);
      }
      if (sourceId.equals(state.dotSourceId)) {
        startAwaitingLiveDotTransitions(entry.getKey(), dataId, state);
      }
      if (sourceId.equals(state.labelSourceId)) {
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

  private boolean hasPendingVisualSourceCommits(InstanceState state) {
    for (String sourceId : new String[] { state.pinSourceId, state.dotSourceId, state.labelSourceId }) {
      Set<String> pending = state.pendingSourceCommitDataIdsBySourceId.get(sourceId);
      if (pending != null && !pending.isEmpty()) {
        return true;
      }
    }
    return false;
  }

  private Map<String, Set<String>> capturePendingVisualSourceCommitFence(InstanceState state) {
    Map<String, Set<String>> fence = new HashMap<>();
    for (String sourceId : new String[] { state.pinSourceId, state.dotSourceId, state.labelSourceId }) {
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
    ParsedFeatureCollection next
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

    if (previousSourceLifecyclePhase != SourceLifecyclePhase.INCREMENTAL) {
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
      nextSourceState
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
          plan.next
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
        plan.next.featureStateRevision,
        plan.nextSourceState.featureStateChangedIds,
        plan.next.featureStateById,
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
    InstanceState state = instances.get(instanceId);
    if (state == null) {
      return;
    }
    if (!stringEquals(state.lastDismissRequestKey, requestKey)) {
      return;
    }
    state.pendingPresentationSettleRequestKey = null;
    state.pendingPresentationSettleKind = null;
    state.blockedPresentationSettleRequestKey = null;
    state.blockedPresentationSettleKind = null;
    state.blockedPresentationCommitFenceDataIdsBySourceId.clear();
    state.currentPresentationRenderPhase = "idle";
    state.pendingSourceCommitDataIdsBySourceId.clear();
    initializeDerivedFamilyStates(state);
    cancelLivePinTransitionAnimation(instanceId);
    instances.put(instanceId, state);
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
