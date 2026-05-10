import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '../queue.constants.js';

interface GroupActionJobData {
  sessionId: string;
  groupJid: string;
  action:
    | 'create'
    | 'leave'
    | 'update_subject'
    | 'update_description'
    | 'add_participants'
    | 'remove_participants'
    | 'promote'
    | 'demote';
  payload: Record<string, unknown>;
  correlationId: string;
}

@Injectable()
export class GroupProducer {
  private readonly logger = new Logger(GroupProducer.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.GROUP_ACTION)
    private readonly groupActionQueue: Queue<GroupActionJobData>,
  ) {}

  async create(
    sessionId: string,
    subject: string,
    participants: string[],
    options: { correlationId?: string } = {},
  ) {
    const jobData: GroupActionJobData = {
      sessionId,
      groupJid: '',
      action: 'create',
      payload: { subject, participants },
      correlationId: options.correlationId ?? '',
    };

    await this.groupActionQueue.add(
      `group-create-${sessionId}-${Date.now()}`,
      jobData,
      {
        attempts: 2,
        backoff: { type: 'fixed', delay: 3000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    this.logger.debug(`Queued group create job for session ${sessionId}`);
    return { sessionId, subject, participantsCount: participants.length };
  }

  async leave(sessionId: string, groupJid: string, correlationId?: string) {
    const jobData: GroupActionJobData = {
      sessionId,
      groupJid,
      action: 'leave',
      payload: {},
      correlationId: correlationId ?? '',
    };

    await this.groupActionQueue.add(
      `group-leave-${groupJid}-${Date.now()}`,
      jobData,
      {
        attempts: 2,
        backoff: { type: 'fixed', delay: 3000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    this.logger.debug(`Queued group leave job: ${groupJid}`);
    return { sessionId, groupJid };
  }

  async updateSubject(
    sessionId: string,
    groupJid: string,
    subject: string,
    correlationId?: string,
  ) {
    const jobData: GroupActionJobData = {
      sessionId,
      groupJid,
      action: 'update_subject',
      payload: { subject },
      correlationId: correlationId ?? '',
    };

    await this.groupActionQueue.add(
      `group-update-subject-${groupJid}-${Date.now()}`,
      jobData,
      {
        attempts: 2,
        backoff: { type: 'fixed', delay: 3000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    return { sessionId, groupJid, subject };
  }

  async updateParticipants(
    sessionId: string,
    groupJid: string,
    action: 'add_participants' | 'remove_participants' | 'promote' | 'demote',
    participants: string[],
    correlationId?: string,
  ) {
    const jobData: GroupActionJobData = {
      sessionId,
      groupJid,
      action,
      payload: { participants },
      correlationId: correlationId ?? '',
    };

    await this.groupActionQueue.add(
      `group-participants-${groupJid}-${Date.now()}`,
      jobData,
      {
        attempts: 2,
        backoff: { type: 'fixed', delay: 3000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    this.logger.debug(
      `Queued group participants ${action} for ${groupJid}: ${participants.length} participants`,
    );
    return {
      sessionId,
      groupJid,
      action,
      participantsCount: participants.length,
    };
  }
}
