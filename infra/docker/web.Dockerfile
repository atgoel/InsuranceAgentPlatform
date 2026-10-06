# Web app (Vite build) served by nginx, which proxies /api to the core service. Build context: repository root.
FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/core/package.json apps/core/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace apps/web --include-workspace-root=false
COPY apps/web apps/web
RUN npm run build -w apps/web

FROM nginx:1.27-alpine
COPY infra/docker/nginx-web.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
COPY infra/docker/web-config.sh /docker-entrypoint.d/40-iap-config.sh
RUN sed -i 's/\r$//' /docker-entrypoint.d/40-iap-config.sh && chmod +x /docker-entrypoint.d/40-iap-config.sh
EXPOSE 80
