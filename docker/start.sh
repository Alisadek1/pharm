#!/bin/bash
set -e

export PORT=${PORT:-80}
envsubst '$PORT' < /etc/nginx/nginx.template.conf > /etc/nginx/nginx.conf

# Generate backend .env from container environment variables
cat > /var/www/backend/.env <<EOF
APP_NAME=${APP_NAME:-PharmaCare}
APP_ENV=${APP_ENV:-production}
APP_DEBUG=${APP_DEBUG:-false}
APP_TIMEZONE=UTC
APP_BASE_PATH=${APP_BASE_PATH:-none}
DB_HOST=${DB_HOST:-127.0.0.1}
DB_PORT=${DB_PORT:-3306}
DB_NAME=${DB_NAME:-pharm_db}
DB_USER=${DB_USER:-root}
DB_PASS=${DB_PASS:-}
JWT_SECRET=${JWT_SECRET:-change-me-in-production}
JWT_EXPIRY=${JWT_EXPIRY:-900}
JWT_REFRESH_EXPIRY=${JWT_REFRESH_EXPIRY:-604800}
CORS_ORIGINS=${CORS_ORIGINS:-*}
MAIL_HOST=${MAIL_HOST:-localhost}
MAIL_PORT=${MAIL_PORT:-1025}
MAIL_USER=${MAIL_USER:-}
MAIL_PASS=${MAIL_PASS:-}
MAIL_FROM=${MAIL_FROM:-noreply@pharmacy.com}
MAIL_FROM_NAME=${MAIL_FROM_NAME:-PharmaCare}
EOF
chown www-data:www-data /var/www/backend/.env
chmod 640 /var/www/backend/.env

mkdir -p /run/php
php-fpm8.2 -D
echo "php-fpm started, socket:"
ls -la /run/php/

exec nginx -g 'daemon off;'
