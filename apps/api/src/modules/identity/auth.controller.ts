import { Body, Controller, Post } from '@nestjs/common';
import {
  NativeAppleAuthDto,
  NativeAppleAuthResponseDto,
} from './dto/native-apple-auth.dto';
import { NativeAppleAuthService } from './auth/native-apple-auth.service';

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
