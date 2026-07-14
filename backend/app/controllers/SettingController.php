<?php

declare(strict_types=1);

class SettingController
{
    public function index(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'settings.view');

        $db   = Database::getInstance();
        $stmt = $db->query("SELECT `key`, `value` FROM settings ORDER BY `key` ASC");
        // Return as array of {key, value} objects for easier frontend iteration
        $rows = $stmt->fetchAll();

        Response::success($rows);
    }

    public function update(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'settings.edit');

        $body = $_POST;
        $db   = Database::getInstance();

        $allowed = [
            'pharmacy_name', 'pharmacy_name_ar', 'license_number', 'tax_registration',
            'address', 'phone', 'email', 'website',
            'currency', 'currency_symbol', 'tax_rate', 'tax_name',
            'loyalty_rate', 'loyalty_point_value', 'near_expiry_days',
            'invoice_prefix', 'purchase_prefix', 'invoice_footer', 'invoice_footer_ar',
            'show_logo_invoice', 'show_qr_invoice',
            'default_printer', 'thermal_width', 'auto_print', 'print_copies', 'receipt_language',
        ];

        $stmt = $db->prepare("INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)");

        foreach ($allowed as $key) {
            if (array_key_exists($key, $body)) {
                $stmt->execute([$key, (string)$body[$key]]);
            }
        }

        // Handle logo upload
        if (!empty($_FILES['logo']['name'])) {
            try {
                $path    = Upload::image($_FILES['logo'], 'logos');
                $oldLogo = $db->query("SELECT `value` FROM settings WHERE `key` = 'logo'")->fetchColumn();
                if ($oldLogo) Upload::delete($oldLogo);
                $db->prepare("INSERT INTO settings (`key`, `value`) VALUES ('logo', ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)")
                   ->execute([$path]);
            } catch (RuntimeException $e) {
                // Logo upload failure is non-fatal; log it
                Logger::warning('Logo upload failed: ' . $e->getMessage());
            }
        }

        Logger::activity($user['id'], 'update', 'settings', null, 'Updated pharmacy settings');
        Response::success(null, 'Settings updated successfully');
    }

    public function uploadLogo(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'settings.edit');

        if (empty($_FILES['logo']['name'])) {
            Response::error('Logo file is required');
        }

        try {
            $path = Upload::image($_FILES['logo'], 'logos');
        } catch (RuntimeException $e) {
            Response::error($e->getMessage());
        }

        $db = Database::getInstance();

        // Delete old logo
        $oldLogo = $db->query("SELECT `value` FROM settings WHERE `key` = 'pharmacy_logo'")->fetchColumn();
        if ($oldLogo) {
            Upload::delete($oldLogo);
        }

        $db->prepare("INSERT INTO settings (`key`, `value`) VALUES ('pharmacy_logo', ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)")
           ->execute([$path]);

        Logger::activity($user['id'], 'upload_logo', 'settings', null, 'Updated pharmacy logo');
        Response::success(['path' => $path], 'Logo uploaded successfully');
    }

    public function backup(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'settings.edit');

        $db       = Database::getInstance();
        $filename = 'pharm-backup-' . date('Y-m-d-His') . '.sql';

        header('Content-Type: application/octet-stream');
        header("Content-Disposition: attachment; filename=\"{$filename}\"");
        header('Cache-Control: no-cache');

        echo "-- PharmaCare Database Backup\n";
        echo "-- Generated: " . date('Y-m-d H:i:s') . "\n";
        echo "SET NAMES utf8mb4;\n";
        echo "SET FOREIGN_KEY_CHECKS=0;\n\n";

        $tables = $db->query("SHOW TABLES")->fetchAll(PDO::FETCH_COLUMN);

        foreach ($tables as $table) {
            $create = $db->query("SHOW CREATE TABLE `{$table}`")->fetch();
            echo "-- Table: {$table}\n";
            echo "DROP TABLE IF EXISTS `{$table}`;\n";
            echo $create['Create Table'] . ";\n\n";

            $rows = $db->query("SELECT * FROM `{$table}`")->fetchAll();
            foreach ($rows as $row) {
                $values = array_map(fn($v) => $v === null ? 'NULL' : "'" . addslashes((string)$v) . "'", $row);
                echo "INSERT INTO `{$table}` VALUES (" . implode(', ', $values) . ");\n";
            }
            echo "\n";
        }

        echo "SET FOREIGN_KEY_CHECKS=1;\n";

        Logger::activity($user['id'], 'backup', 'settings', null, "Downloaded backup: {$filename}");
        exit;
    }
}
