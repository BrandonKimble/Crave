// The host's dev-only wiring (liveness sampling/audit, perf probes) is part of
// what this lane falsifies — run as a dev build.
globalThis.__DEV__ = true;
// React 19: act() requires the environment to declare itself.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// The page's dev perf probe schedules rAF; node has none.
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
