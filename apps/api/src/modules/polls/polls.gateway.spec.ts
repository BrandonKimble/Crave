import 'reflect-metadata';
import {
  PollsGateway,
  readPollIds,
  pollRoom,
  MAX_SUBSCRIPTIONS_PER_SOCKET,
  type SocketLike,
} from './polls.gateway';

// DELIVERY IS SCOPED, not filtered at the edge.
//
// `emitPollUpdate` used to `server.emit(...)` — every connected client got
// every poll id in the world. The feed client did not filter it, so one
// comment cost a full `/polls/query` viewport refresh on EVERY device with
// the feed open. These tests assert the update goes to the poll's room and
// nowhere else.

const POLL_A = '11111111-1111-1111-1111-111111111111';
const POLL_B = '22222222-2222-2222-2222-222222222222';

function createGateway() {
  const emit = jest.fn();
  const to = jest.fn().mockReturnValue({ emit });
  const gateway = new PollsGateway({
    warn: jest.fn(),
  } as never);
  (gateway as unknown as { server: unknown }).server = { to, emit };
  return { gateway, to, emit };
}

function createClient(): SocketLike & {
  joined: string[];
  left: string[];
  rooms: Set<string>;
} {
  const rooms = new Set<string>(['socket-own-id']);
  const joined: string[] = [];
  const left: string[] = [];
  return {
    joined,
    left,
    rooms,
    join: (room: string) => {
      joined.push(room);
      rooms.add(room);
    },
    leave: (room: string) => {
      left.push(room);
      rooms.delete(room);
    },
  };
}

describe('PollsGateway delivery scope', () => {
  it('emits to the poll ROOM, never to every connected client', () => {
    const { gateway, to, emit } = createGateway();
    gateway.emitPollUpdate(POLL_A);

    expect(to).toHaveBeenCalledWith(pollRoom(POLL_A));
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith('poll:update', { pollId: POLL_A });
  });

  it('subscribing joins only the named polls', () => {
    const { gateway } = createGateway();
    const client = createClient();

    const result = gateway.handleSubscribe(client, {
      pollIds: [POLL_A, POLL_B],
    });

    expect(result.subscribed).toBe(2);
    expect(client.joined).toEqual([pollRoom(POLL_A), pollRoom(POLL_B)]);
  });

  it('re-subscribing REPLACES the interest set, so a long-lived socket does not accumulate rooms', () => {
    const { gateway } = createGateway();
    const client = createClient();

    gateway.handleSubscribe(client, { pollIds: [POLL_A] });
    gateway.handleSubscribe(client, { pollIds: [POLL_B] });

    expect(client.left).toContain(pollRoom(POLL_A));
    expect([...client.rooms]).toEqual(['socket-own-id', pollRoom(POLL_B)]);
  });

  it('never leaves the socket’s own id room while pruning', () => {
    const { gateway } = createGateway();
    const client = createClient();

    gateway.handleSubscribe(client, { pollIds: [POLL_A] });
    gateway.handleUnsubscribe(client);

    expect(client.left).not.toContain('socket-own-id');
    expect(client.rooms.has('socket-own-id')).toBe(true);
  });
});

describe('PollsGateway subscription input', () => {
  it('refuses anything that is not a uuid — a room name is attacker-chosen otherwise', () => {
    expect(
      readPollIds({ pollIds: ['../admin', '', 'not-a-uuid', 42, null] }),
    ).toEqual([]);
  });

  it('refuses a malformed payload rather than coercing it', () => {
    expect(readPollIds(undefined)).toEqual([]);
    expect(readPollIds({})).toEqual([]);
    expect(readPollIds({ pollIds: 'all' })).toEqual([]);
    expect(readPollIds([POLL_A])).toEqual([]);
  });

  it('dedupes and caps — one socket cannot join unbounded rooms', () => {
    expect(readPollIds({ pollIds: [POLL_A, POLL_A, POLL_A] })).toEqual([
      POLL_A,
    ]);

    const many = Array.from(
      { length: MAX_SUBSCRIPTIONS_PER_SOCKET + 500 },
      (_, i) =>
        `${i.toString(16).padStart(8, '0')}-1111-1111-1111-111111111111`,
    );
    expect(readPollIds({ pollIds: many })).toHaveLength(
      MAX_SUBSCRIPTIONS_PER_SOCKET,
    );
  });
});
