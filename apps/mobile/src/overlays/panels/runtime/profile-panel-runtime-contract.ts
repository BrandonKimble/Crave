// Identity chrome props for the root profile TAB (own profile). The FOUR-section body itself is
// the shared ProfileSectionsBody — the root keeps only its own chrome (identity header + the
// metrics FrostCutout), so this contract carries just the identity axis, not the sections.
export type ProfileSceneHeaderProps = {
  avatarUrl?: string | null;
  initials: string;
  displayName: string;
  usernameLabel: string;
  pollsCreatedCount: number;
  pollsContributedCount: number;
  followersCount: number;
  followingCount: number;
  // False while the profile query is still resolving (profile === undefined). Drives the
  // identity chrome to render name/avatar/stat skeletons instead of the 'Crave Explorer'/
  // 'Pick a username'/'C'/0-count text fallbacks, which would otherwise flash on the hard-swap
  // header for the seeded-but-not-yet-loaded window.
  identityResolved: boolean;
  onOpenSettings: () => void;
  // W3 messaging (§4.4 entry 2): own-profile header → messagesInbox child push.
  onOpenMessages: () => void;
};

export type ProfilePanelActionsRuntime = {
  isSignedIn: boolean;
  handleOpenSettings: () => void;
  handleOpenMessages: () => void;
};
