import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { SecurityModule } from './security.module';
import { SecurityService } from './security.service';

describe('Security Integration', () => {
  let securityService: SecurityService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env.test',
        }),
        SecurityModule,
      ],
    }).compile();

    securityService = moduleFixture.get<SecurityService>(SecurityService);
  });

  describe('Input Sanitization', () => {
    it('should detect and prevent SQL injection patterns', () => {
      const maliciousInputs = [
        "'; DROP TABLE users; --",
        "admin' OR '1'='1",
        'UNION SELECT * FROM passwords',
        "'; INSERT INTO users VALUES ('hacker', 'password'); --",
      ];

      maliciousInputs.forEach((input) => {
        expect(securityService.containsMaliciousPattern(input)).toBe(true);
      });
    });

    it('should allow safe inputs', () => {
      const safeInputs = [
        'John Doe',
        'user@example.com',
        'A normal description with punctuation!',
        'Some-safe_identifier123',
      ];

      safeInputs.forEach((input) => {
        expect(securityService.containsMaliciousPattern(input)).toBe(false);
      });
    });
  });

  describe('SecurityService', () => {
    it('should sanitize malicious input strings', () => {
      const maliciousInput = '<script>alert("xss")</script>Hello';
      const sanitized = securityService.sanitizeInput(maliciousInput);

      expect(sanitized).not.toContain('<script>');
      expect(sanitized).toContain('Hello');
    });

    it('should validate origins correctly', () => {
      process.env.NODE_ENV = 'development';
      expect(securityService.isValidOrigin('http://localhost:3000')).toBe(true);

      process.env.NODE_ENV = 'production';
      process.env.ALLOWED_ORIGINS =
        'https://example.com,https://app.example.com';

      expect(securityService.isValidOrigin('https://example.com')).toBe(true);
      expect(securityService.isValidOrigin('https://malicious.com')).toBe(
        false,
      );
    });

    it('should provide correct rate limit configurations', () => {
      const defaultConfig = securityService.getRateLimitConfig('default');
      const strictConfig = securityService.getRateLimitConfig('strict');

      expect(defaultConfig.limit).toBeGreaterThan(strictConfig.limit);
      expect(typeof defaultConfig.ttl).toBe('number');
      expect(typeof strictConfig.ttl).toBe('number');
    });
  });
});
