// ─── Panel-module mocks (render lane) ────────────────────────────────────────
//
// Every `overlays/panels/*` module maps here. Mounted bodies are marker
// elements that also RECORD the activity contexts the host actually delivered
// (the activation-bridge falsifier reads those records — delivered values,
// never re-derived). The feed-scene-parts registry reader (the resolver's ONE
// way to the polls/home list parts — the runtimes themselves are owned by the
// app-shell writer host, outside this lane) reads the harness parts store so
// tests can flip a scene between cold/placeholder and real rows.

import React from 'react';
import { useSyncExternalStore } from 'react';

import { harness } from '../harness';
import {
  BottomSheetSceneStackBodyDataActivityContext,
  BottomSheetSceneStackBodyIsActiveContext,
} from '../../../overlays/BottomSheetSceneStackBodyActivityContext';
// The REAL gate, deliberately un-mocked: its pending face resolves the scene's
// foundation material through SceneBodySceneKeyContext, which the TRACK host
// must provide (the old host was the only other provider — blank-pending bug,
// skeleton-path audit 2026-08-08). Its own imports ride this lane's existing
// module map (skeletons → surfaces-mock, scene-foundation-spec → runtime-mock).
import { SceneBodyReadyGate } from '../../../overlays/SceneBodyReadyGate';

type BodyProps = { entry?: { entryId?: string } | null };

const makeBody = (scene: string): React.FC<BodyProps> => {
  const Body: React.FC<BodyProps> = ({ entry }) => {
    const activity = React.useContext(BottomSheetSceneStackBodyDataActivityContext);
    const isActive = React.useContext(BottomSheetSceneStackBodyIsActiveContext);
    harness.world.deliveredActivity.set(`${scene}#${entry?.entryId ?? 'root'}`, {
      ...activity,
      isActive,
    });
    const marker = <mounted-body scene={scene} entryId={entry?.entryId ?? null} />;
    if (harness.world.mountedBodyPendingScenes.has(scene)) {
      // An unready panel query: the gate must paint the scene's DECLARED
      // pending material (never blank) — which requires the host-provided
      // scene-key context.
      return <SceneBodyReadyGate pending>{marker}</SceneBodyReadyGate>;
    }
    return marker;
  };
  Body.displayName = `MockBody(${scene})`;
  return Body;
};

export const ListsMountedSceneBody = makeBody('lists');
export const ProfileMountedSceneBody = makeBody('profile');
export const SaveListMountedSceneBody = makeBody('saveList');
export const UserProfileMountedSceneBody = makeBody('userProfile');
export const ListDetailMountedSceneBody = makeBody('listDetail');
export const FollowListMountedSceneBody = makeBody('followList');
export const NotificationsMountedSceneBody = makeBody('notifications');
export const SettingsMountedSceneBody = makeBody('settings');
export const EditProfileMountedSceneBody = makeBody('editProfile');
export const PostPhotosPanelBody = makeBody('postPhotos');
export const MessagesInboxPanelBody = makeBody('messagesInbox');
export const DmSessionPanelBody = makeBody('dmSession');

const usePartsFor = (scene: 'polls' | 'home') =>
  useSyncExternalStore(
    harness.world.partsStore.subscribe,
    () => harness.world.partsStore.get()[scene]
  );

export const useFeedSceneParts = (scene: 'polls' | 'home'): unknown => usePartsFor(scene);
