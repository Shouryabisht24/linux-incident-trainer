# syntax=docker/dockerfile:1

# ---- deps ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install

# ---- build ----
FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- runtime ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist

EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://localhost:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# NOTE: stays root (not a non-root USER) because Phase 2 mounts the host
# /var/run/docker.sock into this container for dockerode — a non-root user
# would need matching group permissions on that socket, which vary by host.
# This is a deliberate, accepted tradeoff for a local personal tool; see
# decisions/0001-docker-outside-of-docker.md.
CMD ["node", "dist/index.js"]
