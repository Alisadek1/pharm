<?php
error_reporting(E_ALL);
ini_set('display_errors', '1');
ini_set('display_startup_errors', '1');

$_SERVER['REQUEST_METHOD'] = 'POST';
$_SERVER['REQUEST_URI'] = '/pharm/backend/public/api/auth/login';
$_SERVER['CONTENT_TYPE'] = 'application/json';
$_POST = [];

// Simulate JSON body
$GLOBALS['test_body'] = '{"username":"owner","password":"Admin@123"}';

// Load env
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
echo "ENV: OK\n";

// Test DB
try {
    require_once __DIR__ . '/../config/database.php';
    $db = Database::getInstance();
    echo "DB: Connected\n";
    $s = $db->prepare("SELECT id, name FROM users LIMIT 1");
    $s->execute();
    $row = $s->fetch();
    echo "User: " . json_encode($row) . "\n";
} catch (Throwable $e) {
    echo "DB ERROR: " . $e->getMessage() . "\n";
    echo "File: " . $e->getFile() . " line " . $e->getLine() . "\n";
}
