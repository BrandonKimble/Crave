import type { FastifyRequest } from 'fastify';
import type { User } from '@prisma/client';

export type AuthenticatedRequest = FastifyRequest & {
  user?: User;
};
