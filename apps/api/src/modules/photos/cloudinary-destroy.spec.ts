import { CloudinaryService } from './cloudinary.service';

/**
 * DESTROY MEANS DESTROYED (F9704).
 *
 * `uploader.destroy` RESOLVES with `{ result: 'not found' }` rather than
 * throwing, and nothing inspected it — so every caller's `try/catch` was blind
 * to any outcome but a transport error. A non-`ok` answer read as success, and
 * the row flipped to `removed` while the bytes may still have been live: the
 * F9470 leak, one layer below the state machine that was built to prevent it.
 *
 * The two halves of the contract, each with its own mutation:
 *   - `'not found'` is SUCCESS (the goal is "gone"; parking forever on a retry
 *     that can never change its answer would be the other failure). Make it
 *     throw and the first case reds.
 *   - anything else THROWS, so the park-and-retry machinery sees it. Delete the
 *     inspection and the last two cases red.
 */
jest.mock('cloudinary', () => ({
  v2: {
    config: jest.fn(),
    uploader: { destroy: jest.fn() },
    utils: { api_sign_request: jest.fn().mockReturnValue('sig') },
    url: jest.fn().mockReturnValue('https://res/u'),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { v2: cloudinary } = require('cloudinary') as {
  v2: { uploader: { destroy: jest.Mock } };
};

function build() {
  const logger = {
    setContext: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  logger.setContext.mockReturnValue(logger);
  const config = {
    get: (key: string) =>
      ({
        'cloudinary.cloudName': 'c',
        'cloudinary.apiKey': 'k',
        'cloudinary.apiSecret': 's',
        'cloudinary.webhookSecret': 'w',
        'cloudinary.envPrefix': 'test',
      })[key],
  };
  return new CloudinaryService(config as never, logger as never);
}

describe('CloudinaryService.destroyAsset inspects the result (F9704)', () => {
  beforeEach(() => cloudinary.uploader.destroy.mockReset());

  it('`ok` and `not found` are both SUCCESS — the asset is gone either way', async () => {
    const service = build();
    cloudinary.uploader.destroy.mockResolvedValueOnce({ result: 'ok' });
    await expect(service.destroyAsset('p')).resolves.toBeUndefined();
    cloudinary.uploader.destroy.mockResolvedValueOnce({ result: 'not found' });
    await expect(service.destroyAsset('p')).resolves.toBeUndefined();
  });

  it('any OTHER result THROWS — a silent non-destroy is the leak', async () => {
    const service = build();
    cloudinary.uploader.destroy.mockResolvedValueOnce({ result: 'error' });
    await expect(service.destroyAsset('p')).rejects.toThrow(/returned "error"/);
    cloudinary.uploader.destroy.mockResolvedValueOnce({});
    await expect(service.destroyAsset('p')).rejects.toThrow(/no result/);
  });
});
