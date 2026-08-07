/**
 * F983/F2400/F2954 — the ONE home for the transport-owned FlashList merge.
 *
 * FlashList 2.x ships maintainVisibleContentPosition (chat-style anchoring) ON
 * by default. On a list whose rows RE-ORDER (a re-sortable feed) it anchors the
 * old top row and scrolls the header/filter strip off-screen (CLAUDE.md's MVCP
 * law). MVCP used to be opt-OUT per scene, threaded through spread order at
 * four merge sites with no structural guard — a re-sortable feed silently broke
 * the law before. F983 inverted it: the TRANSPORT owns the default (disabled)
 * and a scene must explicitly opt IN by passing its own
 * maintainVisibleContentPosition in flashListProps (spread after the default —
 * the opt-in door for a future append/chat list; no caller uses it today, see
 * D69 note 3: the contract's Omit list deliberately does NOT omit it).
 *
 * This module extracts the merge as a pure function so the default's presence
 * AND its position before the scene spread are spec-proven
 * (sceneFlashListPropsMerge.spec.ts), instead of living as four hand-copied
 * literals inside component-body useMemos.
 */

/** The transport-owned default: MVCP disabled unless a scene opts back in. */
export const SCENE_FLASH_LIST_MVCP_DEFAULT = {
  maintainVisibleContentPosition: { disabled: true },
} as const;

type OverridePropsRecord = Record<string, unknown>;

export type MergeSceneFlashListPropsInput<
  TBase extends object,
  TScene extends object | undefined,
  TForced extends object,
> = {
  /** Site defaults spread BEFORE scene props — a scene value wins over these. */
  base: TBase;
  /** The scene's flashListProps — wins over base AND the MVCP default (the opt-in door). */
  sceneProps: TScene;
  /** Site-forced fields spread AFTER scene props — these win over the scene. */
  forced?: TForced;
  /** overrideProps entries the scene's own overrideProps may override. */
  baseOverrideProps?: OverridePropsRecord;
  /** overrideProps entries that win over the scene's overrideProps. */
  forcedOverrideProps?: OverridePropsRecord;
};

/**
 * Pure merge for every transport→FlashList props hand-off. Order is the
 * contract: MVCP default → base → scene (opt-in door) → forced; overrideProps
 * nests the same way (base → scene → forced).
 */
export const mergeSceneFlashListProps = <
  TBase extends object,
  TScene extends object | undefined,
  TForced extends object = Record<never, never>,
>({
  base,
  sceneProps,
  forced,
  baseOverrideProps,
  forcedOverrideProps,
}: MergeSceneFlashListPropsInput<TBase, TScene, TForced>): Omit<
  TBase & typeof SCENE_FLASH_LIST_MVCP_DEFAULT & NonNullable<TScene> & TForced,
  'overrideProps'
> & { overrideProps: OverridePropsRecord } =>
  // The one assertion lives HERE, not at the four call sites: tsc cannot relate a
  // generic object-spread chain back to the declared intersection (TS2322 on the
  // literal), but the runtime shape IS that intersection — the spec proves the
  // merge order key by key.
  ({
    ...base,
    ...SCENE_FLASH_LIST_MVCP_DEFAULT,
    // The default sits immediately before the scene spread: a scene override wins.
    ...sceneProps,
    ...forced,
    overrideProps: {
      ...(baseOverrideProps ?? {}),
      ...((sceneProps as { overrideProps?: OverridePropsRecord } | undefined)?.overrideProps ?? {}),
      ...(forcedOverrideProps ?? {}),
    },
  }) as Omit<
    TBase & typeof SCENE_FLASH_LIST_MVCP_DEFAULT & NonNullable<TScene> & TForced,
    'overrideProps'
  > & { overrideProps: OverridePropsRecord };
