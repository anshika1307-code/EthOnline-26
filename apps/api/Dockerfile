# Preflight API — the safety check, sold per call over x402 on Hedera.
# Build from the REPO ROOT (it imports packages/checks):
#   docker build -f apps/api/Dockerfile -t preflight-api .
FROM node:20-alpine

WORKDIR /app

COPY apps/api/package.json apps/api/package-lock.json* ./apps/api/
RUN cd apps/api && npm install --omit=dev --omit=optional --no-audit --no-fund

COPY apps/api/tsconfig.json ./apps/api/
COPY apps/api/src ./apps/api/src
# The check implementations live outside the app; the subset imported here has
# no dependencies of its own, so the source is all that is needed.
COPY packages/checks/src ./packages/checks/src

WORKDIR /app/apps/api

ENV NODE_ENV=production
EXPOSE 8403
CMD ["./node_modules/.bin/tsx", "src/server.ts"]
