# ── Stage 1: Build React frontend ────────────────────────────────────────────
FROM node:20-alpine AS frontend-build

WORKDIR /app
COPY frontend/ ./frontend/
COPY public/ ./public/

WORKDIR /app/frontend
RUN npm ci

ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
ARG VITE_BASE_PATH=/
ENV VITE_BASE_PATH=$VITE_BASE_PATH

RUN npm run build

# ── Stage 2: nginx + php-fpm runtime ─────────────────────────────────────────
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y \
    nginx \
    php8.2-fpm \
    php8.2-mysql \
    php8.2-mbstring \
    php8.2-xml \
    php8.2-gd \
    php8.2-bcmath \
    php8.2-curl \
    gettext-base \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# nginx config (uses $PORT via envsubst at runtime)
COPY docker/nginx.conf /etc/nginx/nginx.template.conf
COPY docker/start.sh /start.sh
RUN sed -i 's/\r$//' /start.sh && chmod +x /start.sh

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

EXPOSE ${PORT:-80}

CMD ["bash", "/start.sh"]
