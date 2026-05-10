import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '../queue.constants.js';

interface MediaUploadJobData {
  sessionId: string;
  fileKey: string;
  mimeType: string;
  originalName: string;
  size: number;
  correlationId: string;
}

interface MediaDownloadJobData {
  sessionId: string;
  url: string;
  mediaType: string;
  correlationId: string;
}

@Injectable()
export class MediaProducer {
  private readonly logger = new Logger(MediaProducer.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.MEDIA_UPLOAD)
    private readonly mediaUploadQueue: Queue<MediaUploadJobData>,
    @InjectQueue(QUEUE_NAMES.MEDIA_DOWNLOAD)
    private readonly mediaDownloadQueue: Queue<MediaDownloadJobData>,
  ) {}

  async upload(
    sessionId: string,
    fileKey: string,
    mimeType: string,
    originalName: string,
    size: number,
    correlationId?: string,
  ) {
    const jobData: MediaUploadJobData = {
      sessionId,
      fileKey,
      mimeType,
      originalName,
      size,
      correlationId: correlationId ?? '',
    };

    await this.mediaUploadQueue.add(
      `upload-${fileKey}-${Date.now()}`,
      jobData,
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    this.logger.debug(`Queued media upload job: ${fileKey}`);
    return { jobId: fileKey, sessionId };
  }

  async download(
    sessionId: string,
    url: string,
    mediaType: string,
    correlationId?: string,
  ) {
    const jobData: MediaDownloadJobData = {
      sessionId,
      url,
      mediaType,
      correlationId: correlationId ?? '',
    };

    await this.mediaDownloadQueue.add(
      `download-${sessionId}-${Date.now()}`,
      jobData,
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    this.logger.debug(`Queued media download job from: ${url}`);
    return { sessionId, url, mediaType };
  }
}
