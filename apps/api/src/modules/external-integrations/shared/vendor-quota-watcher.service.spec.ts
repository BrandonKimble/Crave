import { v2 as cloudinary } from 'cloudinary';
import { VendorQuotaWatcherService } from './vendor-quota-watcher.service';

jest.mock('cloudinary', () => ({
  v2: { api: { usage: jest.fn() } },
}));

const usageMock = cloudinary.api.usage as unknown as jest.Mock;

/**
 * Cloudinary is the one vendor whose remaining allowance we cannot compute
 * from our own ledger — it is prepaid, and the vendor's counter is the only
 * truth. Nothing read it until D149. The failure it protects against is the
 * quiet one: aws_rek_moderation runs out, uploads stop being safety-checked,
 * and the first symptom is a user seeing something they shouldn't.
 */
describe('VendorQuotaWatcherService.checkCloudinary', () => {
  const NOW = new Date('2026-08-15T00:00:00Z');

  const buildLogger = () => {
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      setContext: jest.fn(),
    };
    logger.setContext.mockReturnValue(logger);
    return logger;
  };

  const build = () => {
    const emit = jest.fn();
    const config = {
      get: (key: string) =>
        ({
          'cloudinary.cloudName': 'crave',
          'cloudinary.apiKey': 'key',
          'cloudinary.apiSecret': 'secret',
        })[key],
    };
    const service = new VendorQuotaWatcherService(
      config as never,
      buildLogger() as never,
      { emit } as never,
    );
    return { service, emit };
  };

  const alertsOfKind = (emit: jest.Mock, kind: string) =>
    emit.mock.calls
      .map((call: unknown[]) => call[0] as { kind: string; severity: string })
      .filter((a) => a.kind === kind);

  beforeEach(() => usageMock.mockReset());

  it('>=95% of an allowance is CRITICAL (which emails)', async () => {
    // MUTATION: raise CRITICAL_FRACTION above 0.96 and this reds.
    usageMock.mockResolvedValue({
      credits: { used_percent: 10 },
      aws_rek_moderation: { usage: 96, limit: 100 },
    });
    const { service, emit } = build();
    await service.checkCloudinary(NOW);
    const alerts = alertsOfKind(emit, 'vendor_quota');
    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe('critical');
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        dedupeKey:
          'vendor_quota:cloudinary:aws_rek_moderation:critical:2026-08',
      }),
    );
  });

  it('>=80% is a WARN that OPTS IN to email; below 80% is silence', async () => {
    // MUTATION: drop emailOnWarn and this reds. Lower WARN_FRACTION below
    // 0.79 and the silence case reds.
    usageMock.mockResolvedValue({
      credits: { used_percent: 85 },
      aws_rek_moderation: { usage: 79, limit: 100 },
    });
    const { service, emit } = build();
    await service.checkCloudinary(NOW);
    const alerts = alertsOfKind(emit, 'vendor_quota');
    expect(alerts).toHaveLength(1);
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'warn',
        emailOnWarn: true,
        dedupeKey: 'vendor_quota:cloudinary:credits:warn:2026-08',
      }),
    );
  });

  it('AN UNREADABLE QUOTA IS ITS OWN ALERT — never a silent 0%', async () => {
    // MUTATION: swallow the catch and this reds. A watcher that goes quiet
    // when it breaks buys false confidence, which is worse than no watcher.
    usageMock.mockRejectedValue(new Error('401 unauthorized'));
    const { service, emit } = build();
    await service.checkCloudinary(NOW);
    expect(alertsOfKind(emit, 'vendor_quota')).toHaveLength(0);
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'vendor_quota_unreadable',
        severity: 'warn',
        emailOnWarn: true,
      }),
    );
  });

  it('an unmetered key (no limit, no used_percent) is skipped, not reported as 0%', async () => {
    usageMock.mockResolvedValue({
      credits: {},
      aws_rek_moderation: { usage: 5 },
    });
    const { service, emit } = build();
    await service.checkCloudinary(NOW);
    expect(emit).not.toHaveBeenCalled();
  });

  it('does not call the vendor at all when Cloudinary is unconfigured', async () => {
    const emit = jest.fn();
    const service = new VendorQuotaWatcherService(
      { get: () => undefined } as never,
      buildLogger() as never,
      { emit } as never,
    );
    await service.checkCloudinary(NOW);
    expect(usageMock).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });
});
