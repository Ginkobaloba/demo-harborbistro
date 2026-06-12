# Harbor Bistro demo container. The SQLite database is seeded at IMAGE
# BUILD time and ships baked into the image (docs/decisions.md D-004);
# runtime writes (orders, reservations) land in the container layer and
# reset on redeploy, which is the accepted posture for the demo fleet.
#
# sharp is a hard runtime requirement: standalone-mode next/image errors
# on every optimized image request without it. It is a production dep and
# Next's output tracing carries it into .next/standalone.
#
# Build/deploy via cloudflare-config\scripts\deploy-demo.ps1:
#   deploy-demo.ps1 -Name harborbistro -ContextPath C:\dev\demo-harborbistro -InternalPort 3000

FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run db:seed
RUN npm run db:verify
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/data ./data

EXPOSE 3000
CMD ["node", "server.js"]
