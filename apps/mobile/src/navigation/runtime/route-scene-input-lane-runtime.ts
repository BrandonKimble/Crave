import type {
  AppRouteSceneForegroundPolicyInputs,
  AppRouteSceneSheetPolicyInputs,
} from './app-route-scene-policy-contract';
import type {
  AppRouteSceneBodyAdmissionPolicy,
  AppRouteSceneBodyContentSpec,
  AppRouteSceneBodyTransportSpec,
  AppRouteSceneChromePublication,
  AppRouteSceneStackShellSpec,
} from './app-route-scene-descriptor-contract';
import {
  type AppRouteSceneInputKey,
  type AppRouteSceneInputActions,
} from './app-route-scene-input-registry';

export type RouteShellSceneInputLane = {
  /** F5418: single-scene by type — the policy controller's state IS the search scene. */
  publishRouteSceneForegroundPolicyInputs: (args: {
    foregroundPolicyInputs: AppRouteSceneForegroundPolicyInputs;
  }) => void;
  publishRouteSceneSheetPolicyInputs: (args: {
    sheetPolicyInputs: AppRouteSceneSheetPolicyInputs;
  }) => void;
  publishRouteSceneDescriptor: (args: {
    sceneKey: AppRouteSceneInputKey;
    shellSpec: AppRouteSceneStackShellSpec | null;
    sceneChrome: AppRouteSceneChromePublication | null;
    sceneBodyContent: AppRouteSceneBodyContentSpec | null;
    sceneBodyTransport: AppRouteSceneBodyTransportSpec | null;
    sceneBodyAdmissionPolicy?: AppRouteSceneBodyAdmissionPolicy | null;
  }) => void;
  publishRouteSceneShell: (args: {
    sceneKey: AppRouteSceneInputKey;
    shellSpec: AppRouteSceneStackShellSpec | null;
  }) => void;
  publishRouteSceneChrome: (args: {
    sceneKey: AppRouteSceneInputKey;
    sceneChrome: AppRouteSceneChromePublication | null;
  }) => void;
  publishRouteSceneBody: (args: {
    sceneKey: AppRouteSceneInputKey;
    sceneBodyContent: AppRouteSceneBodyContentSpec | null;
    sceneBodyTransport: AppRouteSceneBodyTransportSpec | null;
    sceneBodyAdmissionPolicy?: AppRouteSceneBodyAdmissionPolicy | null;
    /** Entry stamp (track R6): the route entryId this body renders FOR —
     * stackable scenes (pollDetail) stamp so a same-scene pop cannot alias
     * the outgoing entry's rows into the incoming one. */
    sceneBodyForEntryId?: string | null;
  }) => void;
  clearRouteSceneBody: (sceneKey: AppRouteSceneInputKey) => void;
  clearRouteSceneInput: (sceneKey: AppRouteSceneInputKey) => void;
};

export const createRouteSceneInputLane = ({
  sceneInputActions,
  scenePolicyInputAuthority,
}: {
  sceneInputActions: AppRouteSceneInputActions;
  scenePolicyInputAuthority: {
    setForegroundPolicyInputs: (args: {
      foregroundPolicyInputs: AppRouteSceneForegroundPolicyInputs;
    }) => void;
    setSheetPolicyInputs: (args: { sheetPolicyInputs: AppRouteSceneSheetPolicyInputs }) => void;
  };
}): RouteShellSceneInputLane => ({
  publishRouteSceneForegroundPolicyInputs: ({ foregroundPolicyInputs }) => {
    scenePolicyInputAuthority.setForegroundPolicyInputs({ foregroundPolicyInputs });
  },
  publishRouteSceneSheetPolicyInputs: ({ sheetPolicyInputs }) => {
    scenePolicyInputAuthority.setSheetPolicyInputs({ sheetPolicyInputs });
  },
  publishRouteSceneDescriptor: sceneInputActions.publishSceneDescriptor,
  publishRouteSceneShell: sceneInputActions.publishSceneShell,
  publishRouteSceneChrome: sceneInputActions.publishSceneChrome,
  publishRouteSceneBody: sceneInputActions.publishSceneBody,
  clearRouteSceneBody: sceneInputActions.clearSceneBody,
  clearRouteSceneInput: sceneInputActions.clearSceneInput,
});
