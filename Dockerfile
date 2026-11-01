# syntax=docker/dockerfile:1

FROM node:24-slim AS builder

# Bun installs packages; the build and the server still run on Node.
COPY --from=oven/bun:1.4.4-slim /usr/local/bin/bun /usr/local/bin/bun

WORKDIR /app

COPY package.json bun.lock ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile

COPY . .
RUN bun run build \
    && rm -rf node_modules \
    && bun install --frozen-lockfile --production

FROM node:24-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    ORIGIN=http://localhost:8080

COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/build ./build

USER node
EXPOSE 3000

CMD ["node", "build"]

