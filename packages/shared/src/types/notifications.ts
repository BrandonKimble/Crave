/**
 * THE NOTIFICATION VOCABULARY — one closed set, shared by both apps (F5803).
 *
 * `NotificationType` is a Prisma enum with exactly two members
 * (apps/api/prisma/schema.prisma). It reached the client as `type: string`, and
 * NotificationsPanel's copy switch therefore needed a `default` returning
 * 'Something happened' — a branch unreachable for every value the server can send, and a
 * silent shipped placeholder the moment a third member is added. The contrast that made
 * that a defect rather than a style note was on the OTHER side of the same enum:
 * notification-dispatcher.service.ts handles this vocabulary with an explicit case per
 * member and a `never` binding in the default, and its spec asserts the in-app-feed-only
 * type "fails LOUD via an explicit case". The server treats an unhandled notification type
 * as a defect; the client treated it as copy.
 *
 * Mobile cannot import @prisma/client, so the vocabulary is restated ONCE here and PINNED
 * to the enum on the server side: UserNotificationFeedService writes
 * `type: row.type satisfies NotificationTypeName` on the wire item, so a new Prisma member
 * stops compiling in the API before it can reach a client switch with no case for it. Then
 * widening this union to admit it breaks the client's exhaustive switch, which is where
 * someone has to write the sentence a user will read.
 */
export const NOTIFICATION_TYPES = ['poll_release', 'follower_added'] as const;

/** Every notification type the server can put on the wire. */
export type NotificationTypeName = (typeof NOTIFICATION_TYPES)[number];
