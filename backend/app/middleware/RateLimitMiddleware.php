<?php

declare(strict_types=1);

class RateLimitMiddleware
{
    private static string $storageDir = __DIR__ . '/../../storage/rate_limits/';

    public static function handle(string $key, int $maxAttempts = 60, int $decaySeconds = 60): void
    {
        if (!is_dir(self::$storageDir)) {
            mkdir(self::$storageDir, 0755, true);
        }

        $ip   = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
        $file = self::$storageDir . md5($key . $ip) . '.json';
        $now  = time();

        $data = ['attempts' => 0, 'reset_at' => $now + $decaySeconds];

        if (file_exists($file)) {
            $stored = json_decode(file_get_contents($file), true);
            if ($stored && $stored['reset_at'] > $now) {
                $data = $stored;
            }
        }

        $data['attempts']++;
        file_put_contents($file, json_encode($data), LOCK_EX);

        header('X-RateLimit-Limit: ' . $maxAttempts);
        header('X-RateLimit-Remaining: ' . max(0, $maxAttempts - $data['attempts']));
        header('X-RateLimit-Reset: ' . $data['reset_at']);

        if ($data['attempts'] > $maxAttempts) {
            Response::json(['success' => false, 'message' => 'Too many requests. Please try again later.'], 429);
            exit;
        }
    }
}
