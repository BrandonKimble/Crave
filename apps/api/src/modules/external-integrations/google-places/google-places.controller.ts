import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common';
import { GooglePlacesService } from './google-places.service';
import { LoggerService } from '../../../shared';

@Controller('integrations/google-places')
export class GooglePlacesController {
  private readonly logger: LoggerService;

  constructor(
    private readonly googlePlacesService: GooglePlacesService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('GooglePlacesController');
  }

  @Get('autocomplete')
  async autocomplete(
    @Query('input') input: string,
    @Query('language') language?: string,
    @Query('country') country?: string,
    @Query('sessionToken') sessionToken?: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('radius') radius?: string,
    @Query('types') types?: string,
  ) {
    if (!input) {
      throw new BadRequestException('input query parameter is required');
    }

    const latNum = lat ? Number(lat) : undefined;
    const lngNum = lng ? Number(lng) : undefined;
    const radiusNum = radius ? Number(radius) : undefined;

    const locationBias =
      latNum !== undefined &&
      !Number.isNaN(latNum) &&
      lngNum !== undefined &&
      !Number.isNaN(lngNum)
        ? {
            lat: latNum,
            lng: lngNum,
            radiusMeters:
              radiusNum !== undefined && !Number.isNaN(radiusNum)
                ? radiusNum
                : undefined,
          }
        : undefined;

    this.logger.debug('Probing Google Places autocomplete', {
      input,
      country,
      language,
      hasLocationBias: Boolean(locationBias),
    });

    return this.googlePlacesService.autocompletePlace(input, {
      language,
      sessionToken,
      components: country ? { country } : undefined,
      locationBias,
      types,
      includeRaw: true,
    });
  }

  @Get('probe/:placeId')
  async probePlace(
    @Param('placeId') placeId: string,
    @Query('fields') fields?: string,
    @Query('language') language?: string,
    @Query('includeRaw') includeRaw?: string,
  ) {
    const fieldList = fields
      ?.split(',')
      .map((field) => field.trim())
      .filter((field) => field.length > 0);

    const includeRawFlag = includeRaw === 'true' || includeRaw === '1';

    this.logger.debug('Probing Google Place details', {
      placeId,
      fields: fieldList,
      language,
      includeRaw: includeRawFlag,
    });

    return this.googlePlacesService.getPlaceDetails(placeId, {
      fields: fieldList,
      language,
      includeRaw: includeRawFlag,
    });
  }
}
