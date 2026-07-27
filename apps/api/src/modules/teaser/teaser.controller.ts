import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  ArrayMaxSize,
} from 'class-validator';
import { AllowUnentitled } from '../entitlements/entitlement-enforcement.interceptor';
import { TeaserService } from './teaser.service';

export class TeaserPreviewDto {
  @IsString()
  @MaxLength(64)
  city!: string;

  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(16)
  dishIds!: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(8)
  contextIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(8)
  cuisineIds?: string[];
}

/**
 * PUBLIC (no Clerk guard, exempt from the entitlement wall): serves the
 * onboarding teaser BEFORE auth and BEFORE the paywall. Exposes only fixed,
 * aggregate, cacheable compositions (top-3 + count) for live cities — no PII,
 * no browse surface, no entity graph (business/signal/teaser-spec.md).
 */
@AllowUnentitled()
@Controller('teaser')
export class TeaserController {
  constructor(private readonly teaser: TeaserService) {}

  @Post('preview')
  @HttpCode(200)
  async preview(@Body() body: TeaserPreviewDto) {
    const payload = await this.teaser.preview(
      body.city,
      body.dishIds ?? [],
      body.contextIds ?? [],
      body.cuisineIds ?? [],
    );
    return { payload };
  }
}
