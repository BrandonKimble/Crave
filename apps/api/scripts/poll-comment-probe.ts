import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { PollMode, PollState } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PollsService } from '../src/modules/polls/polls.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  stopCronsForScript(app);
  const out = (m = '') => process.stdout.write(`${m}\n`);
  let pollId: string | null = null;
  const prisma = app.get(PrismaService);
  try {
    const polls = app.get(PollsService);
    const user = await prisma.user.findFirst({ select: { userId: true } });
    const user2 = await prisma.user.findMany({
      take: 2,
      select: { userId: true },
    });
    if (!user || user2.length < 2) throw new Error('need 2 users');
    const uid = user.userId;
    const uid2 = user2[1].userId;

    const poll = await prisma.poll.create({
      data: {
        question: 'best slice in town?',
        state: PollState.active,
        mode: PollMode.discussion,
        createdByUserId: uid,
      },
      select: { pollId: true },
    });
    pollId = poll.pollId;

    const c1 = await polls.postComment(
      pollId,
      { body: "Joe's Pizza, no contest" },
      uid,
    );
    const c2 = await polls.postComment(
      pollId,
      { body: 'agreed, also try Scarrs', parentCommentId: c1.commentId },
      uid2,
    );
    out(`posted c1=${c1.publicId} c2=${c2.publicId} (reply)`);

    const like = await polls.toggleCommentLike(c1.commentId, uid2);
    out(`uid2 liked c1 → liked=${like.liked} score=${like.score}`);

    let list = await polls.listComments(pollId, uid2);
    out(
      `list(${list.length}): ${list
        .map(
          (c) =>
            `[${c.parentCommentId ? 'reply' : 'top'} score=${c.score} liked=${c.currentUserLiked}] ${c.body}`,
        )
        .join('  |  ')}`,
    );

    await polls.editComment(
      c1.commentId,
      { body: "Joe's Pizza is the GOAT" },
      uid,
    );
    await polls.deleteComment(c2.commentId, uid2);
    list = await polls.listComments(pollId, uid2);
    out(
      `after edit c1 + delete c2 → list(${list.length}): ${list
        .map((c) => `${c.body}${c.editedAt ? ' (edited)' : ''}`)
        .join('  |  ')}`,
    );
  } finally {
    if (pollId) {
      await prisma.poll.delete({ where: { pollId } }).catch(() => undefined);
    }
    await app.close();
  }
}

main().catch((e) => {
  Logger.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
