import type { SearchSessionRuntimeEvent } from './search-session-events';
import {
  createInitialSearchSessionShadowState,
  reduceSearchSessionShadowState,
  type SearchSessionReduceResult,
  type SearchSessionShadowState,
} from './search-session-reducer';

type SearchSessionControllerListener = (result: SearchSessionReduceResult) => void;

export type SearchSessionControllerOptions = {
  initialState?: SearchSessionShadowState;
  onTransitionViolation?: (result: SearchSessionReduceResult) => void;
  onStaleEventDropped?: (result: SearchSessionReduceResult) => void;
};

export class SearchSessionController {
  private state: SearchSessionShadowState;
  private readonly initialState: SearchSessionShadowState;
  private readonly listeners = new Set<SearchSessionControllerListener>();
  private readonly onTransitionViolation?: SearchSessionControllerOptions['onTransitionViolation'];
  private readonly onStaleEventDropped?: SearchSessionControllerOptions['onStaleEventDropped'];

  constructor(options?: SearchSessionControllerOptions) {
    const baseInitialState = options?.initialState ?? createInitialSearchSessionShadowState();
    this.initialState = {
      ...baseInitialState,
      tuple: baseInitialState.tuple ? { ...baseInitialState.tuple } : null,
      lastTransitionViolation: baseInitialState.lastTransitionViolation
        ? { ...baseInitialState.lastTransitionViolation }
        : null,
    };
    this.state = this.initialState;
    this.onTransitionViolation = options?.onTransitionViolation;
    this.onStaleEventDropped = options?.onStaleEventDropped;
  }

  public dispatch(event: SearchSessionRuntimeEvent): SearchSessionReduceResult {
    const result = reduceSearchSessionShadowState(this.state, event);
    this.state = result.state;

    if (result.reason === 'transition_violation') {
      this.onTransitionViolation?.(result);
    }
    if (result.reason === 'stale_event') {
      this.onStaleEventDropped?.(result);
    }

    this.listeners.forEach((listener) => listener(result));
    return result;
  }

  public getState(): SearchSessionShadowState {
    return this.state;
  }

  public reset(): void {
    this.state = {
      ...this.initialState,
      tuple: this.initialState.tuple ? { ...this.initialState.tuple } : null,
      lastTransitionViolation: this.initialState.lastTransitionViolation
        ? { ...this.initialState.lastTransitionViolation }
        : null,
    };
  }

  public subscribe(listener: SearchSessionControllerListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const createSearchSessionController = (
  options?: SearchSessionControllerOptions
): SearchSessionController => new SearchSessionController(options);
