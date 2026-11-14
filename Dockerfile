# Production image: one long-running Node process serving Next.js + the
# Socket.IO auction server. Works on Render, Railway, Fly.io or any Docker host.
#
#   docker build -t anime-auction .
#   docker run -p 3000:3000 -e DATABASE_URL=postgresql://... anime-auction
#
# On start it applies migrations and (re)seeds the character database.

FROM node:22-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS build
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --include=dev
COPY . .
RUN npm run build && npm prune --omit=dev

FROM base AS run
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app ./
EXPOSE 3000
CMD ["npm", "run", "start:prod"]
