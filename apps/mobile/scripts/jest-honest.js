#!/usr/bin/env node
/**
 * THE HONEST JEST RUNNER (F830).
 *
 * `jest` exits 0 while a worker DIES. Observed 2026-08-03: one spec left a 50ms
 * timer armed; it fired after teardown, threw
 * `TypeError: userListsService.batchMemberships is not a function`, killed the
 * Node worker — and the run still printed "51 passed" and exited 0. That is
 * CLAUDE.md's always-green disease inside the instrument whose whole job is to
 * catch it: a genuine unhandled rejection is invisible.
 *
 * Jest has no config knob for this (`--detectOpenHandles` only reports, and the
 * worker-death notice is printed outside any reporter's result). So the honest
 * gate lives here: run jest, stream its output verbatim, then FAIL the run if
 * the output contains a marker that means "something ran, or died, outside the
 * tests".
 *
 * PROVABLY RED: delete `batchMemberships` from the mock in
 * src/overlays/panels/save-list-model.spec.ts (its pre-fix shape) and this
 * runner exits 1 naming the marker, where bare `jest` exits 0.
 *
 * Args are passed straight through: `yarn test src/foo.spec.ts -t bar`.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * F9985: the marker names no suite and no handle, so three CI reds taught us
 * nothing. `jest.worker-handle-census.js` (the lane's test environment) writes
 * the worker's live handles here at force-exit; we print them beside the marker.
 * Nothing is written on a clean run.
 */
const censusFile = path.join(os.tmpdir(), `jest-worker-handle-census-${process.pid}.log`);

/** Each marker is a sentence jest prints when work escaped the test lifecycle. */
const FATAL_MARKERS = [
  {
    marker: 'A worker process has failed to exit gracefully',
    why: 'a worker was force-killed — a spec leaked a timer/handle, or crashed after teardown',
  },
  {
    marker: 'A worker process has crashed',
    why: 'a worker crashed outright; its results (pass OR fail) cannot be trusted',
  },
  {
    marker: 'Cannot log after tests are done',
    why: 'code ran after teardown — the same class of leak, one step earlier',
  },
  {
    marker: 'Jest did not exit one second after',
    why: 'an open handle outlived the run',
  },
  {
    marker: 'Force exiting Jest',
    why: 'jest gave up waiting on open handles',
  },
];

const jestBin = path.resolve(__dirname, '..', '..', '..', 'node_modules', '.bin', 'jest');
const child = spawn(jestBin, process.argv.slice(2), {
  cwd: path.resolve(__dirname, '..'),
  env: { ...process.env, JEST_WORKER_HANDLE_CENSUS_FILE: censusFile },
});

let captured = '';
const tee = (stream, target) => {
  stream.on('data', (chunk) => {
    captured += chunk.toString();
    target.write(chunk);
  });
};
tee(child.stdout, process.stdout);
tee(child.stderr, process.stderr);

child.on('error', (error) => {
  process.stderr.write(`[jest-honest] could not start jest: ${error.message}\n`);
  process.exit(1);
});

child.on('close', (code, signal) => {
  // THE RACE THAT LOST THE FIRST LIVE FIRING (CI run 31300503095): the worker is
  // SIGTERM'd as jest shuts down, so its dump can land AFTER jest's own exit. We
  // read once jest has closed and, if a fatal marker fired, wait for the dump —
  // jest SIGKILLs the worker 500ms after SIGTERM, so 3s is a generous ceiling.
  const readCensus = () => (fs.existsSync(censusFile) ? fs.readFileSync(censusFile, 'utf8') : '');
  let census = readCensus();
  if (!census && FATAL_MARKERS.some(({ marker }) => captured.includes(marker))) {
    const deadline = Date.now() + 3000;
    while (!census && Date.now() < deadline) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
      census = readCensus();
    }
  }
  if (census) {
    fs.rmSync(censusFile, { force: true });
  }
  const hits = FATAL_MARKERS.filter(({ marker }) => captured.includes(marker));
  if (hits.length > 0) {
    process.stderr.write(
      '\n[jest-honest] THE SUITE IS NOT GREEN. Jest reported ' +
        `exit code ${code}, but work escaped the test lifecycle:\n` +
        hits.map(({ marker, why }) => `  - "${marker}"\n      ${why}\n`).join('') +
        (census ? `\nWhat the force-exited worker still had open:\n${census}` : '') +
        '  Fix the leak (disarm timers in afterEach; mock every method the\n' +
        '  import graph can reach) — do not silence this check.\n'
    );
    process.exit(1);
  }
  if (signal) {
    process.stderr.write(`\n[jest-honest] jest was killed by ${signal}.\n`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});
