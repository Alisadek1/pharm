<?php
// ONE-TIME DB import script — DELETE after use
// Only runs if secret token is passed
if (($_GET['token'] ?? '') !== 'pharm-import-2026') {
    http_response_code(403); exit('Forbidden');
}

$host = $_ENV['DB_HOST'] ?? getenv('DB_HOST');
$port = $_ENV['DB_PORT'] ?? getenv('DB_PORT') ?: 3306;
$name = $_ENV['DB_NAME'] ?? getenv('DB_NAME');
$user = $_ENV['DB_USER'] ?? getenv('DB_USER');
$pass = $_ENV['DB_PASS'] ?? getenv('DB_PASS');

// Load .env if present (local dev)
$envFile = __DIR__ . '/../.env';
if (!$host && file_exists($envFile)) {
    foreach (file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        if (str_starts_with(trim($line), '#') || !str_contains($line, '=')) continue;
        [$k, $v] = explode('=', $line, 2);
        $k = trim($k); $v = trim($v);
        if ($k === 'DB_HOST') $host = $v;
        if ($k === 'DB_PORT') $port = $v;
        if ($k === 'DB_NAME') $name = $v;
        if ($k === 'DB_USER') $user = $v;
        if ($k === 'DB_PASS') $pass = $v;
    }
}

try {
    $pdo = new PDO("mysql:host={$host};port={$port};charset=utf8mb4", $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    ]);

    // Create DB if not exists
    $pdo->exec("CREATE DATABASE IF NOT EXISTS `{$name}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    $pdo->exec("USE `{$name}`");

    // Import schema
    $schema = file_get_contents(__DIR__ . '/../database/schema.sql');
    foreach (array_filter(array_map('trim', explode(';', $schema))) as $stmt) {
        if ($stmt) $pdo->exec($stmt);
    }
    echo "✓ Schema imported<br>";

    // Import seed
    $seed = file_get_contents(__DIR__ . '/../database/seed.sql');
    foreach (array_filter(array_map('trim', explode(';', $seed))) as $stmt) {
        if ($stmt) $pdo->exec($stmt);
    }
    echo "✓ Seed data imported<br>";

    // Reset owner password
    $hash = password_hash('Admin@123', PASSWORD_BCRYPT, ['cost' => 12]);
    $pdo->prepare("UPDATE `{$name}`.users SET password=?, is_active=1 WHERE username='owner'")->execute([$hash]);
    echo "✓ Owner password set to Admin@123<br>";
    echo "<br><strong>Done! Delete this file now.</strong>";

} catch (Exception $e) {
    echo "Error: " . $e->getMessage();
}
