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
 *  3. Read the `excluded` section before sending. It lists the `retain`
 *     columns the machine export leaves out — financial and safety records.
 *     Those ARE covered by a real Art.15 request: include them by hand, with
 *     the OTHER people in them redacted (a report names its subject; a block
 *     names the blocked). That redaction is the reason this step is human.
 *  4. Deliver out-of-band to the verified address. Delete the local file.
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
      `${payload.excluded.length} retained column(s) excluded — read the ` +
        `"excluded" section and add them by hand, redacted. See the runbook ` +
        `at the top of this script.`,
    );
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
