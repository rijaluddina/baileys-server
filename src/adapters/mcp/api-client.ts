/**
 * MCP API Client — HTTP proxy to REST API
 *
 * All MCP tool calls are forwarded to the REST API via this client.
 * This ensures MCP and REST share the same Core/Baileys session.
 */

import { logger } from "@infrastructure/logger";

const log = logger.child({ component: "mcp-api-client" });

export interface ApiResult<T = unknown> {
    success: boolean;
    data?: T;
    error?: {
        code: string;
        message: string;
        details?: unknown;
    };
}

export interface McpToolResult {
    [x: string]: unknown;
    content: Array<{ type: "text"; text: string }>;
    isError?: boolean;
}

export class McpApiClient {
    private baseUrl: string;
    private apiKey: string;
    private timeoutMs: number;

    constructor(options?: { baseUrl?: string; apiKey?: string; timeoutMs?: number }) {
        this.baseUrl = options?.baseUrl
            ?? process.env.MCP_API_BASE_URL
            ?? "http://localhost:3000";
        this.apiKey = options?.apiKey
            ?? process.env.MCP_API_KEY
            ?? "";
        this.timeoutMs = options?.timeoutMs ?? 30000;

        // Remove trailing slash
        if (this.baseUrl.endsWith("/")) {
            this.baseUrl = this.baseUrl.slice(0, -1);
        }

        log.info({ baseUrl: this.baseUrl, hasApiKey: !!this.apiKey }, "MCP API client initialized");
    }

    /**
     * Build headers for every request
     */
    private headers(): Record<string, string> {
        const h: Record<string, string> = {
            "Content-Type": "application/json",
            "Accept": "application/json",
        };
        if (this.apiKey) {
            h["X-API-Key"] = this.apiKey;
        }
        return h;
    }

    /**
     * Execute HTTP request and return parsed API response
     */
    private async request<T = unknown>(
        method: string,
        path: string,
        body?: unknown
    ): Promise<ApiResult<T>> {
        const url = `${this.baseUrl}${path}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

        try {
            const fetchOptions: RequestInit = {
                method,
                headers: this.headers(),
                signal: controller.signal,
            };

            if (body && (method === "POST" || method === "PUT" || method === "PATCH")) {
                fetchOptions.body = JSON.stringify(body);
            }

            log.debug({ method, path }, "MCP proxy request");

            const response = await fetch(url, fetchOptions);
            const json = await response.json() as ApiResult<T>;

            if (!response.ok) {
                log.warn(
                    { method, path, status: response.status, error: json.error },
                    "REST API returned error"
                );
            }

            return json;
        } catch (err: any) {
            if (err.name === "AbortError") {
                log.error({ method, path }, "Request timed out");
                return {
                    success: false,
                    error: { code: "TIMEOUT", message: `Request timed out after ${this.timeoutMs}ms` },
                };
            }
            log.error({ method, path, err: err.message }, "Request failed");
            return {
                success: false,
                error: { code: "CONNECTION_ERROR", message: `Failed to connect to REST API: ${err.message}` },
            };
        } finally {
            clearTimeout(timeout);
        }
    }

    // ── Convenience methods ─────────────────────────────────────────────

    async get<T = unknown>(path: string): Promise<ApiResult<T>> {
        return this.request<T>("GET", path);
    }

    async post<T = unknown>(path: string, body: unknown): Promise<ApiResult<T>> {
        return this.request<T>("POST", path, body);
    }

    async put<T = unknown>(path: string, body: unknown): Promise<ApiResult<T>> {
        return this.request<T>("PUT", path, body);
    }

    async del<T = unknown>(path: string): Promise<ApiResult<T>> {
        return this.request<T>("DELETE", path);
    }

    // ── MCP result helpers ──────────────────────────────────────────────

    /**
     * Translate technical error codes to natural-language messages for LLM agents.
     * Architecture ref: Skenario 2, Step 6 — "MCP menerjemahkan error teknis ke bahasa natural"
     */
    private translateErrorForLLM(error: ApiResult["error"]): string {
        const code = error?.code ?? "";
        const translations: Record<string, string> = {
            WHATSAPP_DISCONNECTED: "Failed to send. The WhatsApp connection is currently down. Please inform the user to try again later.",
            CIRCUIT_BREAKER_OPEN: "WhatsApp service is temporarily unavailable. The system detected an outage — please try again in a few minutes.",
            RATE_LIMITED: "Rate limit reached. Please wait a moment before trying again.",
            RATE_LIMIT_EXCEEDED: "Rate limit reached. Please wait a moment before trying again.",
            SESSION_NOT_FOUND: "WhatsApp session not found. Make sure the session has been created and is active.",
            SESSION_NOT_CONNECTED: "WhatsApp session is not connected yet. Ask the user to scan the QR code first.",
            CORE_SESSION_DOWN: "WhatsApp session is currently unavailable. Please try again shortly.",
            CORE_NOT_CONNECTED: "WhatsApp session is not connected. The user needs to scan the QR code.",
            VALIDATION_ERROR: `Invalid request: ${error?.message ?? "check your parameters and try again."}`,
            TIMEOUT: "The request timed out. The WhatsApp server may be slow — please try again.",
            CONNECTION_ERROR: "Could not reach the WhatsApp server. Please check the service status and try again.",
        };

        return translations[code]
            ?? `An error occurred: ${error?.message ?? "Unknown error"}. Please try again or contact support.`;
    }

    /**
     * Convert API response to MCP tool result format.
     * Success: returns raw JSON data.
     * Error: returns LLM-friendly natural-language description.
     */
    toToolResult(apiResult: ApiResult): McpToolResult {
        if (apiResult.success) {
            return {
                content: [{ type: "text", text: JSON.stringify(apiResult.data) }],
            };
        }

        return {
            content: [{
                type: "text",
                text: this.translateErrorForLLM(apiResult.error),
            }],
            isError: true,
        };
    }

    /**
     * Shortcut: call REST and return MCP result directly
     */
    async proxyGet(path: string): Promise<McpToolResult> {
        const result = await this.get(path);
        return this.toToolResult(result);
    }

    async proxyPost(path: string, body: unknown): Promise<McpToolResult> {
        const result = await this.post(path, body);
        return this.toToolResult(result);
    }

    async proxyPut(path: string, body: unknown): Promise<McpToolResult> {
        const result = await this.put(path, body);
        return this.toToolResult(result);
    }

    async proxyDelete(path: string): Promise<McpToolResult> {
        const result = await this.del(path);
        return this.toToolResult(result);
    }
}
