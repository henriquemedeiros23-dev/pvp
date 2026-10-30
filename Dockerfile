# PvP Island game server (#52). One container serves the game page, the API and the WebSocket on $PORT.
# Accounts are saved to $DATA_FILE: mount a persistent volume at /data or they are lost on every update.
# Used by Railway, Fly.io or any Docker host (Render uses render.yaml instead, no Docker needed).
FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PORT=3000 \
    DATA_FILE=/data/accounts.json

WORKDIR /app

# Only what the server needs (see .dockerignore): the workspace files, the packages, the game, the admin scripts.
COPY package.json package-lock.json ./
COPY packages ./packages
COPY apps ./apps
COPY scripts ./scripts

# Install only the server's runtime dependencies (no Playwright, no esbuild).
RUN npm ci --omit=dev --workspace=@pvp/game \
 && npm cache clean --force \
 && mkdir -p /data \
 && chown -R node:node /data

# Run as the normal "node" user, not root.
USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/healthz').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"

# node directly (not npm start), so SIGTERM reaches the server and it saves the accounts before stopping.
CMD ["node", "apps/game/server.js"]
