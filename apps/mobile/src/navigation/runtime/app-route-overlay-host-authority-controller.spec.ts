import { createAppRouteOverlayHostAuthorityController } from './app-route-overlay-host-authority-controller';

describe('app-route-overlay-host-authority-controller — F1362', () => {
  it('bumps the publication version when the restaurant authority swaps with an unchanged searchInteractionRef', () => {
    const controller = createAppRouteOverlayHostAuthorityController();
    const { authoritySurface, publicationLane } = controller;

    const ref = { id: 'stable-ref' } as unknown as Parameters<
      typeof publicationLane.publishSearchInteractionRef
    >[0];
    publicationLane.publishSearchInteractionRef(ref);

    const versionBefore = authoritySurface.getOverlayHostPublicationVersionSnapshot();
    let notified = false;
    const unsubscribe = authoritySurface.subscribeOverlayHostPublicationVersion(() => {
      notified = true;
    });

    const nextAuthority = {
      getSnapshot: () => null,
      subscribe: () => () => {},
    } as unknown as Parameters<
      typeof publicationLane.publishOverlayRestaurantHostAuthorities
    >[0]['overlayLocalRestaurantSheetHostAuthority'];

    publicationLane.publishOverlayRestaurantHostAuthorities({
      overlayLocalRestaurantSheetHostAuthority: nextAuthority,
    });

    // The ref itself never changed — proving a consumer subscribed ONLY to
    // getSearchInteractionRefSnapshot would bail out (Object.is(ref, ref)).
    expect(authoritySurface.getSearchInteractionRefSnapshot()).toBe(ref);
    // But the publication version — the channel that forces the host boundary to
    // re-read the live authority getter — must have moved, and the listener must fire.
    expect(authoritySurface.getOverlayHostPublicationVersionSnapshot()).toBe(versionBefore + 1);
    expect(notified).toBe(true);
    expect(authoritySurface.overlayLocalRestaurantSheetHostAuthority).toBe(nextAuthority);

    unsubscribe();
  });
});
