import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { OpsDashboardController } from './ops-dashboard.controller';
import { OpsBootstrapController } from './ops-bootstrap.controller';
import { OpsAccessGuard } from './ops-access.guard';
import { OpsSummaryService } from './ops-summary.service';
import { OpsAlertsService } from '../external-integrations/shared/ops-alerts.service';
import {
  OPS_SESSION_COOKIE,
  mintOpsSessionCookieValue,
} from './ops-session-cookie';

/**
 * THE OWNER CAN OPEN THE OWNER'S CONSOLE (F200 / D19).
 *
 * The defect this proves fixed was found by exactly this kind of executed
 * probe: with the real guard mounted on a real Fastify app, `GET /ops` was a
 * 401 with no token, a 401 with the documented `?token=` bootstrap, and a 401
 * with any URL a bookmark could hold. Only a header-capable client could fetch
 * the page — and such a client has no use for HTML.
 *
 * Two things must be true at once, and the old design only achieved the
 * second: the console must be reachable in an incident, AND the secret must
 * never sit in a logged URL on every request.
 */
const TOKEN = 'ops-secret-token-value';

describe('ops console browser access (F200)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [OpsBootstrapController, OpsDashboardController],
      providers: [
        OpsAccessGuard,
        {
          provide: OpsSummaryService,
          useValue: { summary: () => Promise.resolve({ ok: 1 }) },
        },
        {
          provide: OpsAlertsService,
          useValue: { acknowledge: () => Promise.resolve() },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    process.env.OPS_DASH_TOKEN = TOKEN;
  });

  const inject = (options: Parameters<NestFastifyApplication['inject']>[0]) =>
    app.inject(options);

  describe('what a browser could reach BEFORE (all 401 — the defect)', () => {
    it('a naked navigation is refused', async () => {
      const res = await inject({ method: 'GET', url: '/ops' });
      expect(res.statusCode).toBe(401);
    });

    it('the query-string secret stays dead — ?token= on the page route is still refused', async () => {
      const res = await inject({ method: 'GET', url: `/ops?token=${TOKEN}` });
      expect(res.statusCode).toBe(401);
    });
  });

  it('the header path is unchanged for a header-capable client', async () => {
    const ok = await inject({
      method: 'GET',
      url: '/ops',
      headers: { 'x-ops-token': TOKEN },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.body).toContain('<title>Crave Ops</title>');

    // A PRESENT but WRONG header still 401s — the cookie must never be a
    // fallback that widens a failed header check.
    const wrong = await inject({
      method: 'GET',
      url: '/ops',
      headers: { 'x-ops-token': 'ops-secret-token-valu3', cookie: 'x=1' },
    });
    expect(wrong.statusCode).toBe(401);
  });

  describe('the bootstrap: a browser-shaped navigation reaches the page', () => {
    it('validates, sets an HttpOnly+Secure+SameSite=Strict cookie, and redirects WITHOUT the secret', async () => {
      const res = await inject({
        method: 'GET',
        url: `/ops/enter?token=${TOKEN}`,
      });

      expect(res.statusCode).toBe(302);

      // THE POINT: the secret is gone from the URL the browser lands on, so
      // it never reaches history, a bookmark, or the logs of any subsequent
      // request.
      const location = res.headers.location as string;
      expect(location).toBe('/ops');
      expect(location).not.toContain(TOKEN);
      expect(location).not.toContain('token=');

      const setCookie = String(res.headers['set-cookie']);
      expect(setCookie).toContain(`${OPS_SESSION_COOKIE}=`);
      expect(setCookie).toContain('HttpOnly');
      expect(setCookie).toContain('Secure');
      expect(setCookie).toContain('SameSite=Strict');
      // The cookie is NOT the secret.
      expect(setCookie).not.toContain(TOKEN);
    });

    it('the cookie it minted opens the page AND the JSON routes', async () => {
      const bootstrap = await inject({
        method: 'GET',
        url: `/ops/enter?token=${TOKEN}`,
      });
      const cookie = String(bootstrap.headers['set-cookie']).split(';')[0];

      const page = await inject({
        method: 'GET',
        url: '/ops',
        headers: { cookie },
      });
      expect(page.statusCode).toBe(200);
      expect(page.body).toContain('<title>Crave Ops</title>');

      // The page's own fetches carry the same cookie — an HttpOnly cookie is
      // unreadable by the page's JS, which is why the document holds no
      // credential at all now.
      const summary = await inject({
        method: 'GET',
        url: '/ops/api/summary',
        headers: { cookie },
      });
      expect(summary.statusCode).toBe(200);
      expect(summary.json()).toEqual({ ok: 1 });
    });

    it('refuses a wrong token, and a wrong or expired cookie', async () => {
      const wrongToken = await inject({
        method: 'GET',
        url: '/ops/enter?token=nope',
      });
      expect(wrongToken.statusCode).toBe(401);

      const forged = await inject({
        method: 'GET',
        url: '/ops',
        headers: { cookie: `${OPS_SESSION_COOKIE}=9999999999999.deadbeef` },
      });
      expect(forged.statusCode).toBe(401);

      const expired = await inject({
        method: 'GET',
        url: '/ops',
        headers: {
          cookie: `${OPS_SESSION_COOKIE}=${mintOpsSessionCookieValue(
            TOKEN,
            Date.now() - 1_000,
          )}`,
        },
      });
      expect(expired.statusCode).toBe(401);
    });

    it('a cookie minted under a ROTATED secret stops working immediately', async () => {
      const stale = mintOpsSessionCookieValue(
        'the-old-token',
        Date.now() + 60_000,
      );
      const res = await inject({
        method: 'GET',
        url: '/ops',
        headers: { cookie: `${OPS_SESSION_COOKIE}=${stale}` },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  it('with no OPS_DASH_TOKEN the whole surface is OFF (404), bootstrap included', async () => {
    delete process.env.OPS_DASH_TOKEN;

    expect((await inject({ method: 'GET', url: '/ops' })).statusCode).toBe(404);
    expect(
      (await inject({ method: 'GET', url: '/ops/enter?token=x' })).statusCode,
    ).toBe(404);
    expect(
      (
        await inject({
          method: 'GET',
          url: '/ops',
          headers: { 'x-ops-token': TOKEN },
        })
      ).statusCode,
    ).toBe(404);
  });
});
