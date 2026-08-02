/**
 * TODO(post-cleanup) — GENERIC-WORD QUERIES (owner ruling 2026-08-02).
 *
 * The gazetteer Understand grounds junk entities that exist in the graph
 * today ("best" as a restaurant, "dinner" as a food, "eats" as an
 * ingredient). The owner ruled this a DATA-QUALITY defect: no stop-list
 * in the search path — junk must fail to ground because the graph is
 * clean (extraction-hygiene prompt passes + the retroactive junk sweep,
 * both scheduled after the charter reload).
 *
 * ENABLE this suite (drop the .skip) once that cleanup lands. Each case
 * pins the behavior the clean graph must produce: the generic word fails
 * to ground and the real subject survives alone. Until then this suite
 * documents the accepted, temporary degradation.
 *
 * These are INTEGRATION cases — they need the real gazetteer over the
 * real graph (see redteam harness pattern: bootstrap AppModule against
 * the mirror, SEARCH battery style), not mocks. Cases to cover:
 *   'best tacos'        → food:[tacos], NO restaurant bucket
 *   'good pizza'        → food:[pizza] only
 *   'top ramen near me' → food:[ramen] only
 *   'great breakfast tacos' → food:[breakfast tacos] only
 *   'dinner date spot'  → attribute reads only, no food:'dinner'
 */
describe.skip('generic-word queries fail to ground (post-cleanup contract)', () => {
  it.todo("'best tacos' grounds only the food — 'best' fails to ground");
  it.todo("'good pizza' grounds only the food");
  it.todo("'top ramen near me' grounds only the food");
  it.todo("'great breakfast tacos' keeps the compound span only");
  it.todo("'dinner date spot' does not ground 'dinner' as a food");
});
