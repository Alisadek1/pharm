# ── Stage 1: Build React frontend ────────────────────────────────────────────
FROM node:20-alpine AS frontend-build

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
# VITE_API_URL is injected at build time via Railway's environment variables
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# ── Stage 2: PHP + Apache runtime ────────────────────────────────────────────
FROM php:8.3-apache

# Install PHP extensions required by the app
RUN apt-get update && apt-get install -y libpng-dev libonig-dev libxml2-dev zip unzip \
    && docker-php-ext-install pdo pdo_mysql mbstring exif pcntl bcmath gd \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Enable Apache modules
RUN a2enmod rewrite headers proxy proxy_http

# Copy Apache virtual host config
COPY docker/apache.conf /etc/apache2/sites-available/000-default.conf

# Copy backend
COPY backend/ /var/www/backend/

# Copy React build output (from stage 1) into webroot
COPY --from=frontend-build /app/frontend/dist/ /var/www/html/

# Copy backend public into webroot under /api path is handled by vhost proxy
# The backend lives at /var/www/backend/public and is proxied from /api

# Storage & logs: writable directories
RUN mkdir -p /var/www/backend/storage/logs \
             /var/www/backend/storage/uploads \
             /var/www/backend/storage/backups \
    && chown -R www-data:www-data /var/www/ \
    && chmod -R 755 /var/www/backend/storage

EXPOSE 80

CMD ["apache2-foreground"]
