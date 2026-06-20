# Job Hunt Copilot — production container (keeps better-sqlite3 on a mounted volume).
# Built remotely by Fly (no local Docker needed). The data dir (/app/data, holding
# app.db + WAL files) is a persistent volume, NOT baked into the image.

# ---- build stage ----
FROM node:20-bookworm-slim AS build
WORKDIR /app
# Build tools so better-sqlite3 (native) compiles.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- runtime stage ----
FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# supercronic: a container-friendly cron runner for the scheduled jobs.
ARG SUPERCRONIC_VERSION=v0.2.33
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
    && curl -fsSLo /usr/local/bin/supercronic \
        "https://github.com/aptible/supercronic/releases/download/${SUPERCRONIC_VERSION}/supercronic-linux-amd64" \
    && chmod +x /usr/local/bin/supercronic \
    && apt-get purge -y curl && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

# Copy the whole built app: .next + node_modules (incl. tsx for the cron scripts)
# + the TS source the scripts execute (scripts/, src/lib/**) + config.
COPY --from=build /app ./

# Persistent data volume holds app.db (+ -wal/-shm). getDb() uses cwd/data already.
RUN mkdir -p /app/data && chmod +x /app/deploy/entrypoint.sh
VOLUME /app/data

EXPOSE 3000
CMD ["/app/deploy/entrypoint.sh"]
