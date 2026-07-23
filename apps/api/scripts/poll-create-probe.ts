import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PollsService } from '../src/modules/polls/polls.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

// Creation is bounds-anchored (place catalog); a lower-Manhattan viewport.
const NYC_BOUNDS = {
  northEast: { lat: 40.7411, lng: -73.9578 },
  southWest: { lat: 40.6987, lng: -74.0132 },
};
const QUESTIONS = [
  'best breakfast sandwich in LES',
  'best patio',
  "what's your favorite food memory?",
];

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  stopCronsForScript(app);
  const out = (m = '') => process.stdout.write(`${m}\n`);
  const created: string[] = [];
  try {
    const polls = app.get(PollsService);
    const prisma = app.get(PrismaService);
    const user = await prisma.user.findFirst({ select: { userId: true } });
    if (!user) throw new Error('no user');

    for (const q of QUESTIONS) {
      const poll = await polls.createPoll(
        { question: q, bounds: NYC_BOUNDS },
        user.userId,
      );
      created.push(poll.pollId);
      const row = await prisma.poll.findUnique({
        where: { pollId: poll.pollId },
        select: {
          mode: true,
          axis: true,
          topicId: true,
          question: true,
          topic: { select: { topicType: true } },
        },
      });
      out('');
      out(`"${q}"`);
      out(
        `   mode=${row?.mode}  topicType=${row?.topic?.topicType ?? '—'}  topicId=${row?.topicId ? 'set' : 'null'}`,
      );
      out(`   axis=${JSON.stringify(row?.axis)}`);
    }
  } finally {
    // Cleanup: delete the test polls + their topics (leave any resolved entities).
    const prisma = app.get(PrismaService);
    for (const pollId of created) {
      const p = await prisma.poll.findUnique({
        where: { pollId },
        select: { topicId: true },
      });
      await prisma.poll.delete({ where: { pollId } }).catch(() => undefined);
      if (p?.topicId) {
        await prisma.pollTopic
          .delete({ where: { topicId: p.topicId } })
          .catch(() => undefined);
      }
    }
    await app.close();
  }
}

main().catch((e) => {
  Logger.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
