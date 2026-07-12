import type { SearchRuntimeMapPresentationPhase } from '../shared/search-runtime-bus';
import type { SearchMapSourceStore } from './search-map-source-store';

export type SearchMapPresentationScene = {
  selectedRestaurantId: string | null;
  pinSourceStore: SearchMapSourceStore;
  dotSourceStore: SearchMapSourceStore | null;
  pinInteractionSourceStore: SearchMapSourceStore;
  markersRenderKey: string;
  labelCollisionSourceStore: SearchMapSourceStore;
};

export type MapSnapshotPresentationPolicy = {
  batchPhase: SearchRuntimeMapPresentationPhase;
  visualReadyRequestKey: string | null;
  visualSceneKey: string | null;
  shouldFreezePreparedScene: boolean;
  shouldCapturePreparedScene: boolean;
  shouldAllowVisualScene: boolean;
  shouldAllowVisibleLabelHits: boolean;
  shouldProjectSearchMarkerFamilies: boolean;
  shouldAllowLiveLabelUpdates: boolean;
  shouldPublishVisibleLabelFeatureIds: boolean;
  shouldResetPreparedVisualScene: boolean;
  shouldResetEnterLabelsUnavailableSignature: boolean;
  enterLaneActive: boolean;
  isPresentationPending: boolean;
};
