# Testing Strategy - WhatsApp Server

## Architecture Context

```
┌─────────────────────────────────────────────────────────────┐
│                    UNTRUSTED ZONE                           │
│  ┌─────────────┐              ┌─────────────────────────┐   │
│  │ REST Client │              │ MCP Client (Agent/Test) │   │
│  └──────┬──────┘              └───────────┬─────────────┘   │
└─────────┼─────────────────────────────────┼─────────────────┘
          │                                 │
┌─────────┼─────────────────────────────────┼─────────────────┐
│         ▼                                 ▼                 │
│  ┌─────────────┐              ┌─────────────────────────┐   │
│  │ REST Adapter│              │ MCP Adapter (ALLOWLIST) │   │
│  └──────┬──────┘              └───────────┬─────────────┘   │
│         │                                 │                 │
│         └─────────────┬───────────────────┘                 │
│                       ▼                                     │
│              ┌─────────────────┐                            │
│              │  Core Services  │ ← Single Source of Truth   │
│              └────────┬────────┘                            │
│                       ▼                                     │
│              ┌─────────────────┐                            │
│              │     Baileys     │                            │
│              └─────────────────┘                            │
│                    TRUSTED ZONE                             │
└─────────────────────────────────────────────────────────────┘
```

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

### 5. Negative Tests
**Purpose**: Verify forbidden actions fail safely
**Scope**: Non-allowlisted MCP calls, invalid params, rate limits

---

## MCP Allowlist (Current)

| Tool | Allowed | Purpose |
|------|---------|---------|
| send_text_message | ✅ | Send text |
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
│   ├── baileys.mock.ts   # Mock Baileys socket
│   └── database.mock.ts  # Mock DB
├── core/
│   ├── session.test.ts
│   ├── messaging.test.ts
│   └── auth-state.test.ts
├── mcp/
│   ├── security.test.ts  # Capability denial
│   ├── sanitization.test.ts
│   └── error-containment.test.ts
├── rest/
│   ├── auth.test.ts
│   └── validation.test.ts
├── parity/
│   └── rest-mcp.test.ts
└── negative/
    ├── forbidden-tools.test.ts
    └── invalid-params.test.ts
```

---

## Definition of Done

### MUST PASS (Blocking)
- [ ] MCP rejects non-allowlisted tool calls
- [ ] MCP sanitizes all inputs
- [ ] Core errors don't leak raw details via MCP
- [ ] REST-MCP parity for all shared capabilities
- [ ] Rate limiting works on both adapters

### SHOULD PASS (Non-blocking)
- [ ] Core unit tests cover public API
- [ ] Edge cases handled gracefully

### MUST NOT (Immediate Stop)
- [ ] MCP exposes raw Baileys access
- [ ] Core errors leak stack traces to clients
- [ ] Forbidden capabilities accessible via any path
