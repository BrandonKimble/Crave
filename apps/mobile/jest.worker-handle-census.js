/**
 * THE WORKER-HANDLE CENSUS (F9985).
 *
 * `scripts/jest-honest.js` reds the run when jest prints "A worker process has
 * failed to exit gracefully" — but jest prints that sentence and NOTHING ELSE.
 * It names no suite, no timer, no handle. So the honest runner can tell you the
 * suite is dirty and cannot tell you what dirtied it, which is how F9985 sat
 * OPEN across three CI reds.
 *
 * This environment closes that gap from inside the worker, where the evidence
 * actually lives. jest force-exits a worker by sending it SIGTERM 500ms after
 * the END handshake; the handles still open at that instant ARE the leak. We
 * catch that signal and print them — constructor name plus, for a timer or an
 * immediate, the SOURCE of its callback, which names the owning module.
 *
 * It is silent on a clean run: no SIGTERM arrives, `exit` fires with an empty
 * handle set, nothing is written. It only speaks on the failure it exists to
 * explain, so it costs nothing to leave armed forever.
 *
 * WHY AN ENVIRONMENT AND NOT A SETUP FILE: `setupFilesAfterEnv` runs inside the
 * jest sandbox, whose `process` is a COPY installed by jest-environment-node —
 * listeners registered there never fire, measured 2026-08-09. An environment
 * module is required by the worker itself, so `process` is the real one.
 *
 * Sockets/pipes/streams are filtered out: those are the worker's own IPC channel
 * and stdio, alive by design.
 */
const { TestEnvironment: NodeEnvironment } = require('jest-environment-node');

/**
 * `process._getActiveHandles()` DOES NOT REPORT TIMERS on Node 22 — measured
 * 2026-08-09, and it cost this finding a whole investigation round: a census
 * built on it reported 174/174 suites clean while five of them were ending with
 * a live Immediate. `process.getActiveResourcesInfo()` is the honest list; the
 * handle list is kept only because it can still name a socket or a stream.
 */
const activeResourceKinds = () =>
  process
    .getActiveResourcesInfo()
    .filter((kind) => !/^(TTYWrap|PipeWrap|FileHandle|Signal)/.test(kind));

const describeHandle = (handle) => {
  const name = handle && handle.constructor ? handle.constructor.name : String(handle);
  const callback = handle && (handle._onTimeout || handle._onImmediate);
  if (!callback) return name;
  return `${name} cb=${String(callback).slice(0, 600).replace(/\s+/g, ' ')}`;
};

/** The worker's own IPC + stdio. Alive by design; never the leak. */
const IS_INFRASTRUCTURE = /^(WriteStream|ReadStream|Socket|Pipe|TTY|ChildProcess)/;

const censusLines = () =>
  activeResourceKinds()
    .map((kind) => `resource: ${kind}`)
    .concat(
      process
        ._getActiveHandles()
        .map(describeHandle)
        .filter((entry) => !IS_INFRASTRUCTURE.test(entry))
    )
    .concat(process._getActiveRequests().map(describeHandle));

// The report CANNOT go to stderr: jest has stopped draining the worker's pipes by
// the time it force-exits it (measured — a stderr write from the SIGTERM handler
// never reached the run's output). It goes to a file the honest runner nominates
// via CENSUS_FILE and prints after the fact.
const CENSUS_FILE = process.env.JEST_WORKER_HANDLE_CENSUS_FILE;

const report = (cause, lastTestPath) => {
  const entries = censusLines();
  if (entries.length === 0 && cause !== 'was force-exited by jest (SIGTERM)') return;
  const text =
    `[worker-handle-census] worker ${process.pid} ${cause}. Last suite in this ` +
    `worker: ${lastTestPath ?? '(none)'}\n` +
    (entries.length === 0
      ? '  No non-infrastructure handles were open at force-exit — the worker was SLOW\n' +
        '  to exit, not leaking. (jest force-exits 500ms after the END handshake.)\n'
      : entries.map((entry) => `  - ${entry}\n`).join(''));
  if (CENSUS_FILE) {
    require('fs').appendFileSync(CENSUS_FILE, text);
  } else {
    process.stderr.write('\n' + text);
  }
};

class WorkerHandleCensusEnvironment extends NodeEnvironment {
  constructor(config, context) {
    super(config, context);
    WorkerHandleCensusEnvironment.lastTestPath = context.testPath;
    if (process.__workerHandleCensusArmed) return;
    process.__workerHandleCensusArmed = true;
    process.on('SIGTERM', () => {
      report('was force-exited by jest (SIGTERM)', WorkerHandleCensusEnvironment.lastTestPath);
      process.exit(1);
    });
    process.on('exit', () => {
      report('exited with handles still open', WorkerHandleCensusEnvironment.lastTestPath);
    });
  }
}

module.exports = WorkerHandleCensusEnvironment;
