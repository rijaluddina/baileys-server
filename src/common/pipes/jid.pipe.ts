import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import { isValidJid, formatJid } from '../utils/baileys-helpers.js';

@Injectable()
export class JidPipe implements PipeTransform {
  transform(value: string) {
    if (!value) {
      throw new BadRequestException('JID is required');
    }

    const formatted = formatJid(value);
    if (!isValidJid(formatted)) {
      throw new BadRequestException(`Invalid JID format: ${value}`);
    }

    return formatted;
  }
}
