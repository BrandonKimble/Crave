import { IsString, MaxLength } from 'class-validator';

export class UnregisterDeviceDto {
  @IsString()
  @MaxLength(255)
  token!: string;
}
