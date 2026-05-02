import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { SessionService } from '../session/session.service.js';
import type {
  AnyMessageContent,
  ChatModification,
  MiscMessageGenerationOptions,
  WAMessage,
  WAMessageKey,
} from '@whiskeysockets/baileys';
import axios from 'axios';
import {
  SendTextDto,
  SendMediaDto,
  SendContactDto,
  SendLocationDto,
  SendPollDto,
  SendButtonsDto,
  SendListDto,
  SendReactionDto,
  EditMessageDto,
  DeleteMessageDto,
  ForwardMessageDto,
  ReadMessagesDto,
  StarMessageDto,
  SendStatusDto,
} from './dto/messaging.dto.js';

@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);

  constructor(private readonly sessionService: SessionService) {}

  private formatJid(jid: string): string {
    if (jid.includes('@')) return jid;
    const cleaned = jid.replace(/[^0-9]/g, '');
    return `${cleaned}@s.whatsapp.net`;
  }

  private toWAMessage(message: Record<string, unknown>): WAMessage {
    if (!message['key'] || typeof message['key'] !== 'object') {
      throw new BadRequestException('Forwarded message must include a Baileys message key');
    }

    return message as unknown as WAMessage;
  }

  async sendText(sessionId: string, dto: SendTextDto) {
    const socket = this.sessionService.getSocket(sessionId);
    const jid = this.formatJid(dto.to);

    const quoted = dto.quotedMessageId
      ? await this.sessionService.findMessage(sessionId, jid, dto.quotedMessageId)
      : undefined;

    const opts: MiscMessageGenerationOptions = {};
    if (quoted) opts.quoted = quoted;

    const result = await socket.sendMessage(jid, { text: dto.text }, opts);
    return { messageId: result?.key?.id, status: 'sent' };
  }

  async sendMedia(sessionId: string, dto: SendMediaDto) {
    const socket = this.sessionService.getSocket(sessionId);
    const jid = this.formatJid(dto.to);

    let mediaBuffer: Buffer;
    if (dto.media.startsWith('http://') || dto.media.startsWith('https://')) {
      const response = await axios.get(dto.media, { responseType: 'arraybuffer' });
      mediaBuffer = Buffer.from(response.data);
    } else if (dto.media.startsWith('data:')) {
      const base64Data = dto.media.split(',')[1];
      mediaBuffer = Buffer.from(base64Data, 'base64');
    } else {
      mediaBuffer = Buffer.from(dto.media, 'base64');
    }

    const quoted = dto.quotedMessageId
      ? await this.sessionService.findMessage(sessionId, jid, dto.quotedMessageId)
      : undefined;

    const opts: MiscMessageGenerationOptions = {};
    if (quoted) opts.quoted = quoted;

    let messageContent: AnyMessageContent;

    switch (dto.type) {
      case 'image':
        messageContent = {
          image: mediaBuffer,
          caption: dto.caption,
          mimetype: dto.mimetype || 'image/jpeg',
          viewOnce: dto.viewOnce,
        };
        break;
      case 'video':
        messageContent = {
          video: mediaBuffer,
          caption: dto.caption,
          mimetype: dto.mimetype || 'video/mp4',
          viewOnce: dto.viewOnce,
        };
        break;
      case 'audio':
        messageContent = {
          audio: mediaBuffer,
          mimetype: dto.mimetype || 'audio/mpeg',
          ptt: true,
        };
        break;
      case 'document':
        messageContent = {
          document: mediaBuffer,
          caption: dto.caption,
          mimetype: dto.mimetype || 'application/pdf',
          fileName: dto.fileName || 'document',
        };
        break;
      case 'sticker':
        messageContent = {
          sticker: mediaBuffer,
          mimetype: dto.mimetype || 'image/webp',
        };
        break;
      default:
        throw new BadRequestException(`Invalid media type: ${dto.type}`);
    }

    const result = await socket.sendMessage(jid, messageContent, opts);
    return { messageId: result?.key?.id, status: 'sent' };
  }

  async sendContact(sessionId: string, dto: SendContactDto) {
    const socket = this.sessionService.getSocket(sessionId);
    const jid = this.formatJid(dto.to);

    const vCards = dto.contacts.map((contact) => {
      return [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `FN:${contact.fullName}`,
        contact.organization ? `ORG:${contact.organization}` : '',
        `TEL;type=CELL;type=VOICE;waid=${contact.phoneNumber.replace(/[^0-9]/g, '')}:${contact.phoneNumber}`,
        'END:VCARD',
      ]
        .filter(Boolean)
        .join('\n');
    });

    const result = await socket.sendMessage(jid, {
      contacts: {
        displayName: dto.contacts.length === 1 ? dto.contacts[0].fullName : `${dto.contacts.length} contacts`,
        contacts: vCards.map((vcard) => ({ vcard })),
      },
    });

    return { messageId: result?.key?.id, status: 'sent' };
  }

  async sendLocation(sessionId: string, dto: SendLocationDto) {
    const socket = this.sessionService.getSocket(sessionId);
    const jid = this.formatJid(dto.to);

    const result = await socket.sendMessage(jid, {
      location: {
        degreesLatitude: dto.latitude,
        degreesLongitude: dto.longitude,
        name: dto.name,
        address: dto.address,
      },
    });

    return { messageId: result?.key?.id, status: 'sent' };
  }

  async sendPoll(sessionId: string, dto: SendPollDto) {
    const socket = this.sessionService.getSocket(sessionId);
    const jid = this.formatJid(dto.to);

    const result = await socket.sendMessage(jid, {
      poll: {
        name: dto.name,
        values: dto.options.map((o) => o.name),
        selectableCount: dto.selectableCount ?? 1,
      },
    });

    return { messageId: result?.key?.id, status: 'sent' };
  }

  async sendButtons(sessionId: string, dto: SendButtonsDto) {
    const socket = this.sessionService.getSocket(sessionId);
    const jid = this.formatJid(dto.to);

    const content = {
      text: dto.text,
      footer: dto.footer,
      buttons: dto.buttons,
      headerType: 1,
    } as unknown as AnyMessageContent;

    const result = await socket.sendMessage(jid, content);

    return { messageId: result?.key?.id, status: 'sent' };
  }

  async sendList(sessionId: string, dto: SendListDto) {
    const socket = this.sessionService.getSocket(sessionId);
    const jid = this.formatJid(dto.to);

    const content = {
      text: dto.text,
      footer: dto.footer,
      title: dto.title,
      buttonText: dto.buttonText,
      sections: dto.sections,
    } as unknown as AnyMessageContent;

    const result = await socket.sendMessage(jid, content);

    return { messageId: result?.key?.id, status: 'sent' };
  }

  async sendReaction(sessionId: string, dto: SendReactionDto) {
    const socket = this.sessionService.getSocket(sessionId);
    const jid = this.formatJid(dto.to);

    const result = await socket.sendMessage(jid, {
      react: {
        text: dto.reaction,
        key: {
          remoteJid: jid,
          id: dto.messageId,
        },
      },
    });

    return { messageId: result?.key?.id, status: 'sent' };
  }

  async editMessage(sessionId: string, dto: EditMessageDto) {
    const socket = this.sessionService.getSocket(sessionId);
    const jid = this.formatJid(dto.to);

    const editKey: WAMessageKey = {
      remoteJid: jid,
      id: dto.messageId,
      fromMe: true,
    };

    const result = await socket.sendMessage(jid, {
      text: dto.text,
      edit: editKey,
    });

    return { messageId: result?.key?.id, status: 'edited' };
  }

  async deleteMessage(sessionId: string, dto: DeleteMessageDto) {
    const socket = this.sessionService.getSocket(sessionId);
    const jid = this.formatJid(dto.to);

    const messageKey: WAMessageKey = {
      remoteJid: jid,
      id: dto.messageId,
      fromMe: true,
    };

    if (dto.forEveryone !== false) {
      await socket.sendMessage(jid, {
        delete: messageKey,
      });
    } else {
      const modification: ChatModification = {
        deleteForMe: {
          deleteMedia: true,
          key: messageKey,
          timestamp: Date.now(),
        },
      };
      await socket.chatModify(modification, jid);
    }

    return { status: 'deleted' };
  }

  async forwardMessage(sessionId: string, dto: ForwardMessageDto) {
    const socket = this.sessionService.getSocket(sessionId);
    const jid = this.formatJid(dto.to);

    const result = await socket.sendMessage(jid, { forward: this.toWAMessage(dto.message) });
    return { messageId: result?.key?.id, status: 'forwarded' };
  }

  async readMessages(sessionId: string, dto: ReadMessagesDto) {
    const socket = this.sessionService.getSocket(sessionId);
    await socket.readMessages(dto.keys as WAMessageKey[]);
    return { status: 'read', count: dto.keys.length };
  }

  async starMessages(sessionId: string, dto: StarMessageDto) {
    const socket = this.sessionService.getSocket(sessionId);
    const jid = dto.messages[0]?.remoteJid;
    if (!jid) throw new BadRequestException('No messages provided');
    const msgs = dto.messages.map((m) => ({ id: m.id, fromMe: m.fromMe }));
    await socket.star(jid, msgs, dto.star);
    return { status: dto.star ? 'starred' : 'unstarred' };
  }

  async sendLinkPreview(sessionId: string, to: string, url: string, text?: string) {
    const socket = this.sessionService.getSocket(sessionId);
    const jid = this.formatJid(to);

    const result = await socket.sendMessage(jid, {
      text: text ? `${text}\n${url}` : url,
    });

    return { messageId: result?.key?.id, status: 'sent' };
  }

  async sendStatus(sessionId: string, dto: SendStatusDto) {
    const socket = this.sessionService.getSocket(sessionId);
    const statusJid = 'status@broadcast';

    let messageContent: AnyMessageContent;
    const options: MiscMessageGenerationOptions = {
      statusJidList: dto.statusJidList,
    };

    switch (dto.type) {
      case 'text':
        if (!dto.text) throw new BadRequestException('Text is required for text status');
        messageContent = {
          text: dto.text,
        };
        options.backgroundColor = dto.backgroundColor;
        options.font = dto.font;
        break;
      case 'image': {
        if (!dto.media) throw new BadRequestException('Media URL is required for image status');
        let buffer: Buffer;
        if (dto.media.startsWith('http')) {
          const res = await axios.get(dto.media, { responseType: 'arraybuffer' });
          buffer = Buffer.from(res.data);
        } else {
          buffer = Buffer.from(dto.media, 'base64');
        }
        messageContent = { image: buffer, caption: dto.caption };
        break;
      }
      case 'video': {
        if (!dto.media) throw new BadRequestException('Media URL is required for video status');
        let buffer: Buffer;
        if (dto.media.startsWith('http')) {
          const res = await axios.get(dto.media, { responseType: 'arraybuffer' });
          buffer = Buffer.from(res.data);
        } else {
          buffer = Buffer.from(dto.media, 'base64');
        }
        messageContent = { video: buffer, caption: dto.caption };
        break;
      }
      default:
        throw new BadRequestException(`Invalid status type: ${dto.type}`);
    }

    const result = await socket.sendMessage(
      statusJid,
      messageContent,
      options,
    );

    return { messageId: result?.key?.id, status: 'posted' };
  }
}
