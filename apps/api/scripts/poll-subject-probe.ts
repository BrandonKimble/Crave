import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { LLMService } from '../src/modules/external-integrations/llm/llm.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

// question → expectation (from §3.1 table + discussion cases).
const CASES: { q: string; expect: string }[] = [
  {
    q: 'best breakfast sandwich in LES',
    expect: 'ranked dish · category breakfast sandwich · LES',
  },
  { q: 'what to order at Joe’s', expect: 'ranked dish · anchor Joe’s' },
  {
    q: 'best Italian in the East Village',
    expect: 'ranked restaurant · cuisine italian · East Village',
  },
  { q: 'best patio', expect: 'ranked restaurant · restaurant_attribute patio' },
  {
    q: 'best spicy ramen',
    expect: 'ranked dish · category ramen (or dish_attribute spicy)',
  },
  { q: "what's your favorite food memory?", expect: 'discussion' },
  { q: 'is pineapple on pizza okay?', expect: 'discussion' },
  { q: 'thoughts on the new place downtown?', expect: 'discussion' },
];

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  stopCronsForScript(app);
  const out = (m = '') => process.stdout.write(`${m}\n`);
  try {
    const llm = app.get(LLMService);
    for (const c of CASES) {
      const r = await llm.inferPollSubject(c.q);
      const ax = r.axis
        ? `${r.axis.targetType}` +
          (r.axis.constraint
            ? ` · ${r.axis.constraint.kind}:${r.axis.constraint.value}`
            : '') +
          (r.axis.anchor ? ` · @${r.axis.anchor}` : '') +
          (r.axis.marketHint ? ` · 📍${r.axis.marketHint}` : '')
        : '—';
      out('');
      out(`"${c.q}"  [expect: ${c.expect}]`);
      out(`   got: ${r.mode} (conf ${r.confidence})  axis: ${ax}`);
    }
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  Logger.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
