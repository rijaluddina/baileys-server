import { Injectable, Logger } from '@nestjs/common';
import { SessionService } from '../session/session.service.js';
import { CheckNumberDto, UpdateProfilePictureDto } from './dto/contact.dto.js';
import axios from 'axios';

@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);

  constructor(private readonly sessionService: SessionService) {}

  async checkNumberExists(sessionId: string, dto: CheckNumberDto) {
    const socket = this.sessionService.getSocket(sessionId);
    const results: Array<{ number: string; exists: boolean; jid?: string }> = [];

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
      const url = await socket.profilePictureUrl(jid, highRes ? 'image' : 'preview');
      return { jid, profilePictureUrl: url };
    } catch {
      return { jid, profilePictureUrl: null };
    }
  }

  async getBusinessProfile(sessionId: string, jid: string) {
    const socket = this.sessionService.getSocket(sessionId);
    try {
      const profile = await socket.getBusinessProfile(jid);
      return { jid, profile };
    } catch {
      return { jid, profile: null };
    }
  }

  async getStatus(sessionId: string, jid: string) {
    const socket = this.sessionService.getSocket(sessionId);
    try {
      const status = await socket.fetchStatus(jid);
      return { jid, status };
    } catch {
      return { jid, status: null };
    }
  }

  async blockContact(sessionId: string, jid: string) {
    const socket = this.sessionService.getSocket(sessionId);
    await socket.updateBlockStatus(jid, 'block');
    return { jid, status: 'blocked' };
  }

  async unblockContact(sessionId: string, jid: string) {
    const socket = this.sessionService.getSocket(sessionId);
    await socket.updateBlockStatus(jid, 'unblock');
    return { jid, status: 'unblocked' };
  }

  async updateProfilePicture(sessionId: string, dto: UpdateProfilePictureDto) {
    const socket = this.sessionService.getSocket(sessionId);

    let imageBuffer: Buffer;
    if (dto.image.startsWith('http')) {
      const response = await axios.get(dto.image, { responseType: 'arraybuffer' });
      imageBuffer = Buffer.from(response.data);
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

  async getContacts(sessionId: string, search?: string, limit = 50, offset = 0) {
    // Now reads from database with search and pagination
    return this.sessionService.getContacts(sessionId, search, limit, offset);
  }
}
