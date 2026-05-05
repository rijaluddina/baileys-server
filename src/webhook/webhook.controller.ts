import {
  Controller,
  Get,
  Post,
  Param,
  NotFoundException,
} from '@nestjs/common';
import { QueueService } from '../queue/queue.service.js';

@Controller('webhooks')
export class WebhookController {
  constructor(private readonly queueService: QueueService) {}

  @Get('failed')
  async getFailedJobs() {
    return this.queueService.getFailedWebhookJobs();
  }

  @Post('failed/replay')
  async replayAll() {
    const count = await this.queueService.replayAllFailedWebhookJobs();
    return { status: 'success', replayedCount: count };
  }

  @Post('failed/:jobId/replay')
  async replayOne(@Param('jobId') jobId: string) {
    const success = await this.queueService.replayWebhookJob(jobId);
    if (!success) {
      throw new NotFoundException(
        `Job with ID ${jobId} not found or not in failed state`,
      );
    }
    return { status: 'success', jobId };
  }
}
