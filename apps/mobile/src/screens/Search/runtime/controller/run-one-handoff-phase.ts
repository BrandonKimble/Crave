export type RunOneHandoffPhase =
  | 'idle'
  | 'h1_phase_a_committed'
  | 'h2_marker_enter'
  | 'h3_hydration_ramp'
  | 'h4_chrome_resume';

export const RUN_ONE_HANDOFF_PHASE_ORDER: readonly RunOneHandoffPhase[] = [
  'idle',
  'h1_phase_a_committed',
  'h2_marker_enter',
  'h3_hydration_ramp',
  'h4_chrome_resume',
];

export const isRunOneHandoffDeferredChromePhase = (phase: RunOneHandoffPhase): boolean =>
  phase === 'h2_marker_enter' || phase === 'h3_hydration_ramp';
