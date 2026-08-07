import { reportClerkKeyMisconfig } from './auth-config-guard';
import { captureHandledError } from '../observability/crash-reporting';

jest.mock('../observability/crash-reporting', () => ({
  captureHandledError: jest.fn(),
}));

const seam = jest.mocked(captureHandledError);

describe('reportClerkKeyMisconfig (F2802)', () => {
  beforeEach(() => {
    seam.mockClear();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('routes a release build with NO Clerk key through the crash-reporting seam', () => {
    reportClerkKeyMisconfig(undefined, false);
    expect(seam).toHaveBeenCalledTimes(1);
    const calls = seam.mock.calls as unknown[][];
    expect(calls[0][1]).toEqual({ seam: 'auth:missing-clerk-key' });
  });

  it('routes a release build carrying a pk_test_ key through the seam', () => {
    reportClerkKeyMisconfig('pk_test_abc123', false);
    expect(seam).toHaveBeenCalledTimes(1);
    const calls = seam.mock.calls as unknown[][];
    expect(calls[0][1]).toEqual({ seam: 'auth:test-clerk-key' });
  });

  it('stays silent in dev and for a live key', () => {
    reportClerkKeyMisconfig(undefined, true);
    reportClerkKeyMisconfig('pk_live_abc123', false);
    expect(seam).not.toHaveBeenCalled();
  });
});
