<?php

declare(strict_types=1);

class Database
{
    private static ?PDO $instance = null;
    private static array $config = [];

    public static function getInstance(): PDO
    {
        if (self::$instance === null) {
            self::$config = [
                'host'     => $_ENV['DB_HOST'] ?? 'localhost',
                'port'     => $_ENV['DB_PORT'] ?? '3306',
                'dbname'   => $_ENV['DB_NAME'] ?? 'pharm_db',
                'username' => $_ENV['DB_USER'] ?? 'root',
                'password' => $_ENV['DB_PASS'] ?? '',
                'charset'  => 'utf8mb4',
            ];

            try {
                $dsn = sprintf(
                    'mysql:host=%s;port=%s;dbname=%s;charset=%s',
                    self::$config['host'],
                    self::$config['port'],
                    self::$config['dbname'],
                    self::$config['charset']
                );

                self::$instance = new PDO($dsn, self::$config['username'], self::$config['password'], [
                    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES   => false,
                    PDO::ATTR_PERSISTENT         => false,
                    PDO::MYSQL_ATTR_FOUND_ROWS   => true,
                ]);

                self::$instance->exec("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci");
                self::$instance->exec("SET time_zone = '+00:00'");
            } catch (PDOException $e) {
                Logger::error('Database connection failed: ' . $e->getMessage());
                Response::json(['error' => 'Database connection failed'], 503);
                exit;
            }
        }

        return self::$instance;
    }

    public static function beginTransaction(): void
    {
        self::getInstance()->beginTransaction();
    }

    public static function commit(): void
    {
        self::getInstance()->commit();
    }

    public static function rollBack(): void
    {
        if (self::getInstance()->inTransaction()) {
            self::getInstance()->rollBack();
        }
    }

    private function __construct() {}
    private function __clone() {}
}
