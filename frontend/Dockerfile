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
# Note: REACT_APP_API_URL should be empty or relative since nginx will proxy /api/* to backend
ENV REACT_APP_API_URL=
ENV GENERATE_SOURCEMAP=false

# Build the application
RUN npm run build

# Runtime stage
FROM nginx:alpine AS runtime

# Copy built application
COPY --from=build /app/build /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.main.conf /etc/nginx/nginx.conf
COPY nginx.conf /etc/nginx/default.conf.template

# Default backend host (override via env var: localhost:8080 for ECS, backend:8080 for K8s)
ENV BACKEND_HOST=backend:8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost/ || exit 1

# Expose port
EXPOSE 80

# Substitute BACKEND_HOST into nginx config, then start nginx
CMD ["/bin/sh", "-c", "envsubst '${BACKEND_HOST}' < /etc/nginx/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"] 