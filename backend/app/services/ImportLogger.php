<?php

declare(strict_types=1);

/**
 * Manages drug_sync_logs entries for a file-based drug import.
 *
 * Requires migration_v4.sql to have been applied first (adds the
 * medicines_inserted and medicines_skipped columns used by finish()).
 */
class ImportLogger
{
    private PDO $db;

    public function __construct(PDO $db)
    {
        $this->db = $db;
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
}
