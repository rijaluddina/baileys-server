import {
  Controller,
  Post,
  Body,
  Param,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiSecurity,
  ApiParam,
  ApiConsumes,
} from '@nestjs/swagger';
import { MediaService } from './media.service.js';
import {
  InitUploadDto,
  StreamUploadDto,
  InitUploadResponseDto,
  CompleteUploadResponseDto,
  StreamUploadResponseDto,
} from './dto/media.dto.js';

@ApiTags('Media')
@ApiSecurity('x-api-key')
@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('upload/init')
  @ApiOperation({ summary: 'Initiate presigned URL upload' })
  initUpload(@Body() dto: InitUploadDto): Promise<InitUploadResponseDto> {
    return this.mediaService.initUpload(dto);
  }

  @Post('upload/:id/complete')
  @ApiOperation({ summary: 'Complete presigned URL upload' })
  @ApiParam({ name: 'id', description: 'Upload ID from init' })
  completeUpload(@Param('id') id: string): CompleteUploadResponseDto {
    return this.mediaService.completeUpload(id);
  }

  @Post()
  @ApiOperation({ summary: 'Stream upload a file' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  streamUpload(
    @UploadedFile()
    file: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer?: Buffer;
    },
    @Body() dto: StreamUploadDto,
  ): Promise<StreamUploadResponseDto> {
    return this.mediaService.streamUpload(file, dto.sessionId);
  }
}
