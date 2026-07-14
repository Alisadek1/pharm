<?php

declare(strict_types=1);

class DrugSyncService
{
    private PDO                  $db;
    private DrugProviderInterface $provider;
    private int                  $logId;

    public function __construct(PDO $db, DrugProviderInterface $provider, int $logId)
    {
        $this->db       = $db;
        $this->provider = $provider;
        $this->logId    = $logId;
    }

    public function syncAll(): array
    {
        $drugs   = $this->provider->fetchAll();
        $checked = count($drugs);
        $updated = 0;
        $failed  = 0;

        foreach ($drugs as $drug) {
            try {
                if ($this->syncDrug($drug)) {
                    $updated++;
                }
            } catch (Exception) {
                $failed++;
            }
        }

        return compact('checked', 'updated', 'failed');
    }

    public function syncByBarcode(string $barcode): bool
    {
        $drug = $this->provider->lookupByBarcode($barcode);
        if (!$drug) return false;
        return $this->syncDrug($drug);
    }

    private function syncDrug(array $drug): bool
    {
        // Match strategy: barcode → GTIN → saudi_drug_code → name
        $medicine = $this->findMedicine($drug);
        if (!$medicine) return false;

        $updates = [];
        $binds   = [];

        if (isset($drug['public_price']) && $drug['public_price'] > 0) {
            $updates[] = 'public_price = ?';
            $binds[]   = round($drug['public_price'], 3);
        }

        if (empty($updates)) return false;

        $binds[]  = $medicine['id'];
        $this->db->prepare('UPDATE medicines SET ' . implode(', ', $updates) . ' WHERE id = ?')
                 ->execute($binds);

        return true;
    }

    private function findMedicine(array $drug): ?array
    {
        // Try barcode first
        if (!empty($drug['barcode'])) {
            $stmt = $this->db->prepare('SELECT id FROM medicines WHERE barcode = ? AND is_active = 1 LIMIT 1');
            $stmt->execute([$drug['barcode']]);
            $row = $stmt->fetch();
            if ($row) return $row;
        }

        // Try GTIN
        if (!empty($drug['gtin']) && $drug['gtin'] !== $drug['barcode']) {
            $stmt = $this->db->prepare('SELECT id FROM medicines WHERE barcode = ? AND is_active = 1 LIMIT 1');
            $stmt->execute([$drug['gtin']]);
            $row = $stmt->fetch();
            if ($row) return $row;
        }

        // Try name match (fuzzy)
        if (!empty($drug['drug_name'])) {
            $stmt = $this->db->prepare('SELECT id FROM medicines WHERE name LIKE ? AND is_active = 1 LIMIT 1');
            $stmt->execute(['%' . $drug['drug_name'] . '%']);
            $row = $stmt->fetch();
            if ($row) return $row;
        }

        return null;
    }
}
