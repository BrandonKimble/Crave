// ─── Panel-module mocks (render lane) ────────────────────────────────────────
//
// Every `overlays/panels/*` module maps here. Mounted bodies are marker
// elements that also RECORD the activity contexts the host actually delivered
// (the activation-bridge falsifier reads those records — delivered values,
// never re-derived). The list-parts hooks read the harness parts store so
// tests can flip a scene between cold/placeholder and real rows.

import React from 'react';
import { useSyncExternalStore } from 'react';

import { harness } from '../harness';
import {
  BottomSheetSceneStackBodyDataActivityContext,
  BottomSheetSceneStackBodyIsActiveContext,
} from '../../../overlays/BottomSheetSceneStackBodyActivityContext';

type BodyProps = { entry?: { entryId?: string } | null };

const makeBody = (scene: string): React.FC<BodyProps> => {
  const Body: React.FC<BodyProps> = ({ entry }) => {
    const activity = React.useContext(BottomSheetSceneStackBodyDataActivityContext);
    const isActive = React.useContext(BottomSheetSceneStackBodyIsActiveContext);
    harness.world.deliveredActivity.set(`${scene}#${entry?.entryId ?? 'root'}`, {
      ...activity,
      isActive,
    });
    return <mounted-body scene={scene} entryId={entry?.entryId ?? null} />;
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

export const usePollsPanelListSceneParts = (): unknown => usePartsFor('polls');
export const useHomePanelListSceneParts = (): unknown => usePartsFor('home');
