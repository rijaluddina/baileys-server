# Baileys Server — WhatsApp REST API

Comprehensive REST API for WhatsApp built with [NestJS](https://nestjs.com/) and [Baileys](https://github.com/WhiskeySockets/Baileys) (`@whiskeysockets/baileys` v7).

## Features

| Category | Capabilities |
|----------|-------------|
| 📱 **Session** | Multi-session, QR code, pairing code, auto-reconnect (exponential backoff) |
| 💬 **Messaging** | Text, image, video, audio, document, sticker, contact card, location, poll, buttons, list, reaction, edit, delete, forward, star, link preview |
| 📡 **Status/Stories** | Post text/image/video status to contacts |
| 👥 **Group** | Create, modify subject/description/settings, add/remove/promote/demote participants, invite codes, join/leave |
| 📋 **Chat** | Archive, pin, mute, mark read/unread, delete, fetch messages |
| 📇 **Contact** | Check number existence, profile picture, business profile, block/unblock, update own profile |
| 🟢 **Presence** | Composing, recording, available, unavailable, subscribe to presence |
| 🏷️ **Labels** | Assign/remove labels from chats and messages |
| 🔒 **Privacy** | Last seen, online, profile picture, status, read receipts, groups |
| 📢 **Newsletter** | Create, follow/unfollow, mute/unmute, update name/description, delete, react, fetch messages |
| 🔔 **Webhook** | HTTP webhook delivery with HMAC-SHA256 signing |
| 🔌 **WebSocket** | Real-time events via Socket.IO (QR codes, messages, presence, etc.) |
| 📚 **Swagger** | Full interactive API documentation at `/docs` |

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Migrate database
npx prisma migrate dev --name init

# Generate Prisma Client
npx prisma generate

# Start development server
npm run start:dev
```

The server starts at `http://localhost:3000`:
- 📚 Swagger docs: `http://localhost:3000/docs`
- 🔌 WebSocket: `ws://localhost:3000/ws`

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `API_KEY` | *(empty)* | API key for authentication (empty = open access) |
| `WEBHOOK_URL` | *(empty)* | Default webhook URL for all sessions |
| `WEBHOOK_SECRET` | *(empty)* | HMAC secret for webhook signature verification |
| `DATABASE_URL` | *(empty)* | Database URL |
| `REDIS_HOST` | `localhost` | Redis host |
| `REDIS_PORT` | `6379` | Redis port |
| `REDIS_PASSWORD` | *(empty)* | Redis password |
| `LOG_LEVEL` | `info` | Logging level |

## API Endpoints

### Session Management
```
POST   /api/sessions                   # Create session (QR or pairing code)
GET    /api/sessions                   # List all sessions
GET    /api/sessions/:id               # Get session status
DELETE /api/sessions/:id               # Delete session
POST   /api/sessions/:id/logout        # Logout from WhatsApp
```

### Messaging
```
POST   /api/:sessionId/messages/text          # Send text
POST   /api/:sessionId/messages/media         # Send media (image/video/audio/doc/sticker)
POST   /api/:sessionId/messages/contact       # Send contact card
POST   /api/:sessionId/messages/location      # Send location
POST   /api/:sessionId/messages/poll          # Send poll
POST   /api/:sessionId/messages/buttons       # Send buttons
POST   /api/:sessionId/messages/list          # Send list message
POST   /api/:sessionId/messages/reaction      # Send reaction emoji
POST   /api/:sessionId/messages/edit          # Edit message
POST   /api/:sessionId/messages/delete        # Delete message
POST   /api/:sessionId/messages/forward       # Forward message
POST   /api/:sessionId/messages/read          # Mark messages as read
POST   /api/:sessionId/messages/star          # Star/unstar messages
POST   /api/:sessionId/messages/status        # Post status/story
POST   /api/:sessionId/messages/link-preview  # Send link with preview
```

### Group Management
```
POST   /api/:sessionId/groups                           # Create group
GET    /api/:sessionId/groups                           # Get all groups
GET    /api/:sessionId/groups/:groupId                  # Get group metadata
GET    /api/:sessionId/groups/:groupId/invite-code      # Get invite code
POST   /api/:sessionId/groups/:groupId/revoke-invite    # Revoke invite
PUT    /api/:sessionId/groups/:groupId/subject          # Update subject
PUT    /api/:sessionId/groups/:groupId/description      # Update description
PUT    /api/:sessionId/groups/:groupId/settings         # Update settings
POST   /api/:sessionId/groups/:groupId/participants     # Add/remove/promote/demote
DELETE /api/:sessionId/groups/:groupId/leave            # Leave group
POST   /api/:sessionId/groups/join                      # Join via invite code
PUT    /api/:sessionId/groups/:groupId/picture          # Update picture
```

### Chat Operations
```
GET    /api/:sessionId/chats                    # Get chats info
POST   /api/:sessionId/chats/archive            # Archive/unarchive
POST   /api/:sessionId/chats/pin                # Pin/unpin
POST   /api/:sessionId/chats/mute               # Mute/unmute
POST   /api/:sessionId/chats/mark-read          # Mark read/unread
POST   /api/:sessionId/chats/delete             # Delete chat
GET    /api/:sessionId/chats/:jid/messages      # Fetch messages
```

### Contact Management
```
GET    /api/:sessionId/contacts                         # Get contacts
POST   /api/:sessionId/contacts/check                   # Check numbers exist
GET    /api/:sessionId/contacts/:jid/profile-picture     # Get profile picture
GET    /api/:sessionId/contacts/:jid/business-profile    # Get business profile
POST   /api/:sessionId/contacts/profile/business-profile # Update own business profile
GET    /api/:sessionId/contacts/:jid/status              # Get about/status
POST   /api/:sessionId/contacts/:jid/block               # Block contact
POST   /api/:sessionId/contacts/:jid/unblock             # Unblock contact
POST   /api/:sessionId/contacts/profile/picture          # Update own picture
POST   /api/:sessionId/contacts/profile/name             # Update own name
POST   /api/:sessionId/contacts/profile/status           # Update own about
```

### Presence, Labels, Privacy, Newsletters
```
POST   /api/:sessionId/presence                 # Set presence
POST   /api/:sessionId/presence/subscribe       # Subscribe to presence
GET    /api/:sessionId/labels                   # Get labels
POST   /api/:sessionId/labels/chat/...          # Add/remove chat labels
POST   /api/:sessionId/labels/message/...       # Add/remove message labels
GET    /api/:sessionId/privacy                  # Get privacy settings
POST   /api/:sessionId/privacy/last-seen        # Update last-seen privacy
POST   /api/:sessionId/privacy/online           # Update online privacy
POST   /api/:sessionId/privacy/profile-picture  # Update profile picture privacy
POST   /api/:sessionId/privacy/read-receipts    # Update read receipts privacy
POST   /api/:sessionId/privacy/groups           # Update groups privacy
POST   /api/:sessionId/newsletters              # Create newsletter
GET    /api/:sessionId/newsletters/:jid         # Get newsletter info
POST   /api/:sessionId/newsletters/follow       # Follow newsletter
POST   /api/:sessionId/newsletters/unfollow     # Unfollow newsletter
DELETE /api/:sessionId/newsletters/:jid         # Delete newsletter
GET    /api/:sessionId/blocklist                # Get blocklist
GET    /api/:sessionId/device                   # Get device info
```

## Usage Examples

### Create a Session (QR Code)
```bash
curl -X POST http://localhost:3000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "my-session"}'
```

### Create a Session (Pairing Code)
```bash
curl -X POST http://localhost:3000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "my-session", "pairingCode": true, "phoneNumber": "6281234567890"}'
```

### Send a Text Message
```bash
curl -X POST http://localhost:3000/api/my-session/messages/text \
  -H "Content-Type: application/json" \
  -d '{"to": "6281234567890", "text": "Hello from Baileys API!"}'
```

### Send an Image
```bash
curl -X POST http://localhost:3000/api/my-session/messages/media \
  -H "Content-Type: application/json" \
  -d '{"to": "6281234567890", "type": "image", "media": "https://example.com/image.jpg", "caption": "Check this out!"}'
```

### Send a Poll
```bash
curl -X POST http://localhost:3000/api/my-session/messages/poll \
  -H "Content-Type: application/json" \
  -d '{"to": "6281234567890", "name": "Favorite color?", "options": [{"name": "Red"}, {"name": "Blue"}, {"name": "Green"}], "selectableCount": 1}'
```

### Check if Numbers Exist on WhatsApp
```bash
curl -X POST http://localhost:3000/api/my-session/contacts/check \
  -H "Content-Type: application/json" \
  -d '{"numbers": ["6281234567890", "6289876543210"]}'
```

## WebSocket Events

Connect to `ws://localhost:3000/ws` using Socket.IO to receive real-time events:

| Event | Description |
|-------|-------------|
| `qr` | QR code generated (base64 data URL) |
| `pairing-code` | Pairing code generated |
| `connected` | Session connected successfully |
| `logged-out` | Session logged out |
| `baileys-event` | All Baileys events (messages, presence, etc.) |

## Webhook Payload

```json
{
  "sessionId": "my-session",
  "event": "messages.upsert",
  "data": { ... },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

If `WEBHOOK_SECRET` is set, each request includes an `x-webhook-signature` header with HMAC-SHA256 signature.

## Project Structure

```
src/
├── main.ts                    # Bootstrap + Swagger
├── app.module.ts              # Root module
├── common/
│   ├── guards/                # API key authentication
│   ├── interceptors/          # Response transform
│   ├── filters/               # Exception handling
│   └── decorators/            # Public route decorator
├── session/                   # Session management (core)
├── messaging/                 # All message types
├── group/                     # Group management
├── chat/                      # Chat operations
├── contact/                   # Contact management
├── misc/                      # Presence, labels, privacy, newsletters
└── webhook/                   # Webhook delivery
```

## Tech Stack

- **Runtime**: Nodejs 22
- **Framework**: NestJS 11
- **WhatsApp**: @whiskeysockets/baileys v7
- **Database**: PostgreSQL + Prisma ORM
- **Redis**: Redis for caching
- **Docs**: Swagger/OpenAPI
- **WebSocket**: Socket.IO
- **Validation**: class-validator + class-transformer
- **Package Manager**: npm

## License

[MIT](LICENSE)
