import * as fs from 'fs';
import * as path from 'path';

// ─── THE LOAD-FAILURE LAW SWEEP (wave-4 §1) — the RED contract ───────────────────────────────
//
// Page-local load-retry UIs are BANNED: a load failure announces the ONE shared modal
// (announceFailureIfOnline via SceneBodyReadyGate's `failure` input) and, for child scenes,
// pops back to the trigger screen on dismissal. This sweep turns any reintroduction RED.
// (Action retries — resending a message, re-polling an upload — are a different class and
// carry different labels; the banned signature is the load-retry one.)

const PANELS_DIR = path.join(__dirname, 'panels');

const listPanelSources = (): string[] =>
  fs
    .readdirSync(PANELS_DIR, { recursive: true })
    .map(String)
    .filter((name) => name.endsWith('.tsx') || name.endsWith('.ts'))
    .map((name) => path.join(PANELS_DIR, name));

describe('scene load-failure law (wave-4 §1)', () => {
  it('no panel renders a page-local load-retry control', () => {
    const offenders: string[] = [];
    for (const file of listPanelSources()) {
      const source = fs.readFileSync(file, 'utf8');
      // The load-retry signature: an accessibility label of the "Retry loading …" family.
      if (/accessibilityLabel="Retry loading /.test(source)) {
        offenders.push(path.relative(PANELS_DIR, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no panel hand-rolls the shared failure copy outside the gate', () => {
    const offenders: string[] = [];
    for (const file of listPanelSources()) {
      const source = fs.readFileSync(file, 'utf8');
      // "We couldn't load …" rendered as page copy (curly or straight apostrophe) is the
      // old local-error body; the law renders the shared modal instead. Panels may still
      // mention the phrase in comments — only JSX text hits (inside a Text child) count.
      if (/>\s*We couldn[’']t load /.test(source)) {
        offenders.push(path.relative(PANELS_DIR, file));
      }
    }
    expect(offenders).toEqual([]);
  });
});
