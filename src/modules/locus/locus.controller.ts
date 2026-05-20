import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ZodSerializerDto } from 'nestjs-zod';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../../shared/types/authenticated-request';
import {
  GetLocusQueryDto,
  LocusListResponseDto,
  LocusListResponseSchema,
} from './dto/locus.dto';
// biome-ignore lint/style/useImportType: LocusService is a runtime DI token
import { LocusService } from './locus.service';

@ApiTags('Locus')
@ApiBearerAuth()
@Controller('locus')
@UseGuards(JwtAuthGuard)
export class LocusController {
  constructor(private readonly locusService: LocusService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: LocusListResponseDto })
  @ZodSerializerDto(LocusListResponseSchema)
  async findAll(
    @Query() query: GetLocusQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<LocusListResponseDto> {
    return this.locusService.findAll(query, user);
  }
}
