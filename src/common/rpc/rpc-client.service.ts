import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service.js';
import {
  RpcOptions,
  RpcResult,
  CircuitBreakerState,
  CB_CONFIG,
  RpcMessage,
  RpcResponse,
} from './rpc.types.js';

@Injectable()
export class RpcClientService {
  private readonly logger = new Logger(RpcClientService.name);
  private readonly circuitBreakers = new Map<string, CircuitBreakerState>();
  private readonly pendingRequests = new Map<string, {
    resolve: (value: RpcResult<unknown>) => void;
    reject: (reason: Error) => void;
    timeout: NodeJS.Timeout;
  }>();

  constructor(private readonly redisService: RedisService) {
    this.initializeSubscriber();
  }

  private async initializeSubscriber(): Promise<void> {
    const responseChannel = `rpc:responses:${process.pid}`;
    await this.redisService.subscribe(responseChannel, (message: string) => {
      this.handleResponse(message);
    });
  }

  private handleResponse(message: string): void {
    try {
      const response: RpcResponse = JSON.parse(message);
      const pending = this.pendingRequests.get(response.correlationId);
      if (!pending) return;

      clearTimeout(pending.timeout);
      this.pendingRequests.delete(response.correlationId);

      if (response.success) {
        pending.resolve({ success: true, data: response.data });
      } else {
        pending.resolve({ success: false, error: response.error });
      }
    } catch (err) {
      this.logger.error(`Failed to parse RPC response: ${err}`);
    }
  }

  async call<T>(
    workerId: string,
    action: string,
    payload: unknown,
    options: RpcOptions = {},
  ): Promise<RpcResult<T>> {
    const { timeout = 5000, correlationId } = options;
    const resolvedCorrelationId = correlationId ?? this.generateCorrelationId();

    if (!this.checkCircuit(workerId)) {
      return {
        success: false,
        error: `Circuit breaker open for worker ${workerId}`,
      };
    }

    const result = await this.executeCall<T>(workerId, action, payload, {
      timeout,
      correlationId: resolvedCorrelationId,
    });

    if (result.success) {
      this.recordSuccess(workerId);
    } else {
      this.recordFailure(workerId);
    }

    return result;
  }

  private async executeCall<T>(
    workerId: string,
    action: string,
    payload: unknown,
    options: RpcOptions,
  ): Promise<RpcResult<T>> {
    const timeout = options.timeout ?? 5000;
    const correlationId = options.correlationId ?? this.generateCorrelationId();
    const responseChannel = `rpc:responses:${process.pid}`;
    const requestChannel = `rpc:requests:${workerId}`;

    const message: RpcMessage = {
      correlationId,
      action,
      payload,
      timestamp: Date.now(),
      replyChannel: responseChannel,
    };

    return new Promise((resolve) => {
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(correlationId);
        resolve({ success: false, error: 'Request timeout' });
      }, timeout);

      this.pendingRequests.set(correlationId, {
        resolve: resolve as (value: RpcResult<unknown>) => void,
        reject: () => {},
        timeout: timeoutHandle,
      });

      this.redisService
        .publish(requestChannel, JSON.stringify(message))
        .then(() => {})
        .catch((err) => {
          clearTimeout(timeoutHandle);
          this.pendingRequests.delete(correlationId);
          resolve({ success: false, error: err.message });
        });
    });
  }

  checkCircuit(workerId: string): boolean {
    const cb = this.circuitBreakers.get(workerId);
    if (!cb) return true;

    const now = Date.now();

    switch (cb.state) {
      case 'closed':
        return true;
      case 'open':
        if (now - cb.lastFailureTime >= CB_CONFIG.OPEN_TIMEOUT_MS) {
          this.transitionToHalfOpen(workerId);
          return true;
        }
        return false;
      case 'half-open':
        return true;
      default:
        return true;
    }
  }

  recordSuccess(workerId: string): void {
    const cb = this.circuitBreakers.get(workerId);
    if (!cb) return;

    cb.lastSuccessTime = Date.now();

    if (cb.state === 'half-open') {
      cb.failures = 0;
      cb.state = 'closed';
      this.logger.log(`Circuit breaker closed for worker ${workerId}`);
    } else {
      cb.failures = 0;
    }
  }

  recordFailure(workerId: string): void {
    const cb = this.circuitBreakers.get(workerId);
    const now = Date.now();

    if (!cb) {
      this.circuitBreakers.set(workerId, {
        state: 'closed',
        failures: 1,
        lastFailureTime: now,
        lastSuccessTime: 0,
      });
      return;
    }

    cb.failures += 1;
    cb.lastFailureTime = now;

    if (cb.state === 'half-open') {
      this.transitionToOpen(workerId);
    } else if (cb.failures >= CB_CONFIG.FAILURE_THRESHOLD) {
      this.transitionToOpen(workerId);
    }
  }

  private transitionToOpen(workerId: string): void {
    const cb = this.circuitBreakers.get(workerId);
    if (!cb) return;

    cb.state = 'open';
    this.logger.warn(`Circuit breaker opened for worker ${workerId} after ${cb.failures} failures`);
  }

  private transitionToHalfOpen(workerId: string): void {
    const cb = this.circuitBreakers.get(workerId);
    if (!cb) return;

    cb.state = 'half-open';
    this.logger.log(`Circuit breaker half-open for worker ${workerId}`);
  }

  getCircuitState(workerId: string): CircuitBreakerState | undefined {
    return this.circuitBreakers.get(workerId);
  }

  resetCircuit(workerId: string): void {
    this.circuitBreakers.delete(workerId);
  }

  private generateCorrelationId(): string {
    return `rpc:${Date.now()}:${Math.random().toString(36).substring(2, 11)}`;
  }
}