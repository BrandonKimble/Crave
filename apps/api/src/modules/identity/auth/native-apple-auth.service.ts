import { HttpService } from '@nestjs/axios';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';
import {
  NativeAppleAuthDto,
  NativeAppleAuthResponseDto,
} from '../dto/native-apple-auth.dto';

interface ClerkNativeSignInResponse {
  id: string;
  status: string;
  created_session_id?: string | null;
}

@Injectable()
export class NativeAppleAuthService {
  private readonly secretKey?: string;
  private readonly apiUrl: string;
  private readonly logger = new Logger(NativeAppleAuthService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.secretKey =
      this.configService.get<string>('clerk.secretKey') || undefined;
    this.apiUrl =
      this.configService.get<string>('clerk.apiUrl') ||
      'https://api.clerk.com/v1';
  }

  async createSession(
    payload: NativeAppleAuthDto,
  ): Promise<NativeAppleAuthResponseDto> {
    if (!this.secretKey) {
      throw new InternalServerErrorException('Missing Clerk secret key');
    }

    const requestBody = this.buildRequestBody(payload);

    try {
      const response =
        await this.httpService.axiosRef.post<ClerkNativeSignInResponse>(
          `${this.apiUrl}/sign_ins`,
          requestBody,
          {
            headers: {
              Authorization: `Bearer ${this.secretKey}`,
              'Content-Type': 'application/json',
            },
          },
        );

      const { created_session_id: sessionId, status, id } = response.data;

      if (status !== 'complete' || !sessionId) {
        this.logger.warn('Incomplete native Apple sign-in response', {
          status,
          id,
        });
        throw new UnauthorizedException(
          'Native Apple sign-in was not completed. Please try again.',
        );
      }

      return new NativeAppleAuthResponseDto(sessionId, id);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  private handleError(error: unknown): UnauthorizedException | Error {
    if (axios.isAxiosError(error)) {
      return this.buildAxiosException(error);
    }
    if (error instanceof Error) {
      return error;
    }
    return new UnauthorizedException('Native Apple sign-in failed');
  }

  private buildAxiosException(error: AxiosError): UnauthorizedException {
    const status = error.response?.status;
    const data = error.response?.data as
      | { errors?: Array<{ message?: string }> }
      | undefined;
    const message =
      data?.errors?.[0]?.message ??
      error.response?.statusText ??
      'Native Apple sign-in failed';
    this.logger.error('Clerk native Apple sign-in failed', {
      status,
      message,
    });
    return new UnauthorizedException(message);
  }

  private buildRequestBody(payload: NativeAppleAuthDto) {
    const body: Record<string, unknown> = {
      strategy: 'oauth_native',
      provider: 'oauth_apple',
      token: payload.identityToken,
    };

    if (payload.authorizationCode) {
      body.code = payload.authorizationCode;
    }

    if (payload.email) {
      body.identifier = payload.email;
    }

    const userData: Record<string, string> = {};
    if (payload.givenName) {
      userData.first_name = payload.givenName;
    }
    if (payload.familyName) {
      userData.last_name = payload.familyName;
    }
    if (payload.email) {
      userData.email_address = payload.email;
    }
    if (Object.keys(userData).length > 0) {
      body.user_data = userData;
    }

    return body;
  }
}
