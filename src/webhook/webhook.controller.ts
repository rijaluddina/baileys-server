import { Controller, Get, Post, Param, HttpException, HttpStatus } from '@nestjs/common';
import { QueueService } from '../queue/queue.service.js';

@Controller('api/webhooks')
export class WebhookController {
  constructor(private readonly queueService: QueueService) {}

  @Get('failed')
  async getFailedWebhooks() {
    const jobs = await this.queueService.getFailedWebhookJobs();
    return jobs.map(job => ({
      id: job.id,
      name: job.name,
      data: job.data,
      failedReason: job.failedReason,
      timestamp: job.timestamp,
      attemptsMade: job.attemptsMade,
    }));
  }

  @Post('failed/replay')
  async replayAllFailedWebhooks() {
    const result = await this.queueService.replayAllFailedWebhookJobs();
    return {
      message: `Replayed ${result.replayed} of ${result.total} failed webhook jobs`,
      result,
    };
  }

  @Post('failed/:jobId/replay')
  async replayFailedWebhook(@Param('jobId') jobId: string) {
    try {
      const replayed = await this.queueService.replayWebhookJob(jobId);
      if (replayed) {
        return { message: `Successfully queued job ${jobId} for retry` };
      }
      throw new HttpException('Job is not in a failed state', HttpStatus.BAD_REQUEST);
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes('not found')) {
        throw new HttpException(error.message, HttpStatus.NOT_FOUND);
      }
      throw new HttpException(
        error instanceof Error ? error.message : 'Unknown error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
