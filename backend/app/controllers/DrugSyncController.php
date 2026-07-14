<?php

declare(strict_types=1);

class DrugSyncController
{
    public function getSettings(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'settings.view');

        $db   = Database::getInstance();
        $keys = ['rsd_api_url', 'rsd_api_key', 'rsd_api_secret', 'rsd_sync_interval', 'rsd_enabled'];

        $stmt = $db->prepare(
            'SELECT `key`, `value` FROM settings WHERE `key` IN (' . implode(',', array_fill(0, count($keys), '?')) . ')'
        );
        $stmt->execute($keys);
        $settings = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);

        // Never return secrets in plaintext — mask api_secret
        if (!empty($settings['rsd_api_secret'])) {
            $settings['rsd_api_secret_masked'] = str_repeat('*', max(0, strlen($settings['rsd_api_secret']) - 4)) . substr($settings['rsd_api_secret'], -4);
        }

        Response::success($settings);
    }

    public function saveSettings(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'settings.edit');

        $body   = $_POST;
        $db     = Database::getInstance();
        $allowed = ['rsd_api_url', 'rsd_api_key', 'rsd_api_secret', 'rsd_sync_interval', 'rsd_enabled'];

        foreach ($allowed as $key) {
            if (!array_key_exists($key, $body)) continue;
            // Don't overwrite secret with mask
            if ($key === 'rsd_api_secret' && str_contains($body[$key], '****')) continue;

            $db->prepare("INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?")
               ->execute([$key, $body[$key], $body[$key]]);
        }

        Logger::activity($user['id'], 'update', 'settings', null, 'Updated RSD integration settings');
        Response::success(null, 'Integration settings saved');
    }

    public function history(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'settings.view');

        $db      = Database::getInstance();
        $page    = max(1, (int)($_GET['page'] ?? 1));
        $perPage = 20;
        $offset  = ($page - 1) * $perPage;

        $total = (int)$db->query("SELECT COUNT(*) FROM drug_sync_logs")->fetchColumn();

        $stmt = $db->prepare("
            SELECT l.*, u.name as triggered_by_name
            FROM drug_sync_logs l
            LEFT JOIN users u ON u.id = l.triggered_by
            ORDER BY l.started_at DESC
            LIMIT ? OFFSET ?
        ");
        $stmt->execute([$perPage, $offset]);
        $rows = $stmt->fetchAll();

        Response::paginated($rows, $total, $page, $perPage);
    }

    public function sync(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'settings.edit');

        $db       = Database::getInstance();
        $settings = $db->query("SELECT `key`, `value` FROM settings WHERE `key` LIKE 'rsd_%'")->fetchAll(PDO::FETCH_KEY_PAIR);

        if (empty($settings['rsd_enabled']) || $settings['rsd_enabled'] !== '1') {
            Response::error('RSD integration is disabled. Enable it in Integration Settings first.', 400);
        }

        if (empty($settings['rsd_api_url'])) {
            Response::error('API URL is not configured.', 400);
        }

        // Create log entry
        $stmt = $db->prepare("
            INSERT INTO drug_sync_logs (provider, sync_type, status, triggered_by)
            VALUES ('saudi_rsd', 'full', 'running', ?)
        ");
        $stmt->execute([$user['id']]);
        $logId = (int)$db->lastInsertId();

        try {
            $provider = new SaudiRSDProvider(
                $settings['rsd_api_url']    ?? '',
                $settings['rsd_api_key']    ?? '',
                $settings['rsd_api_secret'] ?? ''
            );

            $service = new DrugSyncService($db, $provider, $logId);
            $result  = $service->syncAll();

            $db->prepare("
                UPDATE drug_sync_logs
                SET status = 'completed', medicines_checked = ?, medicines_updated = ?, medicines_failed = ?, completed_at = NOW()
                WHERE id = ?
            ")->execute([$result['checked'], $result['updated'], $result['failed'], $logId]);

            Logger::activity($user['id'], 'sync', 'drug_sync_logs', $logId, "RSD sync: {$result['updated']} updated, {$result['failed']} failed");
            Response::success($result, "Sync completed: {$result['updated']} medicines updated");
        } catch (Exception $e) {
            $db->prepare("
                UPDATE drug_sync_logs SET status = 'failed', error_message = ?, completed_at = NOW() WHERE id = ?
            ")->execute([$e->getMessage(), $logId]);
            Response::error('Sync failed: ' . $e->getMessage(), 500);
        }
    }
}
