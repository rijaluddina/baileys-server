import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { SessionService } from '../session/session.service.js';
import { SessionDataService } from '../session/session-data.service.js';
import { CheckNumberDto, UpdateProfilePictureDto } from './dto/contact.dto.js';
import { isUserJid } from '../common/utils/baileys-helpers.js';
import axios from 'axios';

@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);

  constructor(
    private readonly sessionService: SessionService,
    private readonly sessionDataService: SessionDataService,
  ) {}

  async checkNumberExists(sessionId: string, dto: CheckNumberDto) {
    const socket = this.sessionService.getSocket(sessionId);
    const results: Array<{ number: string; exists: boolean; jid?: string }> =
      [];

    for (const number of dto.numbers) {
      try {
        const cleaned = number.replace(/[^0-9]/g, '');
        const response = await socket.onWhatsApp(cleaned);
        const result = response?.[0];
        results.push({
          number,
          exists: !!result?.exists,
          jid: result?.jid,
        });
      } catch {
        results.push({ number, exists: false });
      }
    }

    return results;
  }

  async getProfilePicture(sessionId: string, jid: string, highRes = false) {
    const socket = this.sessionService.getSocket(sessionId);
    try {
      const url = await socket.profilePictureUrl(
        jid,
        highRes ? 'image' : 'preview',
      );
      return { jid, profilePictureUrl: url };
    } catch {
      return { jid, profilePictureUrl: null };
    }
  }

  async getBusinessProfile(sessionId: string, jid: string) {
    const socket = this.sessionService.getSocket(sessionId);
    try {
      const [profile, profilePicture, status] = await Promise.all([
        socket.getBusinessProfile(jid).catch((err) => {
          this.logger.debug(`Could not fetch business profile for ${jid}: ${err.message}`);
          return null;
        }),
        this.getProfilePicture(sessionId, jid, true),
        this.getStatus(sessionId, jid),
      ]);

      return {
        jid,
        ...(profile || {}),
        profilePictureUrl: profilePicture?.profilePictureUrl ?? null,
        status: status?.status ?? null,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get business profile for ${jid}: ${error.message}`,
      );
      return { jid, profile: null, error: error.message };
    }
  }

  async updateBusinessProfile(
    sessionId: string,
    dto: import('./dto/contact.dto.js').UpdateBusinessProfileDto,
  ) {
    const socket = this.sessionService.getSocket(sessionId);
    // Note: Baileys has a typo in the method name (updateBussinesProfile)
    try {
      await socket.updateBussinesProfile(dto);
      return { status: 'updated' };
    } catch (error) {
      throw new BadRequestException(
        `Failed to update business profile: ${error.message}`,
      );
    }
  }

  async getStatus(sessionId: string, jid: string) {
    const socket = this.sessionService.getSocket(sessionId);
    try {
      const status = await socket.fetchStatus(jid);
      const result = Array.isArray(status) ? status[0] : status;
      return { jid, status: result?.status ?? null };
    } catch {
      return { jid, status: null };
    }
  }

  async blockContact(sessionId: string, jid: string) {
    if (!isUserJid(jid)) {
      throw new BadRequestException('Only user JIDs can be blocked');
    }
    const socket = this.sessionService.getSocket(sessionId);
    try {
      await socket.updateBlockStatus(jid, 'block');
      return { jid, status: 'blocked' };
    } catch (error) {
      this.logger.error(`Failed to block contact ${jid}: ${error.message}`);
      throw new BadRequestException(`Failed to block contact: ${error.message}`);
    }
  }

  async unblockContact(sessionId: string, jid: string) {
    if (!isUserJid(jid)) {
      throw new BadRequestException('Only user JIDs can be unblocked');
    }
    const socket = this.sessionService.getSocket(sessionId);
    try {
      await socket.updateBlockStatus(jid, 'unblock');
      return { jid, status: 'unblocked' };
    } catch (error) {
      this.logger.error(`Failed to unblock contact ${jid}: ${error.message}`);
      throw new BadRequestException(
        `Failed to unblock contact: ${error.message}`,
      );
    }
  }

  async updateProfilePicture(sessionId: string, dto: UpdateProfilePictureDto) {
    const socket = this.sessionService.getSocket(sessionId);

    let imageBuffer: Buffer;
    if (dto.image.startsWith('http')) {
      const response = await axios.get(dto.image, {
        responseType: 'arraybuffer',
      });
      imageBuffer = Buffer.from(response.data as ArrayBuffer);
    } else {
      imageBuffer = Buffer.from(dto.image, 'base64');
    }

    const me = socket.user?.id;
    if (me) {
      await socket.updateProfilePicture(me, imageBuffer);
    }
    return { status: 'updated' };
  }

  async updateProfileName(sessionId: string, name: string) {
    const socket = this.sessionService.getSocket(sessionId);
    await socket.updateProfileName(name);
    return { status: 'updated' };
  }

  async updateProfileStatus(sessionId: string, status: string) {
    const socket = this.sessionService.getSocket(sessionId);
    await socket.updateProfileStatus(status);
    return { status: 'updated' };
  }

  async getContacts(
    sessionId: string,
    search?: string,
    limit = 50,
    offset = 0,
  ) {
    // Now reads from database with search and pagination
    return this.sessionDataService.getContacts(
      sessionId,
      search,
      limit,
      offset,
    );
  }
}
