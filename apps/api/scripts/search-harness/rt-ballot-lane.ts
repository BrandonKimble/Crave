/* RED TEAM item 5: the BALLOT LANE, executed on real data for the first time.
   Synthesizes a place-keyed poll + voters, runs the REAL PollBallotMentionService,
   the REAL projection rebuild, then verifies:
     - one voter -> one mention (no collapse, no double count)
     - per-voter docs are EXCLUDED from A(tau) document mass (voter-mass exclusion)
     - ExtractionScopeService / activate-shadow cannot see poll_surface docs
   Deletes every synthetic row and prints a residue proof. */
import { bootstrap } from './_shared';
import { PrismaService } from '../../src/prisma/prisma.service';
import { PollBallotMentionService } from '../../src/modules/polls/supply/poll-ballot-mention.service';
import { ExtractionScopeService } from '../../src/modules/content-processing/reddit-collector/extraction-scope.service';

const TAG = 'RT-BALLOT-SYNTH';
const ids: any = { users: [] as string[] };

async function main() {
  const app = await bootstrap();
  const prisma = app.get(PrismaService);
  const ballot = app.get(PollBallotMentionService);
  const scope = app.get(ExtractionScopeService);

  // --- pick a real, active, place-grounded restaurant + its place
  const target = await prisma.$queryRawUnsafe<any[]>(`
    SELECT e.entity_id, e.name, pg.place_id
    FROM core_entities e
    JOIN core_restaurant_locations l ON l.restaurant_id = e.entity_id
    JOIN place_geometries pg ON ST_Covers(pg.geometry, ST_SetSRID(ST_MakePoint(l.longitude::float8, l.latitude::float8),4326))
    WHERE e.type='restaurant' AND e.status='active' AND l.google_place_id IS NOT NULL
    LIMIT 1`);
  if (!target.length) {
    console.log('no grounded restaurant/place found');
    await app.close();
    return;
  }
  const restaurantId = target[0].entity_id;
  const placeId = target[0].place_id;
  console.log(
    `target restaurant: ${target[0].name} ${restaurantId}\nplace: ${placeId}`,
  );

  // --- synthetic users
  for (let i = 0; i < 3; i++) {
    const u = await prisma.$queryRawUnsafe<any[]>(
      `INSERT INTO users (user_id, email, username, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, now(), now()) RETURNING user_id`,
      `${TAG}-${i}@example.invalid`,
      `${TAG.toLowerCase()}${i}`,
    );
    ids.users.push(u[0].user_id);
  }
  console.log('synthetic users:', ids.users.length);

  // --- synthetic closed, place-keyed poll
  const p = await prisma.$queryRawUnsafe<any[]>(
    `INSERT INTO polls (poll_id, question, state, mode, origin, place_id, launched_at, closed_at, created_at, updated_at, metadata)
     VALUES (gen_random_uuid(), $1, 'closed'::poll_state, 'ranked'::poll_mode, 'user'::poll_origin, $2::uuid, now()-interval '2 days', now()-interval '1 day', now(), now(), '{}'::jsonb)
     RETURNING poll_id`,
    `${TAG} best thing here?`,
    placeId,
  );
  ids.pollId = p[0].poll_id;
  console.log('synthetic poll:', ids.pollId);

  // --- 3 voters, ALL endorsing the SAME restaurant (one-voter-one-count test)
  for (const uid of ids.users) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO poll_endorsements (poll_id, subject_type, subject_id, user_id, created_at)
       VALUES ($1::uuid, 'entity'::poll_leaderboard_subject_type, $2, $3::uuid, now())`,
      ids.pollId,
      restaurantId,
      uid,
    );
  }
  // one voter ALSO endorses again later (standing-endorsement / double-vote probe)
  await prisma.$executeRawUnsafe(
    `INSERT INTO poll_endorsements (poll_id, subject_type, subject_id, user_id, created_at)
     VALUES ($1::uuid, 'entity'::poll_leaderboard_subject_type, $2, $3::uuid, now()+interval '1 minute')
     ON CONFLICT DO NOTHING`,
    ids.pollId,
    restaurantId,
    ids.users[0],
  );

  // ================= RUN THE REAL SERVICE =================
  console.log('\n--- mintForPoll (real service) ---');
  await ballot.mintForPoll(ids.pollId);

  const docs = await prisma.$queryRawUnsafe<any[]>(
    `SELECT document_id, source_id, parent_source_id, active_extraction_run_id, (raw_payload ? 'voterUserId') AS is_voter_doc
     FROM collection_source_documents WHERE platform='poll_surface' ORDER BY parent_source_id NULLS FIRST, source_id`,
  );
  console.log(
    `poll_surface documents written: ${docs.length} (parent=${docs.filter((d) => !d.is_voter_doc).length}, voter=${docs.filter((d) => d.is_voter_doc).length})`,
  );
  const runId = docs.find(
    (d) => d.active_extraction_run_id,
  )?.active_extraction_run_id;
  console.log('extraction run:', runId);

  const evs = await prisma.$queryRawUnsafe<any[]>(
    `SELECT restaurant_id, mention_key, evidence_type, source_document_id FROM core_restaurant_events WHERE extraction_run_id=$1::uuid`,
    runId,
  );
  console.log(`restaurant events minted: ${evs.length}`);
  console.log(
    '  distinct mention_keys:',
    new Set(evs.map((e) => e.mention_key)).size,
    '| distinct source docs:',
    new Set(evs.map((e) => e.source_document_id)).size,
  );
  console.log(
    '  ONE-VOTER-ONE-COUNT:',
    evs.length === 3 && new Set(evs.map((e) => e.mention_key)).size === 3
      ? 'PASS (3 voters -> 3 events, 3 keys)'
      : `*** CHECK: ${evs.length} events ***`,
  );

  // ================= VOTER-MASS EXCLUSION (public-crave-score.service.ts:604) =================
  const massAll = await prisma.$queryRawUnsafe<any[]>(
    `SELECT count(*)::int c FROM collection_source_documents sd WHERE sd.platform='poll_surface'`,
  );
  const massScored = await prisma.$queryRawUnsafe<any[]>(
    `SELECT count(*)::int c FROM collection_source_documents sd WHERE sd.platform='poll_surface'
       AND COALESCE(NOT (sd.raw_payload ? 'voterUserId'), true)`,
  );
  console.log(
    `\nVOTER-MASS EXCLUSION: docs total=${massAll[0].c}, counted toward A(tau)=${massScored[0].c}`,
  );
  console.log(
    '  ',
    massScored[0].c === 1
      ? 'PASS (only the parent ballot doc counts; voters excluded)'
      : '*** FAIL: voter docs inflate document mass ***',
  );

  // ================= RE-EXTRACT ACTIVATION CANNOT SEE POLL DOCS =================
  const owned = await scope.documentsOwnedByRun(runId);
  console.log(
    `\nACTIVATION SCOPE: ExtractionScopeService.documentsOwnedByRun(${String(runId).slice(0, 8)}) returned ${Array.isArray(owned) ? owned.length : JSON.stringify(owned)} documents`,
  );
  console.log(
    '  ',
    (Array.isArray(owned) ? owned.length : 1) === 0
      ? 'PASS (poll_surface invisible to activation/rollback)'
      : '*** FAIL: activation can flip poll docs ***',
  );
  const ownedNoExclude = await scope.documentsOwnedByRun(runId, {
    excludePlatform: '__none__',
  } as any);
  console.log(
    `  control (exclusion disabled): ${Array.isArray(ownedNoExclude) ? ownedNoExclude.length : '?'} documents  <-- must be >0 or the test is vacuous`,
  );

  // ================= CLEANUP =================
  console.log('\n--- cleanup ---');
  await prisma.$executeRawUnsafe(
    `DELETE FROM core_restaurant_events WHERE extraction_run_id IN (SELECT extraction_run_id FROM collection_extraction_runs WHERE pipeline='poll-ballot')`,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM core_restaurant_entity_events WHERE extraction_run_id IN (SELECT extraction_run_id FROM collection_extraction_runs WHERE pipeline='poll-ballot')`,
  );
  await prisma.$executeRawUnsafe(
    `UPDATE collection_source_documents SET active_extraction_run_id=NULL WHERE platform='poll_surface'`,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM collection_extraction_input_documents WHERE document_id IN (SELECT document_id FROM collection_source_documents WHERE platform='poll_surface')`,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM collection_extraction_inputs WHERE extraction_run_id IN (SELECT extraction_run_id FROM collection_extraction_runs WHERE pipeline='poll-ballot')`,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM collection_extraction_runs WHERE pipeline='poll-ballot'`,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM collection_source_documents WHERE platform='poll_surface'`,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM sources WHERE platform='poll_surface'`,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM polls WHERE poll_id=$1::uuid`,
    ids.pollId,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM users WHERE email LIKE $1`,
    `${TAG}%`,
  );

  const residue = await prisma.$queryRawUnsafe<any[]>(`
    SELECT 'poll_surface docs' k, count(*)::int c FROM collection_source_documents WHERE platform='poll_surface'
    UNION ALL SELECT 'poll_surface sources', count(*)::int FROM sources WHERE platform='poll_surface'
    UNION ALL SELECT 'poll-ballot runs', count(*)::int FROM collection_extraction_runs WHERE pipeline='poll-ballot'
    UNION ALL SELECT 'synthetic polls', count(*)::int FROM polls WHERE question LIKE '${TAG}%'
    UNION ALL SELECT 'synthetic users', count(*)::int FROM users WHERE email LIKE '${TAG}%'`);
  console.log('RESIDUE:', JSON.stringify(residue));
  await app.close();
}
main().catch(async (e) => {
  console.error('FAILED:', e);
  process.exit(1);
});
