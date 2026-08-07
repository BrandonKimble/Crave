# Messaging / DMs

Direct messaging is IN. Registry §7.9 carries the page entries.

- Entry points: Message button on every other user's profile (right of
  Follow, Instagram-style pair) → DM session page (CHILD of that profile;
  back returns to their profile; sheet fully extends on entry, returns to
  prior snap on back). Messages INBOX = child of OWN profile (header
  button), lists all conversations, opens sessions.
- Architecture: a backend of conversations + messages schema and its
  endpoints, REST + polling v1 designed so realtime swaps in without a
  schema change; scenes messagesInbox + dmSession, entry-keyed across all
  entry points. Design of record: plans/w3-messaging-design.md. The request
  lane (non-friends), blocking interaction, and unread badge are part of the
  model; push notifications for DMs are the one hookup still owed.
  Presentation is deliberately crude v1 — owner refines it later.
