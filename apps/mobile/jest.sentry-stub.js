/**
 * Hermetic-lane stub for @sentry/react-native.
 *
 * The mobile logic project is a PURE decision layer that runs in plain Node — it has no
 * native modules and no Metro/babel transform for node_modules. `@sentry/react-native`
 * ships untranspiled ESM, so a pure module that reaches the app's real Release-visible
 * error sink (`observability/crash-reporting` → `captureHandledError`) used to break the
 * whole suite's parse step.
 *
 * That sink is exactly what the swallowed-error repairs (F913/F924/F960/F979) route
 * their failures through, so the fix is a stub, not a retreat to `console`: the specs
 * care about the DECISION (did we report?), never about Sentry's transport.
 */
module.exports = new Proxy(
  {
    init: () => undefined,
    wrap: (component) => component,
    captureException: () => undefined,
  },
  {
    get: (target, property) => (property in target ? target[property] : () => undefined),
  }
);
