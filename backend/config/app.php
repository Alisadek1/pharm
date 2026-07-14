<?php

declare(strict_types=1);

return [
    'name'        => $_ENV['APP_NAME'] ?? 'PharmaCare',
    'env'         => $_ENV['APP_ENV'] ?? 'production',
    'debug'       => filter_var($_ENV['APP_DEBUG'] ?? false, FILTER_VALIDATE_BOOLEAN),
    'url'         => $_ENV['APP_URL'] ?? 'http://localhost/pharm/backend',
    'timezone'    => $_ENV['APP_TIMEZONE'] ?? 'UTC',
    'jwt_secret'  => $_ENV['JWT_SECRET'] ?? 'change-this-secret-key-in-production',
    'jwt_expiry'  => (int)($_ENV['JWT_EXPIRY'] ?? 900),
    'jwt_refresh' => (int)($_ENV['JWT_REFRESH_EXPIRY'] ?? 604800),
    'cors_origins'=> explode(',', $_ENV['CORS_ORIGINS'] ?? 'http://localhost:5173'),
];
