Phase 1: Production Hardening mostly done.
- [x] FIX 3: Auth error handling.
- [x] FIX 2: History sync + dedup.
- [x] **FIX 4: Webhook DLQ + replay.**

Phase 2: UX & Scale
- [x] **FIX 1: SSE endpoint for QR.**
- [x] **FIX 5: Reconnect stagger + jitter.**

Me plan:
1. Update `QueueService` for webhook backoff (0→1s→3s→10s).
2. Register custom backoff in `QueueModule`.
3. Create `WebhookController` + `WebhookModule` for DLQ visibility & replay.
