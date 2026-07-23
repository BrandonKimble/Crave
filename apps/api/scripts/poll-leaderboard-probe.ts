import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PollsService } from '../src/modules/polls/polls.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

const NYC = 'region-us-ny-new-york';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  stopCronsForScript(app);
  const out = (m = '') => process.stdout.write(`${m}\n`);
  const prisma = app.get(PrismaService);
  let pollId: string | null = null;
  let topicId: string | null = null;
  try {
    const polls = app.get(PollsService);
    const users = await prisma.user.findMany({
      take: 3,
      select: { userId: true },
    });
    if (users.length < 3) throw new Error('need 3 users');
    const [u1, u2, u3] = users.map((u) => u.userId);

    const poll = await polls.createPoll(
      { question: 'best breakfast sandwich in NYC', marketKey: NYC },
      u1,
    );
    pollId = poll.pollId;
    topicId = poll.topicId ?? null;
    out(`poll: mode=${poll.mode} topicType=${poll.topic?.topicType}`);

    const c1 = await polls.postComment(
      pollId,
      { body: 'Noodle Village, hands down' },
      u1,
    );
    await polls.postComment(pollId, { body: 'gotta be Caffè Panna' }, u2);
    await polls.postComment(pollId, { body: 'Noodle Village for sure' }, u3);
    await polls.toggleCommentLike(c1.commentId, u2); // u2 also endorses Noodle Village

    const board = await polls.getPollLeaderboard(pollId);
    out('leaderboard:');
    for (const e of board) {
      out(`   #${e.rank}  ${e.name} — ${e.distinctEndorsers} endorser(s)`);
    }
  } finally {
    if (pollId) {
      await prisma.poll.delete({ where: { pollId } }).catch(() => undefined);
    }
    if (topicId) {
      await prisma.pollTopic
        .delete({ where: { topicId } })
        .catch(() => undefined);
    }
    await app.close();
  }
}

main().catch((e) => {
  Logger.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
