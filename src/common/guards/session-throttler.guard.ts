import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class SessionThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(req: Record<string, unknown>): Promise<string> {
    // Attempt to extract sessionId from route params or query
    const params = req.params as Record<string, string> | undefined;
    const query = req.query as Record<string, string> | undefined;
    const sessionId = params?.['sessionId'] || query?.['sessionId'];

    return Promise.resolve(sessionId ?? (req.ip as string) ?? 'unknown');
  }
}
