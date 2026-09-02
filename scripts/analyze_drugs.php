#!/usr/bin/env php
<?php

/**
 * CSV-only analysis: counts unique companies and categories after applying
 * the EXACT same extraction/normalization logic as DrugMapper and DrugImportService.
 *
 * No database connection required.
 *
 * Usage:
 *   php scripts/analyze_drugs.php [path-to-csv]
 *
 * Defaults to data/egyptian-drugs.csv if no path is given.
 */

declare(strict_types=1);

ini_set('memory_limit', '128M');

// ─── Path ─────────────────────────────────────────────────────────────────────
$csvPath = $argv[1] ?? (dirname(__DIR__) . '/data/egyptian-drugs.csv');

if (!file_exists($csvPath)) {
    fwrite(STDERR, "File not found: {$csvPath}\n");
    exit(1);
}

// ─── Inline extraction logic (mirrors DrugMapper + DrugImportService) ─────────

/** CATEGORY_ALIASES — must stay in sync with DrugMapper::CATEGORY_ALIASES */
const CATEGORY_ALIASES = [
    'multivitamins'         => 'MULTIVITAMIN',
    'vitamins'              => 'VITAMIN',
    'nsaids'                => 'NSAID',
    'antihypertensive'      => 'ANTI-HYPERTENSIVE',
    'antibiotics'           => 'ANTIBIOTIC',
    'analgesics'            => 'ANALGESIC',
    'antipyretics'          => 'ANTIPYRETIC',
    'antiemetics'           => 'ANTIEMETIC',
    'antifungals'           => 'ANTIFUNGAL',
    'antivirals'            => 'ANTI-VIRAL',
    'antiepileptics'        => 'ANTI-EPILEPTIC',
    'antirheumatics'        => 'ANTI-RHEUMATIC',
    'antihyperlipidemics'   => 'ANTIHYPERLIPIDEMIC',
    'bronchodilators'       => 'BRONCHODILATOR',
    'glucocorticoids'       => 'GLUCOCORTICOID',
    'anticoagulants'        => 'ANTICOAGULANT',
    'antidepressants'       => 'ANTIDEPRESSANT',
    'antipsychotics'        => 'ANTIPSYCHOTIC',
    'antihistamine'         => 'ANTI-HISTAMINE',
    'antihistamines'        => 'ANTI-HISTAMINE',
    'antiviral'             => 'ANTI-VIRAL',
    'antiepileptic'         => 'ANTI-EPILEPTIC',
    'antirheumatic'         => 'ANTI-RHEUMATIC',
    'antiacne'              => 'ANTI-ACNE',
    'antihyperlipidemic'    => 'ANTIHYPERLIPIDEMIC',
    'massagecream'          => 'MASSAGE',
    'massagegel'            => 'MASSAGE',
    'massageoil'            => 'MASSAGE',
    'whiteningtopical'      => 'SKIN CARE',
    'moisturizingtopical'   => 'SKIN CARE',
];

const INVALID_CATEGORY_MARKERS = ['.', '-', 'null', 'n/a', 'na', 'none', 'unknown'];

function extractCompanyName(string $raw): string
{
    $raw = trim($raw);
    if ($raw === '') return '';
    if (str_starts_with($raw, '> ')) return trim(substr($raw, 2));
    $arrowPos = strpos($raw, ' > ');
    if ($arrowPos !== false) return trim(substr($raw, 0, $arrowPos));
    return $raw;
}

function extractCategoryFirstSegment(string $raw): ?string
{
    $raw = trim($raw);
    $dotPos = strpos($raw, '.');
    if ($dotPos !== false) $raw = trim(substr($raw, 0, $dotPos));
    if ($raw === '') return null;
    if (in_array(strtolower($raw), INVALID_CATEGORY_MARKERS, true)) return null;
    $aliasKey = preg_replace('/[^a-z]/u', '', mb_strtolower($raw, 'UTF-8'));
    if (isset(CATEGORY_ALIASES[$aliasKey])) return CATEGORY_ALIASES[$aliasKey];
    return $raw;
}

/** Same as DrugImportService::companyKey — strips all non-alphanumeric */
function companyKey(string $name): string
{
    return (string) preg_replace('/[^a-z0-9\x{0600}-\x{06FF}]/u', '', mb_strtolower($name, 'UTF-8'));
}

/** Same as DrugMapper::normalizeForKey */
function normalizeForKey(string $text): string
{
    if ($text === '') return '';
    $text = (string) preg_replace('/[\x{00AD}\x{200B}-\x{200D}\x{FEFF}]/u', '', $text);
    // normalizeArabic inline
    $text = str_replace("\u{0640}", '', $text);
    $text = str_replace(["\u{0622}", "\u{0623}", "\u{0625}", "\u{0671}"], "\u{0627}", $text);
    $text = str_replace("\u{0649}", "\u{064A}", $text);
    $text = str_replace("\u{0629}", "\u{0647}", $text);
    $text = mb_strtolower(trim($text), 'UTF-8');
    return (string) preg_replace('/\s+/u', ' ', $text);
}

// ─── Collect counts ───────────────────────────────────────────────────────────
$companyKeys      = [];   // companyKey → display name
$categoryKeys     = [];   // normalizeForKey → display name
$companyCounts    = [];   // companyKey → row count
$categoryCounts   = [];   // normalizeForKey → row count
$nullCategoryRows = 0;
$totalRows        = 0;
$arrowRows        = 0;    // rows with "A > B" notation (including leading >)
$dotRows          = 0;    // rows where drug_class has a dot (sub-category paths)

$fh = fopen($csvPath, 'r');
if ($fh === false) {
    fwrite(STDERR, "Cannot open: {$csvPath}\n");
    exit(1);
}

$header = fgetcsv($fh);
$header = array_map('trim', $header);
$colMap = array_flip($header);

$iMfr   = $colMap['manufacturer'] ?? null;
$iCls   = $colMap['drug_class']   ?? null;
$iName  = $colMap['commercial_name_en'] ?? null;

while (($row = fgetcsv($fh)) !== false) {
    $totalRows++;
    $mfr = isset($iMfr) ? trim($row[$iMfr] ?? '') : '';
    $cls = isset($iCls) ? trim($row[$iCls] ?? '') : '';

    // — Company —
    if (str_contains($mfr, ' > ') || str_starts_with($mfr, '> ')) {
        $arrowRows++;
    }
    $company = extractCompanyName($mfr);
    if ($company !== '') {
        $ck = companyKey($company);
        $companyKeys[$ck]   = $company;
        $companyCounts[$ck] = ($companyCounts[$ck] ?? 0) + 1;
    }

    // — Category —
    if (str_contains($cls, '.')) {
        $dotRows++;
    }
    $category = extractCategoryFirstSegment($cls);
    if ($category === null) {
        $nullCategoryRows++;
    } else {
        $nk = normalizeForKey($category);
        $categoryKeys[$nk]   = $category;
        $categoryCounts[$nk] = ($categoryCounts[$nk] ?? 0) + 1;
    }
}
fclose($fh);

arsort($companyCounts);
arsort($categoryCounts);

// ─── Report ───────────────────────────────────────────────────────────────────
$divider = str_repeat('═', 56);

echo "\n╔{$divider}╗\n";
echo "║" . center('Egyptian Drug Database — Extraction Analysis', 56) . "║\n";
echo "╚{$divider}╝\n\n";

echo row_fmt('Total rows read',    number_format($totalRows));
echo row_fmt('Rows with A>B mfr', number_format($arrowRows));
echo row_fmt('Rows with . class', number_format($dotRows));
echo "\n";

$uniqueCompanies  = count($companyCounts);
$uniqueCategories = count($categoryCounts);

echo row_fmt('Unique companies (after extraction + companyKey)',   number_format($uniqueCompanies));
echo row_fmt('Unique categories (after 1st-segment + alias map)', number_format($uniqueCategories));
echo row_fmt('Rows with NULL category',                            number_format($nullCategoryRows));
echo "\n";

// Pass/fail check
$companyOk  = $uniqueCompanies  >= 300 && $uniqueCompanies  <= 900;
$categoryOk = $uniqueCategories >=  80 && $uniqueCategories <= 250;

echo row_fmt('Company target (300–900)',   $companyOk  ? "PASS ({$uniqueCompanies})"  : "FAIL ({$uniqueCompanies})");
echo row_fmt('Category target (80–250)',   $categoryOk ? "PASS ({$uniqueCategories})" : "FAIL ({$uniqueCategories})");
echo "\n";

// ─── Top 40 companies ─────────────────────────────────────────────────────────
echo "┌" . str_repeat('─', 56) . "┐\n";
echo "│" . center('Top 40 Companies (after extraction)', 56) . "│\n";
echo "└" . str_repeat('─', 56) . "┘\n";

$i = 0;
foreach ($companyCounts as $ck => $cnt) {
    if (++$i > 40) break;
    $name = $companyKeys[$ck];
    $display = mb_strlen($name, 'UTF-8') > 38 ? mb_substr($name, 0, 35, 'UTF-8') . '...' : $name;
    printf("  %2d. %-38s %5d\n", $i, $display, $cnt);
}
echo "\n";

// ─── Top 60 categories ────────────────────────────────────────────────────────
echo "┌" . str_repeat('─', 56) . "┐\n";
echo "│" . center('Top 60 Categories (after 1st-segment + aliases)', 56) . "│\n";
echo "└" . str_repeat('─', 56) . "┘\n";

$j = 0;
foreach ($categoryCounts as $nk => $cnt) {
    if (++$j > 60) break;
    $name = $categoryKeys[$nk];
    printf("  %2d. %-38s %5d\n", $j, $name, $cnt);
}
echo "\n";

// ─── Full company list (if not passing) ──────────────────────────────────────
if (!$companyOk) {
    echo "┌" . str_repeat('─', 56) . "┐\n";
    echo "│" . center('ALL companies (debugging — target not met)', 56) . "│\n";
    echo "└" . str_repeat('─', 56) . "┘\n";
    $k = 0;
    foreach ($companyCounts as $ck => $cnt) {
        $name = $companyKeys[$ck];
        printf("  %4d. %-36s %5d\n", ++$k, mb_substr($name, 0, 36, 'UTF-8'), $cnt);
    }
    echo "\n";
}

// ─── Full category list (if not passing) ─────────────────────────────────────
if (!$categoryOk) {
    echo "┌" . str_repeat('─', 56) . "┐\n";
    echo "│" . center('ALL categories (debugging — target not met)', 56) . "│\n";
    echo "└" . str_repeat('─', 56) . "┘\n";
    $k = 0;
    foreach ($categoryCounts as $nk => $cnt) {
        $name = $categoryKeys[$nk];
        printf("  %4d. %-36s %5d\n", ++$k, mb_substr($name, 0, 36, 'UTF-8'), $cnt);
    }
    echo "\n";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function center(string $text, int $width): string
{
    $len = mb_strlen($text, 'UTF-8');
    if ($len >= $width) return $text;
    $pad = $width - $len;
    return str_repeat(' ', (int)floor($pad / 2)) . $text . str_repeat(' ', (int)ceil($pad / 2));
}

function row_fmt(string $label, string $value): string
{
    $dots = 56 - mb_strlen($label, 'UTF-8') - mb_strlen($value, 'UTF-8') - 4;
    return "  {$label}" . str_repeat('.', max(1, $dots)) . "{$value}\n";
}
