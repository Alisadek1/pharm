#!/usr/bin/env php
<?php

/**
 * PharmaCare — Egyptian Drug Database Importer
 *
 * Usage:
 *   php scripts/import_drugs.php <path-or-url>  [--chunk=500]
 *
 * Examples:
 *   php scripts/import_drugs.php data/egyptian-drugs.csv
 *   php scripts/import_drugs.php data/egyptian-drugs.json
 *   php scripts/import_drugs.php https://raw.githubusercontent.com/karem505/egyptian-drug-database/main/data/egyptian-drugs.csv
 *   php scripts/import_drugs.php https://... --chunk=200
 */

declare(strict_types=1);

// ─── Runtime limits ───────────────────────────────────────────────────────────
ini_set('memory_limit', '256M');
set_time_limit(0);

// ─── Bootstrap ────────────────────────────────────────────────────────────────
$backendDir = dirname(__DIR__) . '/backend';

// Load .env
$envFile = $backendDir . '/.env';
if (file_exists($envFile)) {
    foreach (file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#')) continue;
        if (str_contains($line, '=')) {
            [$k, $v] = explode('=', $line, 2);
            $_ENV[trim($k)] = trim($v);
        }
    }
}

// Autoloader — mirrors the one in backend/public/index.php
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

foreach ($args as $arg) {
    if (str_starts_with($arg, '--chunk=')) {
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
        '  php scripts/import_drugs.php <file-or-url> [--chunk=500]',
        '',
        'Arguments:',
        '  <file>    Path to egyptian-drugs.csv or egyptian-drugs.json',
        '  <url>     HTTP/HTTPS URL to download the file from',
        '  --chunk   Records per transaction (default: 500)',
        '',
        'Examples:',
        '  php scripts/import_drugs.php data/egyptian-drugs.csv',
        '  php scripts/import_drugs.php https://raw.githubusercontent.com/karem505/egyptian-drug-database/main/data/egyptian-drugs.csv',
        '',
    ]));
    exit(1);
}

// ─── Header ───────────────────────────────────────────────────────────────────
$line = str_repeat('═', 54);
cli_print("╔{$line}╗");
cli_print("║" . cli_center('PharmaCare  —  Egyptian Drug Importer', 54) . "║");
cli_print("╚{$line}╝");
cli_print('');

// ─── Download if URL ──────────────────────────────────────────────────────────
$downloaded  = false;
$tmpFile     = null;
$isUrl       = preg_match('#^https?://#i', $path);

if ($isUrl) {
    $ext     = strtolower(pathinfo(parse_url($path, PHP_URL_PATH), PATHINFO_EXTENSION)) ?: 'csv';
    $tmpFile = sys_get_temp_dir() . '/egyptian-drugs-' . uniqid() . '.' . $ext;

    cli_print("  Downloading dataset...");
    cli_print("  Source : {$path}");

    $context = stream_context_create([
        'http' => [
            'timeout'       => 300,
            'user_agent'    => 'PharmaCare-Importer/1.0',
            'follow_location' => 1,
        ],
    ]);

    if (!@copy($path, $tmpFile, $context)) {
        $err = error_get_last();
        fwrite(STDERR, "  ERROR: Download failed — " . ($err['message'] ?? 'unknown error') . PHP_EOL);
        exit(1);
    }

    $size = number_format(filesize($tmpFile) / 1048576, 1);
    cli_print("  Downloaded : {$size} MB → " . basename($tmpFile));
    cli_print('');
    $path       = $tmpFile;
    $downloaded = true;
}

if (!file_exists($path)) {
    fwrite(STDERR, "  ERROR: File not found — {$path}" . PHP_EOL);
    exit(1);
}

$ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
if (!in_array($ext, ['csv', 'json'], true)) {
    fwrite(STDERR, "  ERROR: Unsupported file type '{$ext}'. Use .csv or .json" . PHP_EOL);
    exit(1);
}

// ─── Connect to database ──────────────────────────────────────────────────────
try {
    $db = Database::getInstance();
} catch (\Throwable $e) {
    fwrite(STDERR, "  ERROR: Cannot connect to database — " . $e->getMessage() . PHP_EOL);
    if ($downloaded && $tmpFile) @unlink($tmpFile);
    exit(1);
}

// ─── Init services ────────────────────────────────────────────────────────────
$logger  = new ImportLogger($db);
$service = new DrugImportService($db, $logger, $chunkSize);

// ─── Pre-flight info ──────────────────────────────────────────────────────────
cli_print("  Source  : " . ($isUrl ? "(downloaded) " : '') . basename($path));
cli_print("  Format  : " . strtoupper($ext));
cli_print("  Chunk   : {$chunkSize} records/transaction");
cli_print('');
cli_print("  Reading dataset...");

$reader  = $ext === 'json' ? new JsonReader($path, $chunkSize) : new CsvReader($path, $chunkSize);
$total   = $reader->estimateTotal();

cli_print("  Records : " . number_format($total));
cli_print('');
cli_print("  Starting import...");
cli_print('');

// ─── Progress callback ────────────────────────────────────────────────────────
$lastPrint = 0;
$barWidth  = 38;

$onProgress = function (int $done, int $total, array $stats, float $elapsed) use (&$lastPrint, $barWidth): void {
    $now = microtime(true);
    if ($now - $lastPrint < 0.5 && $done < $total) {
        return; // throttle to ~2 redraws/sec
    }
    $lastPrint = $now;

    $pct  = $total > 0 ? min(100, (int) round($done / $total * 100)) : 0;
    $fill = (int) round($pct / 100 * $barWidth);
    $bar  = str_repeat('█', $fill) . str_repeat('░', $barWidth - $fill);

    $rate = $elapsed > 0 ? $done / $elapsed : 0;
    $eta  = ($rate > 0 && $done < $total) ? (int) ceil(($total - $done) / $rate) : 0;

    $line1 = sprintf(
        "\r  [%s] %3d%%  %s / %s",
        $bar,
        $pct,
        number_format($done),
        number_format($total)
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

    // Move cursor up 2 lines to overwrite previous progress block
    static $firstCall = true;
    if (!$firstCall) {
        echo "\033[2A";
    }
    $firstCall = false;

    echo $line1 . $line2 . $line3;
};

// ─── Run import ───────────────────────────────────────────────────────────────
try {
    $stats = $service->importFile($path, $onProgress);
} catch (\Throwable $e) {
    cli_print('');
    cli_print('');
    fwrite(STDERR, "  FATAL: " . $e->getMessage() . PHP_EOL);
    if ($downloaded && $tmpFile) @unlink($tmpFile);
    exit(1);
}

// ─── Final summary ────────────────────────────────────────────────────────────
echo PHP_EOL . PHP_EOL;

$duration = cli_duration((int) ($stats['duration'] ?? 0));
$line     = str_repeat('═', 54);

cli_print("╔{$line}╗");
cli_print("║" . cli_center('Import Complete!', 54) . "║");
cli_print("╠{$line}╣");
cli_print("║" . cli_row('Total records',  number_format($stats['total']),    54) . "║");
cli_print("║" . cli_row('Inserted',        number_format($stats['inserted']), 54) . "║");
cli_print("║" . cli_row('Updated',         number_format($stats['updated']),  54) . "║");
cli_print("║" . cli_row('Skipped',         number_format($stats['skipped']),  54) . "║");
cli_print("║" . cli_row('Failed',          number_format($stats['failed']),   54) . "║");
cli_print("║" . str_repeat(' ', 54) . "║");
cli_print("║" . cli_row('Duration',        $duration,                         54) . "║");
cli_print("╚{$line}╝");
cli_print('');

// ─── Cleanup ──────────────────────────────────────────────────────────────────
if ($downloaded && $tmpFile && file_exists($tmpFile)) {
    @unlink($tmpFile);
}

exit($stats['failed'] > 0 ? 2 : 0);

// ─── Helper functions ─────────────────────────────────────────────────────────

function cli_print(string $text): void
{
    echo $text . PHP_EOL;
}

function cli_center(string $text, int $width): string
{
    $len = mb_strlen($text, 'UTF-8');
    if ($len >= $width) return $text;
    $pad   = $width - $len;
    $left  = (int) floor($pad / 2);
    $right = $pad - $left;
    return str_repeat(' ', $left) . $text . str_repeat(' ', $right);
}

function cli_row(string $label, string $value, int $width): string
{
    $label   = "  {$label}";
    $value   = "{$value}  ";
    $dots    = $width - mb_strlen($label, 'UTF-8') - mb_strlen($value, 'UTF-8');
    $dots    = max(1, $dots);
    return $label . str_repeat('.', $dots) . $value;
}

function cli_duration(int $seconds): string
{
    $h = intdiv($seconds, 3600);
    $m = intdiv($seconds % 3600, 60);
    $s = $seconds % 60;
    if ($h > 0) {
        return sprintf('%dh %02dm %02ds', $h, $m, $s);
    }
    return sprintf('%dm %02ds', $m, $s);
}
