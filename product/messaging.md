# Messaging / DMs (owner decision 2026-07-10: IN)

Reverses the earlier "mentioned nowhere" status. Registry §7.9 carries the
page entries.

- Entry points: Message button on every other user's profile (right of
  Follow, Instagram-style pair) → DM session page (CHILD of that profile;
  back returns to their profile; sheet fully extends on entry, returns to
  prior snap on back). Messages INBOX = child of OWN profile (header
  button), lists all conversations, opens sessions.
- SHIPPED W3 (registry run, 2026-07-11): M1 backend (conversations +
  messages schema, 9 endpoints, REST + polling v1 architected so realtime
  swaps in without schema change) + M2 scenes (messagesInbox + dmSession,
  entry-keyed, all entry points). Design of record:
  plans/w3-messaging-design.md. Request lane (non-friends), blocking
  interaction, and unread badge are built; push notifications for DMs =
  a stub awaiting hookup. Visuals crude by design — owner refines
  presentation later.
