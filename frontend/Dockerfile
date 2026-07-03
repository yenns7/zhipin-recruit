# Build stage
FROM registry.ymdd.tech/library/node:20-alpine AS build-stage
WORKDIR /app

# Copy package dependency configuration relative to root build context
COPY frontend/package*.json ./
RUN npm install

# Copy frontend source code and build
COPY frontend/ ./
RUN npm run build

# Production stage
FROM registry.ymdd.tech/library/nginx:1.25-alpine
RUN chown -R nginx:nginx /var/cache/nginx /var/log/nginx /etc/nginx
RUN sed -i 's/^user/#user/' /etc/nginx/nginx.conf && \
    sed -i 's!/var/run/nginx.pid!/tmp/nginx.pid!' /etc/nginx/nginx.conf && \
    sed -i 's/^worker_processes.*/worker_processes 2;/' /etc/nginx/nginx.conf
COPY --chown=nginx:nginx --from=build-stage /app/dist /usr/share/nginx/html
COPY --chown=nginx:nginx frontend/nginx.conf /etc/nginx/conf.d/default.conf
USER nginx
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
