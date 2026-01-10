/**
 * Circuit Breaker Pattern
 * 
 * CRITICAL: Circuit breaker MUST NOT change semantic Core capability.
 * - MCP tool remains DENIED if breaker open
 * - REST returns "service unavailable" (not silent fail)
 * - Breaker state changes logged at WARN level
 */

import { logger } from "@infrastructure/logger";
import { Errors } from "@infrastructure/errors";

const log = logger.child({ component: "circuit-breaker" });

export enum CircuitState {
    CLOSED = "CLOSED",     // Normal operation
    OPEN = "OPEN",         // Failing, reject requests
    HALF_OPEN = "HALF_OPEN" // Testing recovery
}

export interface CircuitBreakerOptions {
    name: string;
    failureThreshold: number;    // Failures before opening
    resetTimeout: number;        // Ms before trying half-open
    halfOpenRequests: number;    // Requests to test in half-open
}

export class CircuitBreaker {
    private state: CircuitState = CircuitState.CLOSED;
    private failures: number = 0;
    private successes: number = 0;
    private lastFailureTime: number = 0;
    private readonly options: CircuitBreakerOptions;

    constructor(options: CircuitBreakerOptions) {
        this.options = options;
    }

    /**
     * Execute function with circuit breaker protection
     */
    async execute<T>(fn: () => Promise<T>): Promise<T> {
        // Check if we should transition from OPEN to HALF_OPEN
        if (this.state === CircuitState.OPEN) {
            if (Date.now() - this.lastFailureTime >= this.options.resetTimeout) {
                this.transitionTo(CircuitState.HALF_OPEN);
            } else {
                throw Errors.circuitOpen(this.options.name);
            }
        }

        try {
            const result = await fn();
            this.onSuccess();
            return result;
        } catch (error) {
            this.onFailure();
            throw error;
        }
    }

    private onSuccess(): void {
        if (this.state === CircuitState.HALF_OPEN) {
            this.successes++;
            if (this.successes >= this.options.halfOpenRequests) {
                this.transitionTo(CircuitState.CLOSED);
            }
        } else {
            this.failures = 0;
        }
    }

    private onFailure(): void {
        this.failures++;
        this.lastFailureTime = Date.now();

        if (this.state === CircuitState.HALF_OPEN) {
            this.transitionTo(CircuitState.OPEN);
        } else if (this.failures >= this.options.failureThreshold) {
            this.transitionTo(CircuitState.OPEN);
        }
    }

    private transitionTo(newState: CircuitState): void {
        const oldState = this.state;
        this.state = newState;

        if (newState === CircuitState.CLOSED) {
            this.failures = 0;
            this.successes = 0;
        } else if (newState === CircuitState.HALF_OPEN) {
            this.successes = 0;
        }

        // Observable via log (WARN level)
        log.warn(
            { breaker: this.options.name, from: oldState, to: newState },
            "Circuit breaker state change"
        );
    }

    /**
     * Get current state (for monitoring)
     */
    getState(): CircuitState {
        return this.state;
    }

    /**
     * Get stats (for monitoring)
     */
    getStats() {
        return {
            name: this.options.name,
            state: this.state,
            failures: this.failures,
            successes: this.successes,
        };
    }

    /**
     * Force reset (for testing/admin)
     */
    reset(): void {
        this.transitionTo(CircuitState.CLOSED);
    }
}

// Pre-configured breakers for common services
export const breakers = {
    database: new CircuitBreaker({
        name: "database",
        failureThreshold: 5,
        resetTimeout: 30000,
        halfOpenRequests: 3,
    }),

    redis: new CircuitBreaker({
        name: "redis",
        failureThreshold: 3,
        resetTimeout: 10000,
        halfOpenRequests: 2,
    }),

    whatsapp: new CircuitBreaker({
        name: "whatsapp",
        failureThreshold: 5,
        resetTimeout: 60000,
        halfOpenRequests: 1,
    }),
};
