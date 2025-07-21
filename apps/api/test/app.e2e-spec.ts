import { Test, TestingModule } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: NestFastifyApplication;

  beforeEach(async () => {
    // Use existing database URL for tests (in a real project, use a separate test DB)
    // process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
    process.env.REDDIT_CLIENT_ID = 'test-client-id';
    process.env.REDDIT_CLIENT_SECRET = 'test-client-secret';
    process.env.REDDIT_USERNAME = 'test-username';
    process.env.REDDIT_PASSWORD = 'test-password';
    process.env.REDDIT_USER_AGENT = 'CraveSearch/1.0.0-test';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  it('/ (GET)', () => {
    return app
      .inject({
        method: 'GET',
        url: '/',
      })
      .then((result) => {
        expect(result.statusCode).toEqual(200);
        expect(result.payload).toEqual('Hello World!');
      });
  });
});
