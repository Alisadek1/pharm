# ── Stage 1: Build React frontend ────────────────────────────────────────────
FROM node:20-alpine AS frontend-build

WORKDIR /app
COPY frontend/ ./frontend/
COPY public/ ./public/

WORKDIR /app/frontend
RUN npm ci

ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# ── Stage 2: PHP + Apache runtime ────────────────────────────────────────────
FROM php:8.3-apache

# Install PHP extensions
RUN apt-get update && apt-get install -y \
    libpng-dev libonig-dev libxml2-dev zip unzip \
    && docker-php-ext-install pdo pdo_mysql mbstring exif pcntl bcmath gd \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Fix MPM conflict: disable event/worker, use prefork only
RUN a2dismod mpm_event mpm_worker 2>/dev/null; \
    a2enmod mpm_prefork rewrite headers

# Apache virtual host config
COPY docker/apache.conf /etc/apache2/sites-available/000-default.conf

# PHP backend
COPY backend/ /var/www/backend/

# React build output
COPY --from=frontend-build /app/public/ /var/www/html/

# Writable storage directories
RUN mkdir -p /var/www/backend/storage/logs \
             /var/www/backend/storage/uploads \
             /var/www/backend/storage/backups \
    && chown -R www-data:www-data /var/www/ \
    && chmod -R 755 /var/www/backend/storage

EXPOSE 80

CMD ["apache2-foreground"]
