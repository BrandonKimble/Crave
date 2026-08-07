import {
  resolveShareLinkMode,
  resolveShareSendMode,
  type ShareModalConfig,
} from './share-modal-store';

/**
 * F3701 — THE REFUSAL A COMMENT CREDITED AND NO CODE PERFORMED.
 *
 * `ShareModalHost.tsx` stated the guarantee at the fan-out: `sharedEntitySlug` is null
 * "for a list the viewer cannot mint one for — in which case the send is REFUSED ABOVE
 * rather than delivering a dead preview", and `messaging.ts` restated it from the other
 * side. Traced line by line, nothing refused anything: `confirmEnableShareThen` ran the
 * callback immediately for any mode other than 'needs-enable', the capability resolver
 * returned `undefined` with no branch, and `showSendSection` never consulted the link
 * verdict at all. The exact dead preview F834 exists to prevent was reachable from a
 * COLLABORATOR's Share button.
 *
 * The config below is not hypothetical. `ListDetailPanel.tsx:1443` and `:1670` build it:
 * `listShareSlug: list.shareEnabled ? slug : null` and `listOwnedByViewer: viewerRole ===
 * 'owner'`. A collaborator on a share-disabled list therefore produces slug null and
 * owned false.
 */
const collaboratorOnShareDisabledList: ShareModalConfig = {
  kind: 'list',
  id: 'list-1',
  title: 'Dinner spots',
  listShareSlug: null,
  listOwnedByViewer: false,
};

describe('resolveShareSendMode', () => {
  it('REFUSES the collaborator path — the one that shipped visible', () => {
    // The link rows already hid for this config; the Send section did not.
    expect(resolveShareLinkMode(collaboratorOnShareDisabledList)).toBe('none');
    expect(resolveShareSendMode(collaboratorOnShareDisabledList)).toBe('no-capability');
  });

  it('still allows the OWNER of a slug-less list — consent-then-mint is a real path', () => {
    // The one case that must NOT be refused: enableShare is the owner's to call, and
    // `confirmEnableShareThen` asks first. Collapsing this into the refusal would fix
    // the bug by deleting the feature.
    const owner: ShareModalConfig = {
      ...collaboratorOnShareDisabledList,
      listOwnedByViewer: true,
    };

    expect(resolveShareLinkMode(owner)).toBe('needs-enable');
    expect(resolveShareSendMode(owner)).toBe('ready');
  });

  it('allows a list that already has a slug, whoever is looking at it', () => {
    expect(
      resolveShareSendMode({
        ...collaboratorOnShareDisabledList,
        listShareSlug: 'abc123',
      })
    ).toBe('ready');
  });

  it('hides send for a CURATED list without confusing it with the refusal', () => {
    // Two different reasons to hide, and they must stay distinguishable: curated is a
    // resolver gap (a follow-up), no-capability is an access fact about this viewer.
    expect(
      resolveShareSendMode({
        kind: 'list',
        id: 'curated-1',
        listSource: 'curated',
        listType: 'restaurant',
      })
    ).toBe('unsupported-kind');
  });

  it('leaves every kind that needs no capability alone', () => {
    for (const kind of ['restaurant', 'dish', 'poll', 'user_profile', 'comment'] as const) {
      expect(resolveShareSendMode({ kind, id: 'x' })).toBe('ready');
    }
  });
});
