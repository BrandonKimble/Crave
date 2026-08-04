// ─── AVATAR SIZES — ONE TABLE (F934(c)) ──────────────────────────────────────────────
//
// `AVATAR_SIZE = 40` was independently defined in FollowListPanel and NotificationsPanel:
// two files that render the SAME visual element — a person row in a list — each holding
// their own copy of its size, so nudging one row's avatar would silently desync the other.
//
// These are the app's avatar SCALE STEPS, named by the role they play rather than by their
// pixel value, so a surface picks a step instead of a number:
//
//  - `list`   (40) — a person row in a scrollable list (follow lists, notifications).
//  - `header` (64) — the subject of the screen (a user profile header).
//  - `chip`   (28) — an inline collaborator/commenter chip inside denser content.
//
// The values are OWNER CHOICES (visual scale), not derivations — recorded as such so no one
// later goes hunting for a formula that was never there. What is structural is that there
// are three steps and each surface names the one it means.
export const AVATAR_SIZES = {
  list: 40,
  header: 64,
  chip: 28,
} as const;

export type AvatarSizeStep = keyof typeof AVATAR_SIZES;
