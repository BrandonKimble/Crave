# =============================================================================
# apps/site — craveapp.ai
# =============================================================================
# BUILD CONTEXT IS THE REPO ROOT (the burned-in law: a subdir context breaks
# the build). Paths below are therefore repo-relative.
#
# The workspace has ZERO dependencies, so there is no `yarn install` here at
# all — only the root's typescript, which we get from the repo's own
# node_modules via a one-package install. That keeps the image tiny and the
# build fast.
# =============================================================================

FROM node:22-alpine AS builder
WORKDIR /app

# tsc only. Nothing in this app has a runtime dependency.
RUN npm install -g typescript@5

COPY apps/site/package.json ./apps/site/
COPY apps/site/tsconfig.json ./apps/site/
COPY apps/site/src ./apps/site/src
COPY apps/site/test ./apps/site/test

WORKDIR /app/apps/site
RUN tsc -p tsconfig.json \
 && mkdir -p dist/src/pages \
 && cp src/pages/*.html dist/src/pages/

# The route table is cheap to prove and the pages are the product. Run the
# suite IN the image so a broken page cannot be deployed.
RUN node --test "dist/test/*.test.js"

# =============================================================================
FROM node:22-alpine AS production
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

COPY --from=builder /app/apps/site/dist/src ./dist/src
COPY --from=builder /app/apps/site/package.json ./package.json

USER node
EXPOSE 8080

# NEVER set a `startCommand` in railway.json for this service: Railway execs
# it WITHOUT a shell, so an `&&` becomes argv and the container exits 0 after
# the first word. This CMD is the only start command.
CMD ["node", "dist/src/server.js"]
