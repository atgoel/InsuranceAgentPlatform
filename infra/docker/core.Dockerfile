# Domain core (NestJS) for local demos. Build context: repository root.
#   docker compose -f infra/dev/docker-compose.yml --profile app up -d --build
FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/core/package.json apps/core/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace apps/core --include-workspace-root=false
COPY apps/core apps/core
RUN npm run build -w apps/core

FROM node:22-alpine AS runtime
ENV NODE_ENV=development
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/core/package.json apps/core/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace apps/core --include-workspace-root=false --omit=dev && npm cache clean --force
COPY --from=build /repo/apps/core/dist apps/core/dist
COPY apps/core/migrations apps/core/migrations
WORKDIR /repo/apps/core
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
