# Testing Strategy - WhatsApp Server

## Architecture Context

```
┌─────────────────────────────────────────────────────────────┐
│                    UNTRUSTED ZONE                           │
│  ┌─────────────┐              ┌─────────────────────────┐   │
│  │ REST Client │              │ MCP Client (Agent/Test) │   │
│  └──────┬──────┘              └───────────┬─────────────┘   │
└─────────┼─────────────────────────────────┼─────────────────┘
          │                                 │ stdio
┌─────────┼─────────────────────────────────┼─────────────────┐
│         │                    ┌─────────────▼─────────────┐   │
│         │                    │ MCP Adapter (Proxy)       │   │
│         │                    │ Rate Limiter → fetch()    │   │
│         │                    └─────────────┬─────────────┘   │
│         │                                  │ HTTP             │
│         └──────────────┬───────────────────┘                 │
│                        ▼                                     │
│  ┌─────────────────────────────────────┐                    │
│  │  REST API (Auth + Rate Limit)       │                    │
│  └───────────────┬─────────────────────┘                    │
│                  ▼                                          │
│         ┌─────────────────┐                                 │
│         │  Core Services  │ ← Single Source of Truth        │
│         └────────┬────────┘                                 │
│                  ▼                                          │
│         ┌─────────────────┐                                 │
│         │     Baileys     │                                 │
│         └─────────────────┘                                 │
│                    TRUSTED ZONE                             │
└─────────────────────────────────────────────────────────────┘
```

> **Key Change**: MCP no longer imports Core directly. It proxies to REST via HTTP.

## Test Categories

### 1. Core Unit Tests
**Purpose**: Verify Core services work correctly (public API only)
**Scope**: Session, Messaging, Contacts, Auth State
**NO**: Low-level Baileys internals

### 2. MCP Security Tests
**Purpose**: Verify MCP is secure against hostile/hallucinating agents
**Scope**:
- Capability denial (tools not in allowlist MUST fail)
- Parameter sanitization (malformed inputs rejected)
- Error containment (Core errors → safe MCP errors)

### 3. REST Adapter Tests
**Purpose**: Verify REST API security
**Scope**: Auth, validation, rate limiting

### 4. REST-MCP Parity Tests
**Purpose**: Same Core capability → identical effects via both adapters
**Scope**: send_message, get_contacts, etc.

### 5. MCP Proxy Tests ✨ (New)
**Purpose**: Verify MCP correctly proxies to REST API
**Scope**:
- Tool → REST endpoint mapping (all 10 tools)
- API Key header always sent
- REST errors (401/403/404/429) → MCP error format
- MCP-side rate limiter (allow, block, reset, guard)
- No internal detail leaks in error translation

### 6. Negative Tests
**Purpose**: Verify forbidden actions fail safely
**Scope**: Non-allowlisted MCP calls, invalid params, rate limits

---

## MCP Allowlist (Current)

| Tool | Allowed | Purpose |
|------|---------|---------|
| send_text_message | ✅ | Send text |
| send_image | ✅ | Send image (URL or base64) |
| reply_message | ✅ | Reply to message |
| get_contact_profile | ✅ | Read contact |
| get_group_metadata | ✅ | Read group |
| set_typing | ✅ | Presence |
| get_conversation_state | ✅ | Read state |
| update_conversation_state | ✅ | Write state |
| add_to_history | ✅ | Append history |
| clear_conversation_state | ✅ | Clear state |

**DENIED BY DEFAULT**: Everything else (delete session, raw socket, etc.)

---

## Test Structure

```
tests/
├── setup.ts              # Test config, mocks
├── mocks/
│   └── baileys.mock.ts   # Mock Baileys socket
├── utils/
│   └── mcp-test-client.ts # Allowlist/Denylist + test invoker
├── mcp/
│   ├── security.test.ts      # Capability denial
│   ├── sanitization.test.ts  # Input validation
│   └── proxy.test.ts         # ✨ Proxy behavior + rate limiter
├── parity/
│   ├── rest-mcp.test.ts
│   └── agent-abuse.test.ts
└── negative/
    ├── forbidden-tools.test.ts
    └── invalid-params.test.ts
```

---

## Definition of Done

### MUST PASS (Blocking)
- [x] MCP rejects non-allowlisted tool calls
- [x] MCP sanitizes all inputs
- [x] Core errors don't leak raw details via MCP
- [x] REST-MCP parity for all shared capabilities
- [x] Rate limiting works on both adapters
- [x] MCP proxies all tools to correct REST endpoints
- [x] MCP rate limiter blocks excessive agent calls
- [x] REST error codes correctly translated to MCP format

### SHOULD PASS (Non-blocking)
- [ ] Core unit tests cover public API
- [ ] Edge cases handled gracefully

### MUST NOT (Immediate Stop)
- [x] MCP exposes raw Baileys access → ✅ Verified denied
- [x] Core errors leak stack traces to clients → ✅ Verified contained
- [x] Forbidden capabilities accessible via any path → ✅ Verified blocked

## Test Results

```
81 pass, 0 fail
486 expect() calls
Ran 81 tests across 7 files
```

| Suite | Tests | Status |
|-------|-------|--------|
| REST-MCP Parity | 5 | ✅ |
| Agent Abuse Patterns | 8 | ✅ |
| MCP Security | 8 | ✅ |
| MCP Sanitization | 10 | ✅ |
| MCP Proxy | 26 | ✅ |
| Forbidden Tools | 10 | ✅ |
| Invalid Parameters | 13 | ✅ |
