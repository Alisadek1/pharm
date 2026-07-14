<?php

declare(strict_types=1);

class JWT
{
    private static function getSecret(): string
    {
        $config = require __DIR__ . '/../../config/app.php';
        return $config['jwt_secret'];
    }

    public static function encode(array $payload): string
    {
        $header  = self::base64url(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
        $payload = self::base64url(json_encode($payload));
        $sig     = self::base64url(hash_hmac('sha256', "{$header}.{$payload}", self::getSecret(), true));

        return "{$header}.{$payload}.{$sig}";
    }

    public static function decode(string $token): ?array
    {
        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            return null;
        }

        [$header, $payload, $sig] = $parts;

        $expectedSig = self::base64url(hash_hmac('sha256', "{$header}.{$payload}", self::getSecret(), true));

        if (!hash_equals($expectedSig, $sig)) {
            return null;
        }

        $data = json_decode(self::base64urlDecode($payload), true);

        if (!is_array($data)) {
            return null;
        }

        if (isset($data['exp']) && $data['exp'] < time()) {
            return null;
        }

        return $data;
    }

    public static function createAccessToken(array $user): string
    {
        $config = require __DIR__ . '/../../config/app.php';
        return self::encode([
            'sub'   => $user['id'],
            'name'  => $user['name'],
            'role'  => $user['role_id'],
            'iat'   => time(),
            'exp'   => time() + $config['jwt_expiry'],
            'type'  => 'access',
        ]);
    }

    public static function createRefreshToken(array $user): string
    {
        $config = require __DIR__ . '/../../config/app.php';
        return self::encode([
            'sub'  => $user['id'],
            'iat'  => time(),
            'exp'  => time() + $config['jwt_refresh'],
            'type' => 'refresh',
        ]);
    }

    private static function base64url(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    private static function base64urlDecode(string $data): string
    {
        return base64_decode(strtr($data, '-_', '+/') . str_repeat('=', 3 - (3 + strlen($data)) % 4));
    }
}
