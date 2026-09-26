#!/usr/bin/env php
<?php
/**
 * Import dwaprices medicine data into the PharmaCare MySQL database.
 *
 * Usage:
 *   php scripts/import_dwa_medicines.php <path-to-medicines_for_pharm.json> [--dry-run]
 *
 * Run convert_for_pharm.py first to generate the input file.
 */
declare(strict_types=1);

// ── Bootstrap ──────────────────────────────────────────────────────────────────
$root = dirname(__DIR__) . '/backend';

// Load .env
$envFile = $root . '/.env';
if (file_exists($envFile)) {
    foreach (file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        if (str_starts_with(trim($line), '#') || !str_contains($line, '=')) continue;
        [$k, $v] = explode('=', $line, 2);
        $_ENV[trim($k)] = trim($v);
    }
}

// Autoloader
spl_autoload_register(function (string $class) use ($root): void {
    foreach ([
        $root . '/app/controllers/',
        $root . '/app/services/',
        $root . '/app/helpers/',
        $root . '/config/',
    ] as $dir) {
        $f = $dir . $class . '.php';
        if (file_exists($f)) { require_once $f; return; }
    }
});

// ── Args ───────────────────────────────────────────────────────────────────────
$args   = array_slice($argv, 1);
$dryRun = in_array('--dry-run', $args, true);
$args   = array_values(array_filter($args, fn($a) => $a !== '--dry-run'));
$file   = $args[0] ?? null;

if ($file === null) {
    fwrite(STDERR, "Usage: php scripts/import_dwa_medicines.php <medicines_for_pharm.json> [--dry-run]\n");
    exit(1);
}

if (!file_exists($file)) {
    fwrite(STDERR, "File not found: $file\n");
    exit(1);
}

// ── DB connection ──────────────────────────────────────────────────────────────
$dsn = sprintf(
    'mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4',
    $_ENV['DB_HOST'] ?? 'localhost',
    $_ENV['DB_PORT'] ?? '3306',
    $_ENV['DB_NAME'] ?? 'pharm_db'
);
$db = new PDO($dsn, $_ENV['DB_USER'] ?? 'root', $_ENV['DB_PASS'] ?? '', [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,
]);
$db->exec("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci");
$db->exec("SET SESSION sql_mode = (SELECT REPLACE(@@sql_mode,'ONLY_FULL_GROUP_BY',''))");

DrugImportService::verifySchema($db);

// ── Run import ─────────────────────────────────────────────────────────────────
$logger  = new ImportLogger($db);
$service = new DrugImportService($db, $logger, chunkSize: 500);

$width = 60;
$bar   = function (int $done, int $total) use ($width): string {
    $pct   = $total > 0 ? $done / $total : 0;
    $fill  = (int) round($pct * $width);
    $empty = $width - $fill;
    return sprintf(
        "\r[%s%s] %5.1f%%  %s/%s",
        str_repeat('#', $fill),
        str_repeat('-', $empty),
        $pct * 100,
        number_format($done),
        number_format($total)
    );
};

echo ($dryRun ? '[DRY RUN] ' : '') . "Importing $file ...\n";
$start = microtime(true);

$stats = $service->importFile(
    $file,
    onProgress: function (int $done, int $total, array $s, float $elapsed) use ($bar): void {
        echo $bar($done, $total);
    },
    dryRun: $dryRun
);

echo "\n\n";

// ── Summary ────────────────────────────────────────────────────────────────────
$D = str_repeat('-', 50);
$elapsed = round(microtime(true) - $start, 1);

echo str_repeat('=', 50) . "\n";
echo "  PharmaCare -- dwaprices Import " . ($dryRun ? '(DRY RUN) ' : '') . "Complete\n";
echo str_repeat('=', 50) . "\n";
printf("  Duration          : %ss\n", $elapsed);
printf("  File              : %s\n", basename($file));
echo "$D\n";
printf("  Total records     : %s\n", number_format($stats['total']));
printf("  Inserted (new)    : %s\n", number_format($stats['inserted']));
printf("  Updated (existing): %s\n", number_format($stats['updated']));
printf("  Skipped           : %s\n", number_format($stats['skipped']));
printf("  Failed            : %s\n", number_format($stats['failed']));
printf("  Validation errors : %s\n", number_format($stats['validation_failures']));
echo "$D\n";
printf("  Categories created: %s\n", number_format($stats['categories_created']));
printf("  Companies created : %s\n", number_format($stats['companies_created']));
echo str_repeat('=', 50) . "\n";

exit($stats['failed'] > 0 ? 1 : 0);
