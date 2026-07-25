import { Body, Controller, Post } from '@nestjs/common';
import {
  NativeAppleAuthDto,
  NativeAppleAuthResponseDto,
} from './dto/native-apple-auth.dto';
import { NativeAppleAuthService } from './auth/native-apple-auth.service';
import { AllowUnentitled } from '../entitlements/entitlement-enforcement.interceptor';
import { RateLimitTier } from '../infrastructure/throttler/throttler.decorator';

// Exempt from the app-wide paywall (see AllowUnentitled docs for the why).
@AllowUnentitled()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly nativeAppleAuthService: NativeAppleAuthService,
  ) {}

  // Vote-integrity ladder: the one real velocity gap — this endpoint mints
  // sessions and previously carried no throttler tier ('auth' = 5/short,
  // 15/med, 60/long).
  @RateLimitTier('auth')
  @Post('apple/native')
  async signInWithApple(
    @Body() body: NativeAppleAuthDto,
  ): Promise<NativeAppleAuthResponseDto> {
    return this.nativeAppleAuthService.createSession(body);
  }
}
