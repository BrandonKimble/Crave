import { createAppRouteSceneInputController } from './app-route-scene-input-registry';
import type { AppRouteSceneBodyAdmissionPolicy } from './app-route-scene-descriptor-contract';

/**
 * F5410 — OMISSION AND EXPLICIT-NULL ARE DIFFERENT ANSWERS, AND THE POLICY MUST BE CLEARABLE.
 *
 * `publishSceneBody` resolved its optional admission policy with
 * `sceneBodyAdmissionPolicy ?? previous`. `??` answers "is this nullish"; a preserve-or-clear
 * API is asking "did the caller say anything". `null ?? previous` IS `previous`, so an
 * explicit null was indistinguishable from omission and the policy survived every subsequent
 * body publish until `clearSceneBody`/`clearSceneInput` ran. The correct discrimination —
 * `=== undefined` — already sat eight lines below on the entry stamp, with a comment
 * explaining why it mattered.
 *
 * MUTATION: restore `sceneBodyAdmissionPolicy ?? previousSceneInput.sceneBodyAdmissionPolicy`
 * and the CLEAR case below goes RED (the policy comes back).
 */

const POLICY: AppRouteSceneBodyAdmissionPolicy = {
  retainMountedBodyDuringTransition: true,
  prewarmRetainedMountedBody: true,
};

const createRegistry = () => createAppRouteSceneInputController();

const publishBody = (
  controller: ReturnType<typeof createRegistry>,
  args: { sceneBodyAdmissionPolicy?: AppRouteSceneBodyAdmissionPolicy | null }
): void => {
  controller.actions.publishSceneBody({
    sceneKey: 'polls',
    sceneBodyContent: null,
    sceneBodyTransport: null,
    ...args,
  });
};

const policyOf = (controller: ReturnType<typeof createRegistry>) =>
  controller.authority.getSceneInputSnapshot('polls')?.sceneBodyAdmissionPolicy ?? null;

describe('F5410 — the scene-body admission policy is clearable', () => {
  it('an OMITTED policy preserves the previous one', () => {
    const controller = createRegistry();
    publishBody(controller, { sceneBodyAdmissionPolicy: POLICY });
    expect(policyOf(controller)).toEqual(POLICY);

    publishBody(controller, {});
    expect(policyOf(controller)).toEqual(POLICY);
  });

  it('an EXPLICIT null CLEARS it — the case `??` could not express', () => {
    const controller = createRegistry();
    publishBody(controller, { sceneBodyAdmissionPolicy: POLICY });
    expect(policyOf(controller)).toEqual(POLICY);

    publishBody(controller, { sceneBodyAdmissionPolicy: null });
    expect(policyOf(controller)).toBeNull();
  });

  it('the sibling verb `publishSceneDescriptor` RESETS on omission — the opposite meaning, by design', () => {
    // A descriptor publish is a WHOLE descriptor: anything the caller did not state is
    // genuinely absent. A body publish is a partial update. Both meanings are correct; only
    // one of them used to be documented, and the other did not work.
    const controller = createRegistry();
    publishBody(controller, { sceneBodyAdmissionPolicy: POLICY });
    expect(policyOf(controller)).toEqual(POLICY);

    controller.actions.publishSceneDescriptor({
      sceneKey: 'polls',
      shellSpec: null,
      sceneChrome: null,
      sceneBodyContent: null,
      sceneBodyTransport: null,
    });
    expect(policyOf(controller)).toBeNull();
  });
});
