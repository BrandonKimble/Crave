/**
 * F5803 discriminator — the wire vocabulary IS the enum, and a new member cannot pass.
 *
 * `NotificationType` is a closed Prisma enum; mobile cannot import @prisma/client, so
 * @crave-search/shared restates it as `NotificationTypeName` and
 * UserNotificationFeedService pins the two together with `satisfies` on the wire item.
 * That pin is a COMPILE-TIME fact, so this file proves it at compile time — the runtime
 * assertions below only keep jest honest about having loaded the module.
 *
 * THE PROVING MUTATION, and why it lives here rather than in schema.prisma: adding a third
 * member to the real enum would need a migration and a client regeneration to typecheck at
 * all. `WidenedNotificationType` below IS that third member, as a type — and the
 * `@ts-expect-error` is the assertion. Delete the shared union's pin (widen
 * `NotificationTypeName` to `string`) and the expected error DISAPPEARS, so tsc fails on the
 * unused `@ts-expect-error`: the discriminator reds in the direction that matters.
 */
import { $Enums } from '@prisma/client';
import {
  NOTIFICATION_TYPES,
  type NotificationTypeName,
} from '@crave-search/shared';

/** The enum as it would look one migration from now. */
type WidenedNotificationType = $Enums.NotificationType | 'restaurant_movement';

describe('notification wire vocabulary', () => {
  it('is exactly the Prisma enum today', () => {
    expect([...NOTIFICATION_TYPES].sort()).toEqual(
      Object.values($Enums.NotificationType).sort(),
    );
  });

  it('refuses a widened enum at compile time', () => {
    const widened = 'restaurant_movement' as WidenedNotificationType;
    // @ts-expect-error a new NotificationType member has no home in the wire vocabulary
    // until someone widens the shared union — which then reds the client's exhaustive
    // copy switch, where the user-facing sentence gets written.
    const asWire: NotificationTypeName = widened;
    expect(asWire).toBe('restaurant_movement');
  });

  it('accepts every member the enum actually has', () => {
    for (const member of Object.values($Enums.NotificationType)) {
      const asWire: NotificationTypeName = member;
      expect(NOTIFICATION_TYPES).toContain(asWire);
    }
  });
});
