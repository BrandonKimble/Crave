import { OpsDashboardController } from './ops-dashboard.controller';

/**
 * §18.4: the controller's own handlers, exercised directly (the guard's
 * 404/401 behavior is covered in ops-token.guard.spec.ts — this suite
 * proves the route bodies: summary passthrough, ack passthrough, and the
 * dashboard HTML response).
 */

describe('OpsDashboardController', () => {
  function buildController() {
    const summary = { spend: {}, pools: [], campaigns: [] };
    const summaryService = {
      summary: jest.fn(() => Promise.resolve(summary)),
    };
    const opsAlerts = {
      acknowledge: jest.fn(() => Promise.resolve()),
    };
    const controller = new OpsDashboardController(
      summaryService as never,
      opsAlerts as never,
    );
    return { controller, summaryService, opsAlerts, summary };
  }

  it('GET /ops/api/summary returns the summary service output', async () => {
    const { controller, summary } = buildController();
    await expect(controller.getSummary()).resolves.toBe(summary);
  });

  it('POST /ops/api/alerts/:id/ack acknowledges via OpsAlertsService', async () => {
    const { controller, opsAlerts } = buildController();
    const result = await controller.ackAlert('alert-1');
    expect(opsAlerts.acknowledge).toHaveBeenCalledWith('alert-1');
    expect(result).toEqual({ acknowledged: true });
  });

  it('GET /ops sends the self-contained HTML page', () => {
    const { controller } = buildController();
    const res = {
      header: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };
    controller.getDashboard(res as never);
    expect(res.header).toHaveBeenCalledWith(
      'Content-Type',
      'text/html; charset=utf-8',
    );
    expect(res.send).toHaveBeenCalledWith(
      expect.stringContaining('<title>Crave Ops</title>'),
    );
  });
});
