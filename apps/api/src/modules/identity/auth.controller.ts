import { Body, Controller, Post } from '@nestjs/common';
import {
  NativeAppleAuthDto,
  NativeAppleAuthResponseDto,
} from './dto/native-apple-auth.dto';
import { NativeAppleAuthService } from './auth/native-apple-auth.service';
import { AllowUnentitled } from '../entitlements/entitlement-enforcement.interceptor';

// Exempt from the app-wide paywall (see AllowUnentitled docs for the why).
@AllowUnentitled()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly nativeAppleAuthService: NativeAppleAuthService,
  ) {}

  @Post('apple/native')
  async signInWithApple(
    @Body() body: NativeAppleAuthDto,
  ): Promise<NativeAppleAuthResponseDto> {
    return this.nativeAppleAuthService.createSession(body);
  }
}
