<?php

declare(strict_types=1);

/**
 * Manages drug_sync_logs entries for a file-based drug import.
 *
 * Idempotently adds the medicines_inserted and medicines_skipped columns
 * to the existing drug_sync_logs table (the schema pre-dates this feature).
 */
class ImportLogger
{
    private PDO $db;

    public function __construct(PDO $db)
    {
        $this->db = $db;
        $this->ensureColumns();
    }

    /**
     * Create a 'running' log entry and return its ID.
     */
    public function start(string $filename, int $estimatedTotal): int
    {
        $this->db->prepare("
            INSERT INTO drug_sync_logs
                (provider, sync_type, status, medicines_checked, triggered_by)
            VALUES ('egyptian_db', 'full', 'running', ?, NULL)
        ")->execute([$estimatedTotal]);

        return (int) $this->db->lastInsertId();
    }

    /**
     * Finalize the log entry with full stats.
     *
     * @param array{total:int, inserted:int, updated:int, skipped:int, failed:int} $stats
     */
    public function finish(int $logId, array $stats): void
    {
        $status = ($stats['inserted'] + $stats['updated'] > 0) ? 'completed' : 'failed';

        $this->db->prepare("
            UPDATE drug_sync_logs SET
                status             = ?,
                medicines_checked  = ?,
                medicines_inserted = ?,
                medicines_updated  = ?,
                medicines_skipped  = ?,
                medicines_failed   = ?,
                completed_at       = NOW()
            WHERE id = ?
        ")->execute([
            $status,
            $stats['total'],
            $stats['inserted'],
            $stats['updated'],
            $stats['skipped'],
            $stats['failed'],
            $logId,
        ]);
    }

    /**
     * Mark the log as failed with an error message.
     */
    public function fail(int $logId, string $message): void
    {
        $this->db->prepare("
            UPDATE drug_sync_logs SET
                status        = 'failed',
                error_message = ?,
                completed_at  = NOW()
            WHERE id = ?
        ")->execute([$message, $logId]);
    }

    // ─── Schema migration ─────────────────────────────────────────────────────

    /**
     * Add medicines_inserted and medicines_skipped to drug_sync_logs if missing.
     * Safe to call multiple times (checks information_schema first).
     */
    private function ensureColumns(): void
    {
        $cols = [
            'medicines_inserted' => 'INT UNSIGNED NOT NULL DEFAULT 0',
            'medicines_skipped'  => 'INT UNSIGNED NOT NULL DEFAULT 0',
        ];

        foreach ($cols as $col => $definition) {
            $check = $this->db->prepare("
                SELECT COUNT(*) FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME   = 'drug_sync_logs'
                  AND COLUMN_NAME  = ?
            ");
            $check->execute([$col]);

            if ((int) $check->fetchColumn() === 0) {
                $this->db->exec(
                    "ALTER TABLE drug_sync_logs ADD COLUMN `{$col}` {$definition}"
                );
            }
        }
    }
}
