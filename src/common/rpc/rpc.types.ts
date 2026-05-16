export interface RpcOptions {
  timeout?: number;
  retries?: number;
  correlationId?: string;
}

export interface RpcResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface CircuitBreakerState {
  state: 'closed' | 'open' | 'half-open';
  failures: number;
  lastFailureTime: number;
  lastSuccessTime: number;
}

export const CB_CONFIG = {
  FAILURE_THRESHOLD: 5,
  SUCCESS_THRESHOLD: 2,
  OPEN_TIMEOUT_MS: 30000,
  HALF_OPEN_TIMEOUT_MS: 10000,
} as const;

export interface RpcMessage {
  correlationId: string;
  action: string;
  payload: unknown;
  timestamp: number;
  replyChannel: string;
}

export interface RpcResponse {
  correlationId: string;
  success: boolean;
  data?: unknown;
  error?: string;
}
