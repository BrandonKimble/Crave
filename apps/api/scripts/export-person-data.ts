#!/usr/bin/env ts-node
/**
 * @script-class: operational
 *
 * SUBJECT ACCESS REQUEST — the operator command behind the privacy policy's
 * "Export your data in a portable format".
 *
 *   yarn ts-node -T scripts/export-person-data.ts <userId> [outFile]
 *
 * Deliberately a command and not an endpoint: a full personal-data archive is
 * the single most valuable object in the system, and handing one to whoever
 * holds a session token is a breach vector. GDPR contemplates exactly this
 * shape — verify the requester's identity, respond within a month.
 *
 * THE RUNBOOK, because a mechanism nobody knows how to run is not a mechanism:
 *  1. Verify the requester controls the account's email (reply to the address
 *     on file; never trust the address in the request).
 *  2. Run this with their userId. It writes JSON.
 *  3. THE MACHINE REDACTS; `excluded` IS AUTHORITATIVE. Every column listed
 *     there is absent from `tables` by construction — the query projects the
 *     included columns and nothing else, so a third party named in one of the
 *     subject's rows (a report's subject, a block's blocked account) is not in
 *     the file. This step used to say "include them by hand, redacted", which
 *     was worse than useless: it asked an operator to redact records the
 *     export had already shipped raw. Do NOT paste withheld columns back in.
 *  4. Read `excluded` anyway, and answer it in prose. Those `retain` columns
 *     are still personal data and a real Art.15 request covers them — the
 *     honest response describes what is held and why (the basis is printed
 *     with each entry), rather than disclosing rows that name someone else.
 *  5. Deliver out-of-band to the verified address. Delete the local file.
 */
import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { NestFactory } from '@nestjs/core';
import { writeFileSync } from 'fs';
import { AppModule } from '../src/app.module';
import { PersonDataExportService } from '../src/modules/identity/person-data/person-data-export.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

async function main() {
  const userId = process.argv[2];
  if (!userId) {
    console.error('usage: export-person-data.ts <userId> [outFile]');
    process.exit(1);
  }
  const out = process.argv[3] ?? `person-data-${userId}.json`;

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  // A subject-access export must never let this process ALSO start running
  // the schedulers — including the deletion purge, which destroys accounts.
  stopCronsForScript(app);
  try {
    const service = app.get(PersonDataExportService);
    const payload = await service.export(userId);
    writeFileSync(out, JSON.stringify(payload, null, 2));
    const rows = Object.values(payload.tables).reduce(
      (n, list) => n + list.length,
      0,
    );
    console.log(
      `Wrote ${out}: ${Object.keys(payload.tables).length} tables, ${rows} rows.`,
    );
    console.log(
      `${payload.excluded.length} column(s) withheld — they are ABSENT from ` +
        `the file, not merely listed. Answer the "excluded" section in prose; ` +
        `do not paste those columns back in. See the runbook at the top.`,
    );
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
