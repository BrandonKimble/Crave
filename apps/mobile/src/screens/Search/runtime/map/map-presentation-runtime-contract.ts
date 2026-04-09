import type { SearchRuntimeMapPresentationPhase } from '../shared/search-runtime-bus';
import type { SearchMapSourceStore } from './search-map-source-store';

export type SearchMapPresentationScene = {
  selectedRestaurantId: string | null;
  pinSourceStore: SearchMapSourceStore;
  dotSourceStore: SearchMapSourceStore | null;
  pinInteractionSourceStore: SearchMapSourceStore;
  dotInteractionSourceStore: SearchMapSourceStore;
  markersRenderKey: string;
  labelSourceStore: SearchMapSourceStore;
  labelCollisionSourceStore: SearchMapSourceStore;
  labelDerivedSourceIdentityKey: string;
};

export type MapSnapshotPresentationPolicy = {
  batchPhase: SearchRuntimeMapPresentationPhase;
  visualReadyRequestKey: string | null;
  visualSceneKey: string | null;
  shouldFreezePreparedScene: boolean;
  shouldCapturePreparedScene: boolean;
  shouldAllowVisualScene: boolean;
  shouldAllowLabelInteractionScene: boolean;
  shouldProjectSearchMarkerFamilies: boolean;
  shouldAllowLiveLabelUpdates: boolean;
  shouldPublishVisibleLabelFeatureIds: boolean;
  shouldResetPreparedVisualScene: boolean;
  shouldResetEnterLabelsUnavailableSignature: boolean;
  enterLaneActive: boolean;
  isPresentationPending: boolean;
};
