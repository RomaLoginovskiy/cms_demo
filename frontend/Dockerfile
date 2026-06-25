# Build stage
FROM node:18-alpine AS build
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including devDependencies needed for build)
RUN npm ci

# Copy source code
COPY . .

# Set environment variables for build
# Note: REACT_APP_API_URL should be empty since nginx proxies /api/* to CMS backend
ENV REACT_APP_API_URL=
ENV REACT_APP_BASE_PATH=/cms
ENV PUBLIC_PATH=/cms/
ENV GENERATE_SOURCEMAP=false

# Build the application
RUN npm run build

# Runtime stage
FROM nginxinc/nginx-unprivileged:alpine AS runtime
USER root

RUN apk add --no-cache jq

# Copy built application
COPY --from=build /app/build /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.main.conf /etc/nginx/nginx.conf
COPY nginx.conf /etc/nginx/default.conf.template
COPY docker-runtime-env.sh /docker-runtime-env.sh
RUN chmod +x /docker-runtime-env.sh \
    && chown -R 101:101 /docker-runtime-env.sh /etc/nginx/conf.d /usr/share/nginx/html /var/cache/nginx /var/run

# Default CMS backend host
ENV BACKEND_HOST=cms-backend:8080
ENV CORALOGIX_RUM_PUBLIC_KEY=
ENV CORALOGIX_RUM_DOMAIN=eu1.coralogix.com
ENV CORALOGIX_APPLICATION=cms-demo
ENV CORALOGIX_SUBSYSTEM=cms-frontend
ENV CORALOGIX_ENVIRONMENT=local
ENV CORALOGIX_APP_VERSION=dev
ENV CORALOGIX_RUM_SESSION_SAMPLE_RATE=100

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/ || exit 1

# Expose port
EXPOSE 8080

# Substitute runtime configuration, then start nginx
USER 101
CMD ["/bin/sh", "-c", "/docker-runtime-env.sh && envsubst '${BACKEND_HOST}' < /etc/nginx/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]