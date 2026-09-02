<?php
/**
 * SKU Backfill Script — generates MED-XXXXXXXX for medicines with no local barcode.
 *
 * Usage:
 *   php backfill_sku.php          → dry-run (shows count, no changes)
 *   php backfill_sku.php --apply  → writes to DB inside a transaction
 *
 * Safe to re-run: only touches rows where sku IS NULL or sku = ''.
 */

declare(strict_types=1);

$apply = in_array('--apply', $argv ?? [], true);

$host = '127.0.0.1';
$port = 3307;
$db   = 'pharm_db';
$user = 'root';
$pass = '';

try {
    $pdo = new PDO(
        "mysql:host={$host};port={$port};dbname={$db};charset=utf8mb4",
        $user, $pass,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );
} catch (PDOException $e) {
    die("DB connection failed: " . $e->getMessage() . "\n");
}

$missing = (int)$pdo->query("SELECT COUNT(*) FROM medicines WHERE sku IS NULL OR sku = ''")->fetchColumn();
echo "Medicines missing SKU: {$missing}\n";

if ($missing === 0) {
    echo "Nothing to do.\n";
    exit(0);
}

if (!$apply) {
    echo "Dry-run complete. Run with --apply to write changes.\n";
    exit(0);
}

echo "Applying backfill...\n";

$rows = $pdo->query("SELECT id FROM medicines WHERE sku IS NULL OR sku = ''")->fetchAll(PDO::FETCH_COLUMN);

$pdo->beginTransaction();
try {
    $update = $pdo->prepare("UPDATE medicines SET sku = ? WHERE id = ?");
    $check  = $pdo->prepare("SELECT id FROM medicines WHERE sku = ?");

    $filled = 0;
    foreach ($rows as $id) {
        // Generate a unique SKU with collision retry
        do {
            $sku = 'MED-' . strtoupper(bin2hex(random_bytes(4)));
            $check->execute([$sku]);
        } while ($check->fetch());

        $update->execute([$sku, (int)$id]);
        $filled++;

        if ($filled % 1000 === 0) {
            echo "  {$filled} / {$missing} done...\n";
        }
    }

    $pdo->commit();
    echo "Done. {$filled} medicines updated.\n";

    // Verify
    $stillMissing = (int)$pdo->query("SELECT COUNT(*) FROM medicines WHERE sku IS NULL OR sku = ''")->fetchColumn();
    echo "Remaining with no SKU: {$stillMissing}\n";
} catch (Exception $e) {
    $pdo->rollBack();
    die("Backfill failed — rolled back. Error: " . $e->getMessage() . "\n");
}
