# Railway Deployment Guide

## Prerequisites

1. [Railway Account](https://railway.app)
2. Railway CLI: `npm i -g @railway/cli`

## Deploy Steps

```bash
# 1. Login to Railway
railway login

# 2. Initialize project
railway init

# 3. Add PostgreSQL
railway add --database postgres

# 4. Add Redis
railway add --database redis

# 5. Set environment variables
railway variables set NODE_ENV=production
railway variables set AUTO_CONNECT_SESSIONS=false

# 6. Deploy
railway up
```

## Environment Variables

Railway auto-injects:
- `DATABASE_URL` (from PostgreSQL plugin)
- `REDIS_URL` (from Redis plugin)

Manual setup:
- `NODE_ENV=production`
- `PORT` (auto-set by Railway)

## Post-Deploy

1. Get your app URL from Railway dashboard
2. Test: `curl https://your-app.railway.app/health`
3. Create session via API

## Costs

- Hobby Plan: $5/month
- Includes PostgreSQL & Redis
