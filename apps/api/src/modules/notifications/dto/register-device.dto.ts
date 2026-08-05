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

  // F646: a client-supplied `userId` used to live here — inert only because
  // the controller spread-then-overwrote it (`{...dto, userId: user.userId}`,
  // RT-15). That ordering was the whole defence; deleting the field removes
  // the trap entirely instead of relying on it. The binding always derives
  // from the authenticated session (see registerDevice(dto, userId) below).

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
