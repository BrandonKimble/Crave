import { Type } from 'class-transformer';
import {
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class HomeLocationDto {
  @IsLatitude()
  lat!: number;

  @IsLongitude()
  lng!: number;
}

export class RegisterDeviceDto {
  @IsString()
  @MaxLength(255)
  token!: string;

  @IsOptional()
  @IsString()
  userId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  platform?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  appVersion?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  locale?: string | null;

  /**
   * ACCEPTED-IGNORED (legacy-poll-expiry leg, 2026-07-20): the running mobile
   * client still sends `city` at registration; forbidNonWhitelisted would 400
   * the request if the field vanished, so it stays declared — but the column
   * is DROPPED and the server never reads it (home-place registration is the
   * §4 targeting truth). Delete with the next mobile touch.
   */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  city?: string | null;

  /**
   * §4 home-place registration — the device's home coordinate, GROUND TRUTH
   * from the client (never a place id: the server judges placeAt). Three
   * states: {lat,lng} = resolve placeAt(point) → homePlaceId; explicit null =
   * the user revoked location → CLEAR the stored home place; absent
   * (undefined) = no signal this registration → leave the stored value alone.
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => HomeLocationDto)
  homeLocation?: HomeLocationDto | null;
}
