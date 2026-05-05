import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';

const SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

/**
 * Validates that a sessionId route param only contains safe characters.
 * Prevents injection via Redis cache keys, EventEmitter names, and DB queries.
 */
@Injectable()
export class SessionIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!SESSION_ID_PATTERN.test(value)) {
      throw new BadRequestException(
        'Session ID must be 1-64 characters: letters, digits, hyphens, underscores only',
      );
    }
    return value;
  }
}
