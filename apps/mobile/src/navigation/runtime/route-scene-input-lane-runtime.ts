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
import type { RouteScenePolicyKey } from './route-scene-policy-authority-contract';

export type RouteShellSceneInputLane = {
  publishRouteSceneForegroundPolicyInputs: (args: {
    sceneKey: RouteScenePolicyKey;
    foregroundPolicyInputs: AppRouteSceneForegroundPolicyInputs;
  }) => void;
  publishRouteSceneSheetPolicyInputs: (args: {
    sceneKey: RouteScenePolicyKey;
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
  }) => void;
  clearRouteSceneShell: (sceneKey: AppRouteSceneInputKey) => void;
  clearRouteSceneChrome: (sceneKey: AppRouteSceneInputKey) => void;
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
      sceneKey: RouteScenePolicyKey;
      foregroundPolicyInputs: AppRouteSceneForegroundPolicyInputs;
    }) => void;
    setSheetPolicyInputs: (args: {
      sceneKey: RouteScenePolicyKey;
      sheetPolicyInputs: AppRouteSceneSheetPolicyInputs;
    }) => void;
  };
}): RouteShellSceneInputLane => ({
  publishRouteSceneForegroundPolicyInputs: ({ sceneKey, foregroundPolicyInputs }) => {
    scenePolicyInputAuthority.setForegroundPolicyInputs({
      sceneKey,
      foregroundPolicyInputs,
    });
  },
  publishRouteSceneSheetPolicyInputs: ({ sceneKey, sheetPolicyInputs }) => {
    scenePolicyInputAuthority.setSheetPolicyInputs({
      sceneKey,
      sheetPolicyInputs,
    });
  },
  publishRouteSceneDescriptor: sceneInputActions.publishSceneDescriptor,
  publishRouteSceneShell: sceneInputActions.publishSceneShell,
  publishRouteSceneChrome: sceneInputActions.publishSceneChrome,
  publishRouteSceneBody: sceneInputActions.publishSceneBody,
  clearRouteSceneShell: sceneInputActions.clearSceneShell,
  clearRouteSceneChrome: sceneInputActions.clearSceneChrome,
  clearRouteSceneBody: sceneInputActions.clearSceneBody,
  clearRouteSceneInput: sceneInputActions.clearSceneInput,
});
