<?php

declare(strict_types=1);

// Load environment variables
$envFile = __DIR__ . '/../.env';
if (file_exists($envFile)) {
    $lines = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        if (str_starts_with(trim($line), '#')) continue;
        if (str_contains($line, '=')) {
            [$key, $value] = explode('=', $line, 2);
            $_ENV[trim($key)] = trim($value);
        }
    }
}

// Autoloader
spl_autoload_register(function (string $class): void {
    $dirs = [
        __DIR__ . '/../app/controllers/',
        __DIR__ . '/../app/models/',
        __DIR__ . '/../app/middleware/',
        __DIR__ . '/../app/services/',
        __DIR__ . '/../app/helpers/',
        __DIR__ . '/../app/routes/',
        __DIR__ . '/../config/',
    ];

    foreach ($dirs as $dir) {
        $file = $dir . $class . '.php';
        if (file_exists($file)) {
            require_once $file;
            return;
        }
    }
});

// CORS Headers
$config = require __DIR__ . '/../config/app.php';
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';

if (in_array($origin, $config['cors_origins'], true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
}

header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Max-Age: 86400');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Security headers
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('X-XSS-Protection: 1; mode=block');
header('Referrer-Policy: strict-origin-when-cross-origin');

// Parse request body
if (in_array($_SERVER['REQUEST_METHOD'], ['POST', 'PUT', 'PATCH'], true)) {
    $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
    if (str_contains($contentType, 'application/json')) {
        $body = file_get_contents('php://input');
        if ($body) {
            $parsed = json_decode($body, true);
            if (json_last_error() === JSON_ERROR_NONE) {
                $_POST = array_merge($_POST, $parsed ?? []);
            }
        }
    }
}

// Get URI
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$uri = rtrim($uri, '/') ?: '/';

// Remove base path if running in a subdirectory (local dev: /pharm/backend/public)
$basePath = $_ENV['APP_BASE_PATH'] ?? '/pharm/backend/public';
if ($basePath && str_starts_with($uri, $basePath)) {
    $uri = substr($uri, strlen($basePath)) ?: '/';
}

// Load and dispatch routes
$router = require __DIR__ . '/../app/routes/api.php';
$router->dispatch($_SERVER['REQUEST_METHOD'], $uri);
