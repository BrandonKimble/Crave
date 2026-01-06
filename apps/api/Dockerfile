# =============================================================================
# Multi-Stage Dockerfile for Crave API (NestJS)
# =============================================================================
# This Dockerfile creates a production-optimized image in 3 stages:
#   1. Base: Install dependencies and prepare Prisma
#   2. Builder: Build the TypeScript application
#   3. Production: Final lightweight runtime image
# =============================================================================

# =============================================================================
# STAGE 1: Base - Install dependencies
# =============================================================================
FROM node:18-alpine AS base

# Install system dependencies needed for Prisma and native modules
RUN apk add --no-cache \
    openssl \
    libc6-compat \
    python3 \
    make \
    g++

# Enable Corepack for Yarn
RUN corepack enable && corepack prepare yarn@1.22.22 --activate

WORKDIR /app

# Copy package files for dependency installation
# We copy the entire workspace to respect workspace dependencies
COPY package.json yarn.lock ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/

# Install ALL dependencies (including dev dependencies for build)
RUN yarn install --frozen-lockfile

# Copy Prisma schema and generate client
COPY apps/api/prisma ./apps/api/prisma
RUN cd apps/api && yarn prisma generate

# =============================================================================
# STAGE 2: Builder - Build TypeScript application
# =============================================================================
FROM base AS builder

WORKDIR /app

# Copy source code
COPY apps/api ./apps/api
COPY packages/shared ./packages/shared
COPY tsconfig.json ./
COPY turbo.json ./

# Build the API
RUN yarn workspace api build

# =============================================================================
# STAGE 3: Production - Final runtime image
# =============================================================================
FROM node:18-alpine AS production

# Install runtime system dependencies (OpenSSL for Prisma)
RUN apk add --no-cache openssl libc6-compat

# Enable Corepack for Yarn
RUN corepack enable && corepack prepare yarn@1.22.22 --activate

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001

WORKDIR /app

# Copy package files
COPY --chown=nestjs:nodejs package.json yarn.lock ./
COPY --chown=nestjs:nodejs apps/api/package.json ./apps/api/
COPY --chown=nestjs:nodejs packages/shared/package.json ./packages/shared/

# Install ONLY production dependencies
ENV NODE_ENV=production
RUN yarn install --frozen-lockfile --production && yarn cache clean

# Copy built application from builder
COPY --chown=nestjs:nodejs --from=builder /app/apps/api/dist ./apps/api/dist
COPY --chown=nestjs:nodejs --from=builder /app/packages/shared/dist ./packages/shared/dist

# Copy Prisma files (needed for runtime)
COPY --chown=nestjs:nodejs --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --chown=nestjs:nodejs --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Switch to non-root user
USER nestjs

# Expose port (Railway uses PORT env var, default to 3000)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the application
# Railway will inject DATABASE_URL and other env vars at runtime
CMD ["node", "apps/api/dist/main.js"]
