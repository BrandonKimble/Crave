import type { CameraSnapshot } from '../../../../navigation/runtime/app-route-profile-transition-state-contract';

// L3 slice 4: the prepared-presentation transaction machine is DELETED — this contract is
// the machine-less presentation surface (profile-direct-presentation-runtime.ts): camera
// commit + the standard child push/hide. The legacy method names survive one more pass
// (the action ports/callers keep their spelling); a rename sweep can trail.
export type ProfilePreparedPresentationRuntime = {
  openPreparedProfilePresentation: (
    restaurantId: string,
    targetCamera: CameraSnapshot | null | undefined
  ) => void;
  closePreparedProfilePresentation: (restaurantId: string | null) => void;
  focusPreparedProfileCamera: (targetCamera: CameraSnapshot) => void;
};
