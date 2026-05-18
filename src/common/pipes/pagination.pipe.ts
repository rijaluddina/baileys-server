import { PipeTransform, BadRequestException } from '@nestjs/common';
import {
  PaginationDto,
  DEFAULT_PAGINATION_LIMIT,
  MAX_PAGINATION_LIMIT,
} from '../dto/pagination.dto.js';

export class PaginationPipe implements PipeTransform<PaginationDto> {
  transform(value: PaginationDto): PaginationDto {
    const page = value.page ?? 1;
    const limit = value.limit ?? DEFAULT_PAGINATION_LIMIT;

    if (page < 1) {
      throw new BadRequestException('Page must be >= 1');
    }

    if (limit < 1) {
      throw new BadRequestException('Limit must be >= 1');
    }

    if (limit > MAX_PAGINATION_LIMIT) {
      throw new BadRequestException(`Limit must be <= ${MAX_PAGINATION_LIMIT}`);
    }

    return {
      ...value,
      page,
      limit,
      sortOrder: value.sortOrder ?? 'desc',
    };
  }
}
