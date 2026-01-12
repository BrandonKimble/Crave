import { Injectable } from '@nestjs/common';
import { CoverageKeyResolverService } from '../coverage-key/coverage-key-resolver.service';

export interface ResolveOptions {
  bounds?: {
    northEast: { lat: number; lng: number };
    southWest: { lat: number; lng: number };
  } | null;
  fallbackLocation?: {
    latitude: number;
    longitude: number;
  } | null;
  referenceLocations?: Array<{
    latitude: number | null | undefined;
    longitude: number | null | undefined;
  }>;
}

@Injectable()
export class SearchSubredditResolverService {
  constructor(
    private readonly coverageKeyResolver: CoverageKeyResolverService,
  ) {}

  async resolve(options: ResolveOptions = {}): Promise<string[]> {
    return this.coverageKeyResolver.resolve(options);
  }

  async resolvePrimary(options: ResolveOptions = {}): Promise<string | null> {
    return this.coverageKeyResolver.resolvePrimary(options);
  }

  async resolveCollectable(options: ResolveOptions = {}): Promise<string[]> {
    return this.coverageKeyResolver.resolveCollectable(options);
  }

  async resolvePrimaryCollectable(
    options: ResolveOptions = {},
  ): Promise<string | null> {
    return this.coverageKeyResolver.resolvePrimaryCollectable(options);
  }
}
