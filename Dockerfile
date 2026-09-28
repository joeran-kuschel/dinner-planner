# syntax=docker/dockerfile:1

# ---- dependencies (including dev, needed to build and to run migrations) ----
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- build ----
FROM deps AS build
WORKDIR /app
# prisma7.config.ts reads DATABASE_URL when the CLI loads it, and `next build`
# may pull in lib/db.ts. Nothing connects at build time, so a placeholder is
# enough — the real URL comes from the Secret at runtime.
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build"
COPY . .
RUN npx prisma generate && npm run build

# ---- the app ----
# Runs .next/standalone, which carries only the traced dependencies.
FROM node:24-alpine AS app
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]

# ---- migrations and seeding ----
# Kept separate from the app image because it needs the Prisma CLI, tsx and the
# schema, none of which belong in the thing serving traffic. Production
# dependencies only, so Playwright and Vitest never reach the cluster — `prisma`,
# `tsx` and `dotenv` are runtime dependencies precisely because this image needs
# them to migrate and seed.
FROM node:24-alpine AS migrator
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY prisma ./prisma
COPY lib ./lib
COPY prisma7.config.ts tsconfig.json ./
COPY --from=build /app/generated ./generated
CMD ["npx", "prisma", "migrate", "deploy"]
