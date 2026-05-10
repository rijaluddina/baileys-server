import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

export interface InternalEvent {
  type: string;
  sessionId: string;
  data: unknown;
  timestamp: Date;
  correlationId?: string;
}

export type EventHandler = (event: InternalEvent) => void | Promise<void>;

@Injectable()
export class EventBusService {
  private readonly logger = new Logger(EventBusService.name);
  private readonly handlers = new Map<string, EventHandler[]>();

  constructor(private readonly eventEmitter: EventEmitter2) {}

  publish(event: InternalEvent): void {
    this.eventEmitter.emit(event.type, event);

    const handlers = this.handlers.get(event.type) ?? [];
    for (const handler of handlers) {
      try {
        const result = handler(event);
        if (result instanceof Promise) {
          result.catch((err) =>
            this.logger.error(
              `Async event handler error for "${event.type}": ${err}`,
            ),
          );
        }
      } catch (err) {
        this.logger.error(`Event handler error for "${event.type}": ${err}`);
      }
    }
  }

  subscribe(eventType: string, handler: EventHandler): () => void {
    const existing = this.handlers.get(eventType) ?? [];
    this.handlers.set(eventType, [...existing, handler]);

    return () => {
      const handlers = this.handlers.get(eventType) ?? [];
      this.handlers.set(
        eventType,
        handlers.filter((h) => h !== handler),
      );
    };
  }

  subscribeMany(eventTypes: string[], handler: EventHandler): () => void {
    const unsubscribes = eventTypes.map((type) =>
      this.subscribe(type, handler),
    );
    return () => unsubscribes.forEach((unsub) => unsub());
  }

  emit(
    type: string,
    sessionId: string,
    data: unknown,
    correlationId?: string,
  ): void {
    this.publish({
      type,
      sessionId,
      data,
      timestamp: new Date(),
      correlationId,
    });
  }
}
