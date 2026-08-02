import {
  MessageBody,
  ConnectedSocket,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { LoggerService } from '../../shared';

/**
 * A socket carries updates for the polls a client ASKED FOR — nothing else.
 *
 * THE FANOUT THIS REPLACES (audit 2026-08-01). `emitPollUpdate` used to call
 * `server.emit(...)`, which delivers to EVERY connected client. Two things
 * followed from that, and the second is the expensive one:
 *
 *  1. Every device learned, in real time, the id of every poll being touched
 *     anywhere in the world — a global activity stream handed to an
 *     unauthenticated socket.
 *  2. The FEED client did not filter the payload at all: any mutation
 *     anywhere triggered a full `/polls/query` viewport refresh — the
 *     heaviest read in the app. One comment therefore cost N heavy geo
 *     queries, where N is every device with the feed open. That amplifies
 *     with users, so it is worst exactly when we can least afford it, and
 *     with `/polls/query` now on the heavyGeoRead tier the clients would
 *     have begun 429ing each other.
 *
 * Rooms are the primitive that says "who cares about this": a client joins
 * `poll:<id>` for the polls it is actually showing, and an update reaches
 * precisely those clients. Subscribing requires already knowing the poll id,
 * which a client can only have from a read it was allowed to make, so
 * membership leaks nothing that `GET /polls/:pollId` would not.
 */
@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/polls',
})
export class PollsGateway {
  @WebSocketServer()
  private readonly server!: unknown;

  constructor(private readonly logger: LoggerService) {}

  emitPollUpdate(pollId: string): void {
    const server = this.server as
      | {
          to: (room: string) => { emit: (e: string, p: unknown) => void };
        }
      | undefined;
    if (!server?.to) {
      this.logger.warn('PollsGateway server not ready, skipping broadcast');
      return;
    }
    server.to(pollRoom(pollId)).emit('poll:update', { pollId });
  }

  @SubscribeMessage('poll:subscribe')
  handleSubscribe(
    @ConnectedSocket() client: SocketLike,
    @MessageBody() payload: unknown,
  ): { subscribed: number } {
    const pollIds = readPollIds(payload);
    // The client declares its whole interest set each time, so leaving the
    // rooms it no longer named is what keeps a long-lived socket from
    // accumulating every poll it has ever scrolled past.
    for (const room of currentPollRooms(client)) {
      client.leave(room);
    }
    for (const pollId of pollIds) {
      client.join(pollRoom(pollId));
    }
    return { subscribed: pollIds.length };
  }

  @SubscribeMessage('poll:unsubscribe')
  handleUnsubscribe(@ConnectedSocket() client: SocketLike): { ok: true } {
    for (const room of currentPollRooms(client)) {
      client.leave(room);
    }
    return { ok: true };
  }
}

export interface SocketLike {
  join: (room: string) => void;
  leave: (room: string) => void;
  rooms?: Set<string> | string[];
}

/**
 * A feed page is bounded, so a legitimate client never needs more than this.
 * Without a cap, one socket could join unbounded rooms, and every room name is
 * a string we hold — an unauthenticated memory-growth lever.
 */
export const MAX_SUBSCRIPTIONS_PER_SOCKET = 200;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function pollRoom(pollId: string): string {
  return `poll:${pollId}`;
}

function currentPollRooms(client: SocketLike): string[] {
  const rooms = client.rooms;
  if (!rooms) return [];
  const values = Array.isArray(rooms) ? rooms : Array.from(rooms);
  return values.filter((room) => room.startsWith('poll:'));
}

/**
 * Poll ids are uuids. Anything else is refused rather than coerced — an
 * unvalidated id becomes an arbitrary attacker-chosen room name.
 */
export function readPollIds(payload: unknown): string[] {
  const raw =
    payload && typeof payload === 'object'
      ? (payload as { pollIds?: unknown }).pollIds
      : undefined;
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  for (const value of raw) {
    if (typeof value !== 'string' || !UUID_RE.test(value)) continue;
    seen.add(value.toLowerCase());
    if (seen.size >= MAX_SUBSCRIPTIONS_PER_SOCKET) break;
  }
  return [...seen];
}
