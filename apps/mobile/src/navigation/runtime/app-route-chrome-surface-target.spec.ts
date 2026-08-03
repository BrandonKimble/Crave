import {
  resolveAppRouteChromeSurfaceTarget,
  type AppRouteSceneForegroundActivity,
} from './app-route-scene-policy-contract';

const ALL_FOREGROUND_ACTIVITIES: readonly AppRouteSceneForegroundActivity[] = [
  'idle',
  'editing',
  'suggestions',
  'loading',
  'results',
  'resultsClosing',
  'dockedScene',
];

describe('resolveAppRouteChromeSurfaceTarget', () => {
  it('shows docked chrome only for idle and dockedScene', () => {
    expect(resolveAppRouteChromeSurfaceTarget('idle')).toBe('dockedScene');
    expect(resolveAppRouteChromeSurfaceTarget('dockedScene')).toBe('dockedScene');
  });

  it('shows results chrome for every activity that is neither', () => {
    ALL_FOREGROUND_ACTIVITIES.filter(
      (activity) => activity !== 'idle' && activity !== 'dockedScene'
    ).forEach((activity) => {
      expect(resolveAppRouteChromeSurfaceTarget(activity)).toBe('results');
    });
  });

  it('answers for EVERY member of the activity union — a new arm cannot slip through', () => {
    ALL_FOREGROUND_ACTIVITIES.forEach((activity) => {
      expect(['results', 'dockedScene']).toContain(resolveAppRouteChromeSurfaceTarget(activity));
    });
  });
});
