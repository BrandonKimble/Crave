import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class NativeAppleAuthDto {
  @IsString()
  @IsNotEmpty()
  identityToken!: string;

  @IsString()
  @IsNotEmpty()
  authorizationCode!: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  givenName?: string;

  @IsOptional()
  @IsString()
  familyName?: string;
}

export class NativeAppleAuthResponseDto {
  constructor(
    public readonly sessionId: string,
    public readonly signInId: string,
  ) {}
}
