#!/usr/bin/env php
<?php

/**
 * PharmaCare — Egyptian Drug Database Importer
 *
 * Usage:
 *   php scripts/import_drugs.php <path-or-url> [options]
 *
 * Options:
 *   --chunk=N    Records per transaction (default: 500, range: 10–2000)
 *   --dry-run    Parse and validate without writing to the database
 *   --force      Skip the backup confirmation prompt
 *
 * Examples:
 *   php scripts/import_drugs.php data/egyptian-drugs.csv
 *   php scripts/import_drugs.php data/egyptian-drugs.csv --dry-run
 *   php scripts/import_drugs.php data/egyptian-drugs.csv --force
 *   php scripts/import_drugs.php https://raw.githubusercontent.com/.../egyptian-drugs.csv
 */

declare(strict_types=1);

// ─── Runtime limits ───────────────────────────────────────────────────────────
ini_set('memory_limit', '256M');
set_time_limit(0);

// ─── Bootstrap ────────────────────────────────────────────────────────────────
$backendDir = dirname(__DIR__) . '/backend';

$envFile = $backendDir . '/.env';
if (file_exists($envFile)) {
    foreach (file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#')) {
            continue;
        }
        if (str_contains($line, '=')) {
            [$k, $v] = explode('=', $line, 2);
            $_ENV[trim($k)] = trim($v);
        }
    }
}

spl_autoload_register(function (string $class) use ($backendDir): void {
    $dirs = [
        $backendDir . '/app/controllers/',
        $backendDir . '/app/models/',
        $backendDir . '/app/middleware/',
        $backendDir . '/app/services/',
        $backendDir . '/app/helpers/',
        $backendDir . '/app/routes/',
        $backendDir . '/config/',
    ];
    foreach ($dirs as $dir) {
        $file = $dir . $class . '.php';
        if (file_exists($file)) {
            require_once $file;
            return;
        }
    }
});

// ─── CLI argument parsing ─────────────────────────────────────────────────────
$args      = array_slice($argv, 1);
$path      = null;
$chunkSize = 500;
$dryRun    = false;
$force     = false;

foreach ($args as $arg) {
    if ($arg === '--dry-run') {
        $dryRun = true;
    } elseif ($arg === '--force') {
        $force = true;
    } elseif (str_starts_with($arg, '--chunk=')) {
        $chunkSize = max(10, min(2000, (int) substr($arg, 8)));
    } elseif ($path === null && !str_starts_with($arg, '--')) {
        $path = $arg;
    }
}

if ($path === null) {
    fwrite(STDERR, implode(PHP_EOL, [
        '',
        'PharmaCare — Egyptian Drug Importer',
        '',
        'Usage:',
        '  php scripts/import_drugs.php <file-or-url> [--chunk=500] [--dry-run] [--force]',
        '',
        'Options:',
        '  <file>      Path to egyptian-drugs.csv or egyptian-drugs.json',
        '  <url>       HTTP/HTTPS URL to download the file from',
        '  --chunk=N   Records per transaction (default: 500)',
        '  --dry-run   Simulate import without writing to the database',
        '  --force     Skip backup confirmation prompt',
        '',
        'Examples:',
        '  php scripts/import_drugs.php data/egyptian-drugs.csv',
        '  php scripts/import_drugs.php data/egyptian-drugs.csv --dry-run',
        '  php scripts/import_drugs.php data/egyptian-drugs.csv --force',
        '',
    ]));
    exit(1);
}

// ─── Header ───────────────────────────────────────────────────────────────────
$boxWidth = 54;
$divider  = str_repeat('═', $boxWidth);
cli_print("╔{$divider}╗");
cli_print("║" . cli_center('PharmaCare  —  Egyptian Drug Importer', $boxWidth) . "║");
cli_print("╚{$divider}╝");
cli_print('');

if ($dryRun) {
    cli_print("  MODE: DRY RUN — no data will be written to the database.");
    cli_print('');
}

// ─── Download if URL ──────────────────────────────────────────────────────────
$downloaded = false;
$tmpFile    = null;
$isUrl      = (bool) preg_match('#^https?://#i', $path);

if ($isUrl) {
    $ext     = strtolower(pathinfo(parse_url($path, PHP_URL_PATH), PATHINFO_EXTENSION)) ?: 'csv';
    $tmpFile = sys_get_temp_dir() . '/egyptian-drugs-' . uniqid() . '.' . $ext;

    cli_print("  Downloading dataset...");
    cli_print("  Source : {$path}");

    $context = stream_context_create([
        'http' => [
            'timeout'         => 300,
            'user_agent'      => 'PharmaCare-Importer/1.0',
            'follow_location' => 1,
        ],
    ]);

    if (!@copy($path, $tmpFile, $context)) {
        $err = error_get_last();
        fatal("Download failed — " . ($err['message'] ?? 'unknown error'));
    }

    $sizeMb = round(filesize($tmpFile) / 1048576, 1);
    cli_print("  Downloaded : {$sizeMb} MB → " . basename($tmpFile));
    cli_print('');
    $path       = $tmpFile;
    $downloaded = true;
}

if (!file_exists($path)) {
    fatal("File not found — {$path}");
}

$ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
if (!in_array($ext, ['csv', 'json'], true)) {
    fatal("Unsupported file type '{$ext}'. Use .csv or .json");
}

$fileSize   = filesize($path);
$fileSizeMb = round($fileSize / 1048576, 1);

// ─── Backup warning + confirmation ───────────────────────────────────────────
if (!$dryRun) {
    $line = str_repeat('─', $boxWidth);
    cli_print("  {$line}");
    cli_print("  WARNING: This operation will modify the medicines table.");
    cli_print("  Please ensure a database backup exists before continuing.");
    cli_print("  {$line}");
    cli_print('');

    if ($force) {
        cli_print("  --force detected. Skipping confirmation.");
        cli_print('');
    } else {
        echo "  Continue? [Y/N]: ";
        $answer = trim((string) fgets(STDIN));
        cli_print('');
        if (strtolower($answer) !== 'y') {
            cli_print('  Aborted. No changes were made.');
            cleanupAndExit(0, $downloaded, $tmpFile);
        }
    }
}

// ─── Connect to database ──────────────────────────────────────────────────────
try {
    $db = Database::getInstance();
} catch (\Throwable $e) {
    fatal("Cannot connect to database — " . $e->getMessage(), $downloaded, $tmpFile);
}

// ─── Schema verification ──────────────────────────────────────────────────────
try {
    DrugImportService::verifySchema($db);
} catch (\RuntimeException $e) {
    fatal($e->getMessage(), $downloaded, $tmpFile);
}

// ─── Init services ────────────────────────────────────────────────────────────
$logger  = new ImportLogger($db);
$service = new DrugImportService($db, $logger, $chunkSize);

// ─── Pre-flight info ──────────────────────────────────────────────────────────
cli_print("  Source  : " . ($isUrl ? "(downloaded) " : '') . basename($path));
cli_print("  Format  : " . strtoupper($ext));
cli_print("  Size    : {$fileSizeMb} MB");
cli_print("  Chunk   : {$chunkSize} records/transaction");
cli_print('');
cli_print("  Reading dataset...");

$reader = $ext === 'json' ? new JsonReader($path, $chunkSize) : new CsvReader($path, $chunkSize);
$total  = $reader->estimateTotal();

cli_print("  Records : " . number_format($total));
cli_print('');
cli_print("  " . ($dryRun ? 'Simulating import...' : 'Starting import...'));
cli_print('');

// ─── Progress callback ────────────────────────────────────────────────────────
$lastPrint = 0.0;
$barWidth  = 38;

$onProgress = function (int $done, int $total, array $stats, float $elapsed) use (&$lastPrint, $barWidth): void {
    $now = microtime(true);
    if ($now - $lastPrint < 0.5 && $done < $total) {
        return;
    }
    $lastPrint = $now;

    $pct  = $total > 0 ? min(100, (int) round($done / $total * 100)) : 0;
    $fill = (int) round($pct / 100 * $barWidth);
    $bar  = str_repeat('█', $fill) . str_repeat('░', $barWidth - $fill);

    $rate = $elapsed > 0 ? $done / $elapsed : 0;
    $eta  = ($rate > 0 && $done < $total) ? (int) ceil(($total - $done) / $rate) : 0;

    $line1 = sprintf(
        "\r  [%s] %3d%%  %s / %s",
        $bar, $pct, number_format($done), number_format($total)
    );
    $line2 = sprintf(
        "\n  Elapsed: %s | ETA: %s | Rate: %s rec/s",
        cli_duration((int) $elapsed),
        $eta > 0 ? cli_duration($eta) : '--:--',
        number_format((int) $rate)
    );
    $line3 = sprintf(
        "\n  Inserted: %s | Updated: %s | Skipped: %s | Failed: %s   ",
        number_format($stats['inserted']),
        number_format($stats['updated']),
        number_format($stats['skipped']),
        number_format($stats['failed'])
    );

    static $firstCall = true;
    if (!$firstCall) {
        echo "\033[2A";
    }
    $firstCall = false;

    echo $line1 . $line2 . $line3;
};

// ─── Run import ───────────────────────────────────────────────────────────────
try {
    $stats = $service->importFile($path, $onProgress, $dryRun);
} catch (\Throwable $e) {
    cli_print('');
    cli_print('');
    fwrite(STDERR, "  FATAL: " . $e->getMessage() . PHP_EOL);
    cleanupAndExit(1, $downloaded, $tmpFile);
}

// ─── Final report ─────────────────────────────────────────────────────────────
echo PHP_EOL . PHP_EOL;

$duration  = cli_duration((int) ($stats['duration'] ?? 0));
$memMb     = round(($stats['peak_memory_bytes'] ?? 0) / 1048576, 1);
$rowsSec   = $stats['duration'] > 0 ? (int) round($stats['total'] / $stats['duration']) : 0;
$totalChunks = ($stats['chunks_ok'] ?? 0) + ($stats['chunks_failed'] ?? 0);
$chunksSec = $stats['duration'] > 0 ? round($totalChunks / $stats['duration'], 1) : 0;

$title = $dryRun ? 'Dry-Run Report (no data written)' : 'Import Complete!';

cli_print("╔{$divider}╗");
cli_print("║" . cli_center($title, $boxWidth) . "║");
cli_print("╠{$divider}╣");
cli_print("║" . cli_row('Source file',   basename($path),             $boxWidth) . "║");
cli_print("║" . cli_row('File size',     "{$fileSizeMb} MB",          $boxWidth) . "║");
cli_print("╠{$divider}╣");
cli_print("║" . cli_row('Rows read',     number_format($stats['total']),                $boxWidth) . "║");
cli_print("║" . cli_row('Inserted',      number_format($stats['inserted']),              $boxWidth) . "║");
cli_print("║" . cli_row('Updated',       number_format($stats['updated']),               $boxWidth) . "║");
cli_print("║" . cli_row('Skipped',       number_format($stats['skipped']),               $boxWidth) . "║");
cli_print("║" . cli_row('  → Invalid',   number_format($stats['validation_failures']),  $boxWidth) . "║");
cli_print("║" . cli_row('Failed',        number_format($stats['failed']),                $boxWidth) . "║");
cli_print("╠{$divider}╣");
cli_print("║" . cli_row('Duplicates',     number_format($stats['updated']),              $boxWidth) . "║");
cli_print("║" . cli_row('Companies new',  number_format($stats['companies_created']),   $boxWidth) . "║");
cli_print("║" . cli_row('Categories new', number_format($stats['categories_created']),  $boxWidth) . "║");
cli_print("╠{$divider}╣");
cli_print("║" . cli_row('Chunks OK',      number_format($stats['chunks_ok']),           $boxWidth) . "║");
cli_print("║" . cli_row('Chunks failed',  number_format($stats['chunks_failed']),       $boxWidth) . "║");
cli_print("╠{$divider}╣");
cli_print("║" . cli_row('Execution time', $duration,                                    $boxWidth) . "║");
cli_print("║" . cli_row('Peak memory',    "{$memMb} MB",                                $boxWidth) . "║");
cli_print("║" . cli_row('Rows/sec',       number_format($rowsSec),                      $boxWidth) . "║");
cli_print("║" . cli_row('Chunks/sec',     number_format($chunksSec, 1),                 $boxWidth) . "║");
cli_print("╚{$divider}╝");
cli_print('');

if ($dryRun) {
    cli_print('  DRY RUN complete — no changes were made to the database.');
    cli_print('  Run without --dry-run to perform the actual import.');
    cli_print('');
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────
cleanupAndExit($stats['failed'] > 0 ? 2 : 0, $downloaded, $tmpFile);

// ─── Helper functions ─────────────────────────────────────────────────────────

function cli_print(string $text): void
{
    echo $text . PHP_EOL;
}

function cli_center(string $text, int $width): string
{
    $len = mb_strlen($text, 'UTF-8');
    if ($len >= $width) {
        return $text;
    }
    $pad   = $width - $len;
    $left  = (int) floor($pad / 2);
    $right = $pad - $left;
    return str_repeat(' ', $left) . $text . str_repeat(' ', $right);
}

function cli_row(string $label, string $value, int $width): string
{
    $label = "  {$label}";
    $value = "{$value}  ";
    $dots  = $width - mb_strlen($label, 'UTF-8') - mb_strlen($value, 'UTF-8');
    return $label . str_repeat('.', max(1, $dots)) . $value;
}

function cli_duration(int $seconds): string
{
    $h = intdiv($seconds, 3600);
    $m = intdiv($seconds % 3600, 60);
    $s = $seconds % 60;
    return $h > 0
        ? sprintf('%dh %02dm %02ds', $h, $m, $s)
        : sprintf('%dm %02ds', $m, $s);
}

function fatal(string $message, bool $downloaded = false, ?string $tmpFile = null): never
{
    fwrite(STDERR, "  ERROR: {$message}" . PHP_EOL);
    cleanupAndExit(1, $downloaded, $tmpFile);
}

function cleanupAndExit(int $code, bool $downloaded, ?string $tmpFile): never
{
    if ($downloaded && $tmpFile !== null && file_exists($tmpFile)) {
        @unlink($tmpFile);
    }
    exit($code);
}
