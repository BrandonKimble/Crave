# Railway Deployment Guide - Quick Reference

## 🚀 Deployment Workflow (Option B - Manual Migrations)

Every time you deploy changes that include database migrations:

```bash
# 1. Run migrations in production (before deploying code)
railway run yarn workspace api db:migrate:deploy

# 2. Deploy your code
git push origin main
# Railway auto-deploys after push

# 3. Verify deployment
railway logs
curl https://your-app.up.railway.app/health
```

## 📦 First-Time Setup

### Install Railway CLI
```bash
# macOS/Linux
brew install railway

# or npm (all platforms)
npm i -g @railway/cli
```

### Link to Your Project
```bash
# Login to Railway
railway login

# Link to your Railway project (run this in project root)
railway link

# Verify connection
railway status
```

## 🗄️ Migration Commands

### Production Migrations (via Railway CLI)
```bash
# Run pending migrations in production database
railway run yarn workspace api db:migrate:deploy

# Open Prisma Studio connected to production database (be careful!)
railway run yarn workspace api prisma:studio
```

### Local Development Migrations
```bash
# Create a new migration
yarn workspace api db:migrate:create

# Apply migrations to local database
yarn workspace api db:migrate

# Generate Prisma client
yarn workspace api prisma:generate
```

## 🔍 Debugging Production

### View Logs
```bash
# Tail logs in real-time
railway logs --tail

# Filter by service
railway logs --service api

# Last 100 lines
railway logs --lines 100
```

### Run One-Off Commands
```bash
# Access production database via psql
railway run psql

# Check database schema
railway run yarn workspace api prisma:studio

# Run a custom script
railway run node scripts/your-script.js
```

### Environment Variables
```bash
# View all environment variables
railway variables

# Set a variable
railway variables set KEY=value

# Remove a variable
railway variables delete KEY
```

## ⚠️ Important Reminders

### Before Each Deploy
- [ ] Test locally: `yarn workspace api test`
- [ ] Run linting: `yarn workspace api lint`
- [ ] Check migrations: `yarn workspace api prisma:migrate status`
- [ ] If migrations exist: Run `railway run yarn workspace api db:migrate:deploy` FIRST

### Migration Safety
- ✅ **DO**: Run migrations before deploying code
- ✅ **DO**: Test migrations locally first
- ✅ **DO**: Keep migration files in version control
- ❌ **DON'T**: Auto-run migrations on app startup (dangerous)
- ❌ **DON'T**: Delete migration files after they're applied

## 🎯 Quick Commands Reference

| Task | Command |
|------|---------|
| Deploy code | `git push origin main` |
| Run migrations | `railway run yarn workspace api db:migrate:deploy` |
| View logs | `railway logs --tail` |
| Check status | `railway status` |
| Open dashboard | `railway open` |
| Restart service | `railway restart` |
| Shell access | `railway shell` |
| List projects | `railway list` |

## 🚨 Rollback Strategy

If deployment fails:

```bash
# 1. Check what went wrong
railway logs --tail

# 2. Rollback code (revert git commit)
git revert HEAD
git push origin main

# 3. Rollback migrations (if needed)
railway run yarn workspace api prisma:migrate resolve --rolled-back MIGRATION_NAME
```

## 📊 Monitoring Production

### Check Health
```bash
curl https://your-app.up.railway.app/health
```

Expected response:
```json
{
  "status": "healthy",
  "checks": {
    "database": "healthy",
    "redis": "healthy"
  },
  "uptime": 12345.67,
  "version": "1.0.0"
}
```

### Check Sentry Dashboard
- New errors should appear within 10 seconds
- Alerts configured to Discord
- Performance metrics tracked

## 🔐 Security Checklist

Before going to production:
- [ ] Remove `DebugModule` from `app.module.ts`
- [ ] Set `SENTRY_TRACES_SAMPLE_RATE=0.1` (not 1.0)
- [ ] Set `SENTRY_PROFILES_SAMPLE_RATE=0.1` (not 1.0)
- [ ] Use stricter rate limits in production
- [ ] All API keys set in Railway environment variables
- [ ] `NODE_ENV=production` in Railway
- [ ] Database backups enabled (Railway auto-backups)

## 📝 Notes

- Railway auto-deploys on push to `main` branch
- Health checks run every 30 seconds via `/health` endpoint
- Graceful shutdown enabled (no dropped requests during deploys)
- Container runs as non-root user for security
- Multi-stage Docker build keeps image size small (~150MB)
