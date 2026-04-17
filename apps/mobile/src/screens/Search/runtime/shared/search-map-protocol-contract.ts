import type { Coordinate, RestaurantResult } from '../../../../types';
import type {
  ExecutionBatchPayload,
  MarkerEnterSettledPayload,
} from './results-presentation-runtime-owner-contract';

export type SearchMapProfileOpenFromMarkerArgs = {
  restaurantId: string;
  restaurantName?: string | null;
  restaurant?: RestaurantResult | null;
  pressedCoordinate?: Coordinate | null;
};

export type SearchMapProfileCommandPort = {
  openProfileFromMarker: (args: SearchMapProfileOpenFromMarkerArgs) => void;
};

export type SearchMapExecutionBatchMountedHiddenPayload = ExecutionBatchPayload & {
  readyAtMs: number;
};

export type SearchMapMarkerEnterStartedPayload = ExecutionBatchPayload & {
  startedAtMs: number;
};

export type SearchMapMarkerExitStartedPayload = {
  requestKey: string;
  startedAtMs: number;
};

export type SearchMapMarkerExitSettledPayload = {
  requestKey: string;
  settledAtMs: number;
};

export type SearchMapPresentationLifecyclePort = {
  handleExecutionBatchMountedHidden: (payload: SearchMapExecutionBatchMountedHiddenPayload) => void;
  handleMarkerEnterStarted: (payload: SearchMapMarkerEnterStartedPayload) => void;
  handleMarkerEnterSettled: (payload: MarkerEnterSettledPayload) => void;
  handleMarkerExitStarted: (payload: SearchMapMarkerExitStartedPayload) => void;
  handleMarkerExitSettled: (payload: SearchMapMarkerExitSettledPayload) => void;
};
