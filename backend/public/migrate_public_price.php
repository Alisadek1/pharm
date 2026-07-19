<?php
// One-time migration: backfill public_price from selling_price for existing records
// Run once at: https://pharm-app-production.up.railway.app/migrate_public_price.php
// DELETE this file after running.

$secret = $_GET['secret'] ?? '';
if ($secret !== 'backfill2026') {
    http_response_code(403);
    die('Forbidden');
}

require_once __DIR__ . '/../bootstrap.php';

try {
    $db = Database::getInstance();

    $db->exec("SET SESSION sql_mode = (SELECT REPLACE(@@sql_mode, 'ONLY_FULL_GROUP_BY', ''))");

    // Medicines: set public_price = selling_price where public_price is 0 or null
    $medResult = $db->exec("
        UPDATE medicines
        SET public_price = selling_price
        WHERE (public_price IS NULL OR public_price = 0) AND selling_price > 0
    ");

    // Batches: same
    $batchResult = $db->exec("
        UPDATE medicine_batches
        SET public_price = selling_price
        WHERE (public_price IS NULL OR public_price = 0) AND selling_price > 0
    ");

    // Purchase items: same
    $piResult = $db->exec("
        UPDATE purchase_items
        SET public_price = selling_price
        WHERE (public_price IS NULL OR public_price = 0) AND selling_price > 0
    ");

    echo json_encode([
        'success' => true,
        'medicines_updated'       => $medResult,
        'batches_updated'         => $batchResult,
        'purchase_items_updated'  => $piResult,
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
