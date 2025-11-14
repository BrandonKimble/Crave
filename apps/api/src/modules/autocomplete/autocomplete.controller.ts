import { Body, Controller, Post } from '@nestjs/common';
import { AutocompleteService } from './autocomplete.service';
import {
  AutocompleteRequestDto,
  AutocompleteResponseDto,
} from './dto/autocomplete.dto';

@Controller('autocomplete')
export class AutocompleteController {
  constructor(private readonly autocompleteService: AutocompleteService) {}

  @Post('entities')
  autocompleteEntities(
    @Body() dto: AutocompleteRequestDto,
  ): Promise<AutocompleteResponseDto> {
    return this.autocompleteService.autocompleteEntities(dto);
  }
}
