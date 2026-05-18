import { EventEmitter2 } from '@nestjs/event-emitter';
import { EventBusService, InternalEvent } from './event-bus.service.js';

describe('EventBusService', () => {
  let service: EventBusService;
  let mockEventEmitter: { emit: jest.Mock };

  beforeEach(() => {
    mockEventEmitter = { emit: jest.fn() };
    service = new EventBusService(mockEventEmitter as unknown as EventEmitter2);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('publish', () => {
    it('should emit to EventEmitter2', () => {
      const event: InternalEvent = {
        type: 'test.event',
        sessionId: 'session-1',
        data: { key: 'value' },
        timestamp: new Date(),
      };

      service.publish(event);

      expect(mockEventEmitter.emit).toHaveBeenCalledWith('test.event', event);
    });

    it('should call sync handlers', () => {
      const handler = jest.fn();
      service.subscribe('test.event', handler);

      const event: InternalEvent = {
        type: 'test.event',
        sessionId: 'session-1',
        data: {},
        timestamp: new Date(),
      };

      service.publish(event);

      expect(handler).toHaveBeenCalledWith(event);
    });

    it('should handle async handlers', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      service.subscribe('async.event', handler);

      const event: InternalEvent = {
        type: 'async.event',
        sessionId: 'session-1',
        data: {},
        timestamp: new Date(),
      };

      service.publish(event);

      await new Promise((r) => setTimeout(r, 10));
      expect(handler).toHaveBeenCalledWith(event);
    });

    it('should handle handler errors gracefully', () => {
      const errorHandler = jest.fn().mockImplementation(() => {
        throw new Error('Handler error');
      });
      const normalHandler = jest.fn();
      service.subscribe('error.event', errorHandler);
      service.subscribe('error.event', normalHandler);

      const event: InternalEvent = {
        type: 'error.event',
        sessionId: 'session-1',
        data: {},
        timestamp: new Date(),
      };

      expect(() => service.publish(event)).not.toThrow();
      expect(normalHandler).toHaveBeenCalled();
    });

    it('should not crash when no handlers registered', () => {
      const event: InternalEvent = {
        type: 'no.handlers.event',
        sessionId: 'session-1',
        data: {},
        timestamp: new Date(),
      };

      expect(() => service.publish(event)).not.toThrow();
      expect(mockEventEmitter.emit).toHaveBeenCalled();
    });
  });

  describe('subscribe', () => {
    it('should add handler to map', () => {
      const handler = jest.fn();
      const _unsubscribe = service.subscribe('my.event', handler);

      const event: InternalEvent = {
        type: 'my.event',
        sessionId: 'session-1',
        data: {},
        timestamp: new Date(),
      };

      service.publish(event);

      expect(handler).toHaveBeenCalledWith(event);
    });

    it('should return unsubscribe function', () => {
      const handler = jest.fn();
      const unsubscribe = service.subscribe('unsub.event', handler);

      unsubscribe();

      const event: InternalEvent = {
        type: 'unsub.event',
        sessionId: 'session-1',
        data: {},
        timestamp: new Date(),
      };

      service.publish(event);

      expect(handler).not.toHaveBeenCalled();
    });

    it('should allow multiple handlers for same event', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      service.subscribe('multi.event', handler1);
      service.subscribe('multi.event', handler2);

      const event: InternalEvent = {
        type: 'multi.event',
        sessionId: 'session-1',
        data: {},
        timestamp: new Date(),
      };

      service.publish(event);

      expect(handler1).toHaveBeenCalledWith(event);
      expect(handler2).toHaveBeenCalledWith(event);
    });
  });

  describe('subscribeMany', () => {
    it('should subscribe to multiple event types', () => {
      const handler = jest.fn();
      service.subscribeMany(['event.a', 'event.b', 'event.c'], handler);

      const eventA: InternalEvent = {
        type: 'event.a',
        sessionId: 's1',
        data: {},
        timestamp: new Date(),
      };
      const eventB: InternalEvent = {
        type: 'event.b',
        sessionId: 's1',
        data: {},
        timestamp: new Date(),
      };
      const eventC: InternalEvent = {
        type: 'event.c',
        sessionId: 's1',
        data: {},
        timestamp: new Date(),
      };

      service.publish(eventA);
      service.publish(eventB);
      service.publish(eventC);

      expect(handler).toHaveBeenCalledTimes(3);
    });

    it('should return combined unsubscribe function', () => {
      const handler = jest.fn();
      const _unsubscribe = service.subscribeMany(
        ['x.event', 'y.event'],
        handler,
      );

      _unsubscribe();

      service.publish({
        type: 'x.event',
        sessionId: 's1',
        data: {},
        timestamp: new Date(),
      });
      service.publish({
        type: 'y.event',
        sessionId: 's1',
        data: {},
        timestamp: new Date(),
      });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('emit', () => {
    it('should create InternalEvent with correct structure', () => {
      const publishSpy = jest.spyOn(service, 'publish');
      const before = new Date();

      service.emit('my.type', 'session-123', { foo: 'bar' }, 'corr-1');

      const after = new Date();
      expect(publishSpy).toHaveBeenCalledTimes(1);

      const calledEvent = publishSpy.mock.calls[0][0];
      expect(calledEvent.type).toBe('my.type');
      expect(calledEvent.sessionId).toBe('session-123');
      expect(calledEvent.data).toEqual({ foo: 'bar' });
      expect(calledEvent.correlationId).toBe('corr-1');
      expect(calledEvent.timestamp).toBeInstanceOf(Date);
      expect(calledEvent.timestamp.getTime()).toBeGreaterThanOrEqual(
        before.getTime(),
      );
      expect(calledEvent.timestamp.getTime()).toBeLessThanOrEqual(
        after.getTime(),
      );
    });

    it('should include optional correlationId when provided', () => {
      const publishSpy = jest.spyOn(service, 'publish');

      service.emit('typed.event', 'session-1', {}, 'correlation-123');

      const calledEvent = publishSpy.mock.calls[0][0];
      expect(calledEvent.correlationId).toBe('correlation-123');
    });

    it('should omit correlationId when not provided', () => {
      const publishSpy = jest.spyOn(service, 'publish');

      service.emit('typed.event', 'session-1', {});

      const calledEvent = publishSpy.mock.calls[0][0];
      expect(calledEvent.correlationId).toBeUndefined();
    });
  });
});
