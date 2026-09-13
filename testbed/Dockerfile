# Preflight testbed — three deliberately-differing x402 endpoints.
# Build from the REPO ROOT:  docker build -f testbed/Dockerfile -t preflight-testbed .
FROM node:20-alpine

WORKDIR /app

# Deps first so they cache independently of source changes.
COPY testbed/package.json testbed/package-lock.json* ./testbed/
RUN cd testbed && npm install --omit=dev --omit=optional --no-audit --no-fund

COPY testbed/tsconfig.json ./testbed/
COPY testbed/src ./testbed/src

WORKDIR /app/testbed

# Secrets are injected at runtime, never baked into the image.
ENV NODE_ENV=production
EXPOSE 8402
CMD ["./node_modules/.bin/tsx", "src/server.ts"]
