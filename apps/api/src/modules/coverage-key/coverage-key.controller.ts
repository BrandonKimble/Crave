import { Body, Controller, Post } from '@nestjs/common';
import { CoverageRegistryService } from './coverage-registry.service';
import { CoverageResolveDto } from './dto/coverage-resolve.dto';

@Controller('coverage')
export class CoverageKeyController {
  constructor(private readonly coverageRegistry: CoverageRegistryService) {}

  @Post('resolve')
  resolveCoverage(@Body() dto: CoverageResolveDto) {
    return this.coverageRegistry.resolveCoverage({
      bounds: dto.bounds ?? null,
    });
  }
}
