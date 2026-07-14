<?php

declare(strict_types=1);

class Logger
{
    private static string $logDir = __DIR__ . '/../../logs/';

    public static function info(string $message, array $context = []): void
    {
        self::write('INFO', $message, $context);
    }

    public static function error(string $message, array $context = []): void
    {
        self::write('ERROR', $message, $context);
    }

    public static function warning(string $message, array $context = []): void
    {
        self::write('WARNING', $message, $context);
    }

    public static function debug(string $message, array $context = []): void
    {
        $config = require __DIR__ . '/../../config/app.php';
        if ($config['debug']) {
            self::write('DEBUG', $message, $context);
        }
    }

    private static function write(string $level, string $message, array $context = []): void
    {
        $date     = date('Y-m-d');
        $time     = date('Y-m-d H:i:s');
        $file     = self::$logDir . $date . '.log';
        $ctx      = !empty($context) ? ' ' . json_encode($context, JSON_UNESCAPED_UNICODE) : '';
        $line     = "[{$time}] [{$level}] {$message}{$ctx}" . PHP_EOL;

        if (!is_dir(self::$logDir)) {
            mkdir(self::$logDir, 0755, true);
        }

        file_put_contents($file, $line, FILE_APPEND | LOCK_EX);
    }

    public static function activity(int $userId, string $action, string $model = null, int $modelId = null, string $description = null): void
    {
        try {
            $db = Database::getInstance();
            $stmt = $db->prepare("
                INSERT INTO activity_logs (user_id, action, model, model_id, description, ip_address, user_agent)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([
                $userId,
                $action,
                $model,
                $modelId,
                $description,
                $_SERVER['REMOTE_ADDR'] ?? null,
                $_SERVER['HTTP_USER_AGENT'] ?? null,
            ]);
        } catch (Exception $e) {
            self::error('Failed to log activity: ' . $e->getMessage());
        }
    }
}
