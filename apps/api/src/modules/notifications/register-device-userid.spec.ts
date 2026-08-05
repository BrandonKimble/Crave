/**
 * F646: `RegisterDeviceDto` used to carry a client-supplied `userId`, inert
 * only because the controller spread-then-overwrote it
 * (`{...dto, userId: user.userId}`, RT-15). This proves the field is gone
 * from the DTO shape entirely and — driven through the app's real
 * ValidationPipe config (whitelist + forbidNonWhitelisted, same as prod) — a
 * client-supplied `userId` on the wire is REJECTED outright rather than
 * silently stripped-then-overwritten.
 */
import 'reflect-metadata';
import { ArgumentMetadata } from '@nestjs/common';
import { createValidationPipeConfig } from '../../shared/pipes/validation.config';
import { RegisterDeviceDto } from './dto/register-device.dto';

describe('RegisterDeviceDto (F646)', () => {
  it('has no userId field on the class shape', () => {
    const dto = new RegisterDeviceDto();
    expect('userId' in dto).toBe(false);
  });

  it('a client-supplied userId is REJECTED by the real ValidationPipe (forbidNonWhitelisted)', async () => {
    const pipe = createValidationPipeConfig(false);
    const metadata: ArgumentMetadata = {
      type: 'body',
      metatype: RegisterDeviceDto,
    };

    await expect(
      pipe.transform(
        { token: 'tok-1', userId: 'attacker-controlled-victim-id' },
        metadata,
      ),
    ).rejects.toBeTruthy();
  });

  it('a legitimate payload (no userId) still passes', async () => {
    const pipe = createValidationPipeConfig(false);
    const metadata: ArgumentMetadata = {
      type: 'body',
      metatype: RegisterDeviceDto,
    };

    const result = await pipe.transform({ token: 'tok-1' }, metadata);
    expect((result as unknown as Record<string, unknown>).userId).toBeUndefined();
  });
});
