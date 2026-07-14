<?php

declare(strict_types=1);

class AuthController
{
    public function login(array $params): void
    {
        RateLimitMiddleware::handle('login', 10, 300);

        $body = $_POST;

        $validator = Validator::make($body, [
            'username' => 'required|string',
            'password' => 'required|string|minlength:6',
        ]);

        if ($validator->fails()) {
            Response::validationError($validator->errors());
        }

        $db   = Database::getInstance();
        $stmt = $db->prepare("
            SELECT u.*, r.name as role_name
            FROM users u
            JOIN roles r ON r.id = u.role_id
            WHERE (u.username = ? OR u.email = ?) AND u.is_active = 1
        ");
        $stmt->execute([$body['username'], $body['username']]);
        $user = $stmt->fetch();

        if (!$user || !password_verify($body['password'], $user['password'])) {
            Logger::warning('Failed login attempt', ['username' => $body['username']]);
            Response::unauthorized('Invalid username or password');
        }

        $accessToken  = JWT::createAccessToken($user);
        $refreshToken = JWT::createRefreshToken($user);

        $db->prepare("UPDATE users SET last_login = NOW(), refresh_token = ? WHERE id = ?")
           ->execute([password_hash($refreshToken, PASSWORD_BCRYPT), $user['id']]);

        Logger::activity($user['id'], 'login', 'users', $user['id'], 'User logged in');

        Response::success([
            'access_token'  => $accessToken,
            'refresh_token' => $refreshToken,
            'user'          => [
                'id'        => $user['id'],
                'name'      => $user['name'],
                'username'  => $user['username'],
                'email'     => $user['email'],
                'role_id'   => $user['role_id'],
                'role_name' => $user['role_name'],
                'avatar'    => $user['avatar'],
            ],
        ], 'Login successful');
    }

    public function refresh(array $params): void
    {
        $body  = $_POST;
        $token = $body['refresh_token'] ?? '';

        if (!$token) {
            Response::unauthorized('Refresh token is required');
        }

        $payload = JWT::decode($token);

        if (!$payload || ($payload['type'] ?? '') !== 'refresh') {
            Response::unauthorized('Invalid or expired refresh token');
        }

        $db   = Database::getInstance();
        $stmt = $db->prepare("SELECT * FROM users WHERE id = ? AND is_active = 1");
        $stmt->execute([$payload['sub']]);
        $user = $stmt->fetch();

        if (!$user || !$user['refresh_token'] || !password_verify($token, $user['refresh_token'])) {
            Response::unauthorized('Invalid refresh token');
        }

        $newAccessToken  = JWT::createAccessToken($user);
        $newRefreshToken = JWT::createRefreshToken($user);

        $db->prepare("UPDATE users SET refresh_token = ? WHERE id = ?")
           ->execute([password_hash($newRefreshToken, PASSWORD_BCRYPT), $user['id']]);

        Response::success([
            'access_token'  => $newAccessToken,
            'refresh_token' => $newRefreshToken,
        ], 'Token refreshed');
    }

    public function logout(array $params): void
    {
        $user = AuthMiddleware::handle();

        $db = Database::getInstance();
        $db->prepare("UPDATE users SET refresh_token = NULL WHERE id = ?")
           ->execute([$user['id']]);

        Logger::activity($user['id'], 'logout', 'users', $user['id'], 'User logged out');
        Response::success(null, 'Logged out successfully');
    }

    public function forgotPassword(array $params): void
    {
        RateLimitMiddleware::handle('forgot_password', 5, 300);

        $body      = $_POST;
        $email     = trim($body['email'] ?? '');

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            Response::validationError(['email' => ['Invalid email address']]);
        }

        $db   = Database::getInstance();
        $stmt = $db->prepare("SELECT id, name, email FROM users WHERE email = ? AND is_active = 1");
        $stmt->execute([$email]);
        $user = $stmt->fetch();

        // Always return success to prevent email enumeration
        if (!$user) {
            Response::success(null, 'If an account exists with that email, you will receive a reset link');
        }

        $token   = bin2hex(random_bytes(32));
        $expires = date('Y-m-d H:i:s', strtotime('+1 hour'));

        $db->prepare("UPDATE users SET password_reset_token = ?, password_reset_expires = ? WHERE id = ?")
           ->execute([$token, $expires, $user['id']]);

        Logger::info('Password reset requested', ['user_id' => $user['id'], 'email' => $email]);

        Response::success(['reset_token' => $token], 'Password reset token generated. Check your email.');
    }

    public function resetPassword(array $params): void
    {
        $body = $_POST;

        $validator = Validator::make($body, [
            'token'    => 'required|string',
            'password' => 'required|string|minlength:8',
        ]);

        if ($validator->fails()) {
            Response::validationError($validator->errors());
        }

        $db   = Database::getInstance();
        $stmt = $db->prepare("
            SELECT id FROM users
            WHERE password_reset_token = ?
              AND password_reset_expires > NOW()
              AND is_active = 1
        ");
        $stmt->execute([$body['token']]);
        $user = $stmt->fetch();

        if (!$user) {
            Response::error('Invalid or expired reset token', 400);
        }

        $hashed = password_hash($body['password'], PASSWORD_BCRYPT, ['cost' => 12]);

        $db->prepare("
            UPDATE users
            SET password = ?, password_reset_token = NULL, password_reset_expires = NULL, refresh_token = NULL
            WHERE id = ?
        ")->execute([$hashed, $user['id']]);

        Logger::activity($user['id'], 'password_reset', 'users', $user['id'], 'Password was reset');
        Response::success(null, 'Password reset successfully. Please login with your new password.');
    }
}
