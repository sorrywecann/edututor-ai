FROM node:20-alpine AS base

# Install dependencies
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
RUN npm install -g pnpm
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Build
FROM base AS builder
WORKDIR /app
RUN npm install -g pnpm
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_API_URL empty → browser uses relative URLs
ARG NEXT_PUBLIC_API_URL=""
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
# API_PROXY_TARGET baked into route manifest for standalone rewrites
ARG API_PROXY_TARGET=http://localhost:8000
ENV API_PROXY_TARGET=$API_PROXY_TARGET
# auth.ts requires NEXTAUTH_SECRET at build time when NODE_ENV=production —
# otherwise it throws and the build fails. Build-arg defaults to a dev secret
# so a vanilla `docker compose up --build` works out of the box. Production
# deployments MUST override this in compose: build.args.NEXTAUTH_SECRET=<real>.
ARG NEXTAUTH_SECRET="edututor-dev-build-secret-not-for-production"
ENV NEXTAUTH_SECRET=$NEXTAUTH_SECRET
# NODE_ENV is configurable per-build. Default = production (Next.js standalone
# bundle is optimized). Set NODE_ENV=development at build time for source-map
# friendly output. Note: Next.js standalone always builds with prod
# optimisations regardless — true development mode requires `pnpm dev`
# (no Docker), not a build-time env flip.
ARG NODE_ENV=production
ENV NODE_ENV=$NODE_ENV
RUN pnpm build

# Run
FROM base AS runner
WORKDIR /app
ARG NODE_ENV=production
ENV NODE_ENV=$NODE_ENV
ARG NEXTAUTH_SECRET="edututor-dev-build-secret-not-for-production"
ENV NEXTAUTH_SECRET=$NEXTAUTH_SECRET
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
