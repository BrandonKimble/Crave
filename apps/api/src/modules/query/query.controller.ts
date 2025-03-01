import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { QueryService } from './query.service';

@ApiTags('query')
@Controller('query')
export class QueryController {
  constructor(private readonly queryService: QueryService) {}

  @Get('search')
  @ApiOperation({ summary: 'Search for dishes and restaurants' })
  @ApiQuery({ name: 'q', description: 'Search query' })
  async search(@Query('q') query: string) {
    return this.queryService.processQuery(query);
  }
}
