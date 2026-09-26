#!/usr/bin/env php
<?php
/**
 * Deep investigation of drug_class field.
 * Shows raw values, separator patterns, and whether first-segment logic is working.
 */
declare(strict_types=1);

$csvPath = $argv[1] ?? (dirname(__DIR__) . '/data/egyptian-drugs.csv');
if (!file_exists($csvPath)) { fwrite(STDERR, "Not found: $csvPath\n"); exit(1); }

$fh = fopen($csvPath, 'r');
$header  = array_map('trim', fgetcsv($fh));
$colMap  = array_flip($header);
$iCls    = $colMap['drug_class'] ?? null;

if ($iCls === null) { fwrite(STDERR, "No drug_class column\n"); exit(1); }

// ─── Collect raw values ───────────────────────────────────────────────────────
$rawCounts    = [];   // raw drug_class → count
$withDot      = [];   // raw values that contain a dot
$withoutDot   = [];   // raw values with no dot
$nullOrEmpty  = 0;

while (($row = fgetcsv($fh)) !== false) {
    $raw = trim($row[$iCls] ?? '');
    if ($raw === '' || strtolower($raw) === 'null' || $raw === '.' || $raw === '-') {
        $nullOrEmpty++;
        continue;
    }
    $rawCounts[$raw] = ($rawCounts[$raw] ?? 0) + 1;
    if (str_contains($raw, '.')) {
        $withDot[$raw] = ($withDot[$raw] ?? 0) + 1;
    } else {
        $withoutDot[$raw] = ($withoutDot[$raw] ?? 0) + 1;
    }
}
fclose($fh);

arsort($rawCounts);
arsort($withDot);
arsort($withoutDot);

// ─── First-segment extraction ──────────────────────────────────────────────────
$firstSegments = [];
foreach ($rawCounts as $_raw => $cnt) {
    $raw     = (string) $_raw;
    $dotPos  = strpos($raw, '.');
    $segment = $dotPos !== false ? trim(substr($raw, 0, $dotPos)) : $raw;
    if ($segment === '') continue;
    $firstSegments[$segment] = ($firstSegments[$segment] ?? 0) + $cnt;
}
arsort($firstSegments);

// ─── How many unique first-segments from dotted vs non-dotted? ───────────────
$dotFirstSegs    = [];
$noDotFirstSegs  = [];
foreach ($withDot as $_raw => $cnt) {
    $raw = (string) $_raw;
    $seg = trim(substr($raw, 0, strpos($raw, '.')));
    if ($seg !== '') $dotFirstSegs[$seg] = ($dotFirstSegs[$seg] ?? 0) + $cnt;
}
foreach ($withoutDot as $_raw => $cnt) {
    $raw = (string) $_raw;
    $noDotFirstSegs[$raw] = ($noDotFirstSegs[$raw] ?? 0) + $cnt;
}
arsort($dotFirstSegs);
arsort($noDotFirstSegs);

// ─── Report ───────────────────────────────────────────────────────────────────
$D = str_repeat('─', 60);

echo "\n";
echo "════════════════════════════════════════════════════════════\n";
echo "            drug_class Field — Deep Investigation           \n";
echo "════════════════════════════════════════════════════════════\n\n";

echo "OVERVIEW\n{$D}\n";
printf("  Total non-null valid rows ........... %s\n", number_format(array_sum($rawCounts)));
printf("  Null / empty / marker rows .......... %s\n", number_format($nullOrEmpty));
printf("  Unique RAW drug_class values ........ %s\n", number_format(count($rawCounts)));
printf("  Rows WITH a dot in drug_class ....... %s\n", number_format(array_sum($withDot)));
printf("  Rows WITHOUT a dot in drug_class .... %s\n", number_format(array_sum($withoutDot)));
printf("  Unique values WITH dot .............. %s\n", number_format(count($withDot)));
printf("  Unique values WITHOUT dot ........... %s\n\n", number_format(count($withoutDot)));

echo "FIRST-SEGMENT RESULT (after extracting before '.')\n{$D}\n";
printf("  Unique first-segments (all rows) .... %s\n", number_format(count($firstSegments)));
printf("  Unique first-segs from DOTTED rows .. %s\n", number_format(count($dotFirstSegs)));
printf("  Unique values from NON-DOTTED rows .. %s\n\n", number_format(count($noDotFirstSegs)));

// ─── Are non-dotted values already "top-level" or are they sub-classes? ──────
// Cross-reference: which non-dotted values ALSO appear as a first-segment of dotted values?
$crossRef = array_intersect_key($noDotFirstSegs, $dotFirstSegs);
echo "CROSS-REFERENCE\n{$D}\n";
printf("  Non-dotted values that ARE also a first-segment\n");
printf("  of dotted values (already correct top-level) ....... %s\n", number_format(count($crossRef)));
printf("  Non-dotted values NOT appearing in dotted first-segs\n");
printf("  (granular/orphan values) ........................... %s\n\n",
    number_format(count($noDotFirstSegs) - count($crossRef)));

// ─── Top 100 final first-segments ─────────────────────────────────────────────
echo "TOP 100 FIRST-SEGMENTS (the categories the import will create)\n{$D}\n";
$i = 0;
foreach ($firstSegments as $seg => $cnt) {
    if (++$i > 100) break;
    $source = isset($dotFirstSegs[$seg])   ? (isset($noDotFirstSegs[$seg]) ? 'both' : 'dot')
                                           : 'nodot';
    printf("  %3d. %-42s %5d  [%s]\n", $i, mb_substr($seg, 0, 42, 'UTF-8'), $cnt, $source);
}
echo "\n";

// ─── Top 50 non-dotted values that are NOT first-segs of dotted rows ──────────
$orphans = array_diff_key($noDotFirstSegs, $dotFirstSegs);
arsort($orphans);
echo "TOP 50 NON-DOTTED VALUES THAT HAVE NO DOTTED COUNTERPART\n";
echo "(These are granular classes that inflate the category count)\n{$D}\n";
$j = 0;
foreach ($orphans as $val => $cnt) {
    if (++$j > 50) break;
    printf("  %3d. %-50s %5d\n", $j, mb_substr($val, 0, 50, 'UTF-8'), $cnt);
}
echo "\n";

// ─── Sample raw values for top 20 dotted entries ──────────────────────────────
echo "SAMPLE RAW DOTTED VALUES (to confirm separator is '.') \n{$D}\n";
$k = 0;
foreach ($withDot as $raw => $cnt) {
    if (++$k > 20) break;
    printf("  %2d. %-55s %5d\n", $k, mb_substr($raw, 0, 55, 'UTF-8'), $cnt);
}
echo "\n";

// ─── Character inspection of a few raw values ─────────────────────────────────
echo "CHARACTER INSPECTION (first 5 unique raw values — checking for hidden separators)\n{$D}\n";
$m = 0;
foreach (array_keys($rawCounts) as $_raw) {
    if (++$m > 5) break;
    $raw   = (string) $_raw;
    $bytes = [];
    for ($n = 0; $n < strlen($raw) && $n < 80; $n++) {
        $b = ord($raw[$n]);
        if ($b > 32 && $b < 127) $bytes[] = $raw[$n];
        else $bytes[] = sprintf('[%02X]', $b);
    }
    echo "  RAW: " . mb_substr($raw, 0, 60, 'UTF-8') . "\n";
    echo "  HEX: " . implode(' ', $bytes) . "\n\n";
}
