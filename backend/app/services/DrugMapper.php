<?php

declare(strict_types=1);

/**
 * Maps a raw Egyptian-drug-database row to the medicines table schema.
 *
 * Source columns:
 *   commercial_name_en, commercial_name_ar, scientific_name,
 *   manufacturer, drug_class, route, price_egp
 */
class DrugMapper
{
    /**
     * Maps administration route codes to human-readable dosage form labels.
     * Prefix-matched so 'ORAL.SOLID.CAPSULE' still maps to 'Tablet/Capsule'.
     */
    private const ROUTE_MAP = [
        'ORAL.SOLID'       => 'Tablet',
        'ORAL.LIQUID'      => 'Syrup',
        'ORAL.SEMI.SOLID'  => 'Gel',
        'ORAL.SEMI-SOLID'  => 'Gel',
        'PARENTERAL'       => 'Injection',
        'INJECTION'        => 'Injection',
        'TOPICAL'          => 'Topical',
        'NASAL'            => 'Nasal Spray',
        'OPHTHALMIC'       => 'Eye Drops',
        'OTIC'             => 'Ear Drops',
        'DENTAL'           => 'Dental',
        'RECTAL'           => 'Suppository',
        'VAGINAL'          => 'Vaginal',
        'INHALED'          => 'Inhaler',
        'TRANSDERMAL'      => 'Patch',
        'SOAP'             => 'Soap',
        'UNKNOWN'          => 'Other',
    ];

    /**
     * Map a raw dataset row to medicines table fields.
     * Returns null when the row has no usable medicine name.
     *
     * @param  array<string,string> $row
     * @return array<string,mixed>|null
     */
    public function map(array $row): ?array
    {
        $name = $this->cleanText($row['commercial_name_en'] ?? '');
        if ($name === '') {
            return null;
        }

        $nameAr         = $this->cleanText(self::normalizeArabic($row['commercial_name_ar'] ?? ''));
        $scientificName = $this->cleanText($row['scientific_name']    ?? '');
        $manufacturer   = $this->cleanText($row['manufacturer']       ?? '');
        $drugClass      = $this->cleanText($row['drug_class']         ?? '');
        $route          = strtoupper(trim($row['route']               ?? ''));
        $priceRaw       = trim($row['price_egp']                      ?? '');

        return [
            'name'            => mb_substr($name, 0, 200, 'UTF-8'),
            'name_ar'         => $nameAr         !== '' ? mb_substr($nameAr, 0, 200, 'UTF-8')         : null,
            'scientific_name' => $scientificName !== '' ? mb_substr($scientificName, 0, 200, 'UTF-8') : null,
            'manufacturer'    => $manufacturer   !== '' ? $manufacturer                                : null,
            'drug_class'      => $drugClass      !== '' ? $drugClass                                   : null,
            'dosage_form'     => mb_substr($this->mapDosageForm($route), 0, 50, 'UTF-8'),
            'strength'        => mb_substr($this->extractStrength($name, $scientificName), 0, 100, 'UTF-8'),
            'public_price'    => $this->parsePrice($priceRaw),
            'description'     => null,
        ];
    }

    /**
     * Normalize a company or category name for DB-storage use:
     * collapse runs of whitespace, trim, keep original case.
     */
    public static function normalizeName(string $name): string
    {
        return trim((string) preg_replace('/\s+/', ' ', $name));
    }

    /**
     * Derive a cache key from a string.
     *
     * More aggressive than normalizeName(): lowercases, strips zero-width and
     * soft-hyphen Unicode codepoints, normalizes Arabic character variants, and
     * collapses all whitespace. Two strings that differ only in those ways will
     * produce the same key and be treated as duplicates.
     */
    public static function normalizeForKey(string $text): string
    {
        if ($text === '') {
            return '';
        }
        // Remove zero-width joiner/non-joiner, zero-width space, soft-hyphen, BOM
        $text = (string) preg_replace('/[\x{00AD}\x{200B}-\x{200D}\x{FEFF}]/u', '', $text);
        $text = self::normalizeArabic($text);
        $text = mb_strtolower(trim($text), 'UTF-8');
        return (string) preg_replace('/\s+/u', ' ', $text);
    }

    /**
     * Normalize Arabic text:
     *  - Remove tatweel (kashida)
     *  - Unify alef variants → plain alef
     *  - Unify final ya → dotted ya
     *  - Unify ta marbuta → ha
     */
    public static function normalizeArabic(string $text): string
    {
        $text = str_replace("\u{0640}", '', $text);
        $text = str_replace(["\u{0622}", "\u{0623}", "\u{0625}", "\u{0671}"], "\u{0627}", $text);
        $text = str_replace("\u{0649}", "\u{064A}", $text);
        $text = str_replace("\u{0629}", "\u{0647}", $text);
        return $text;
    }

    // ─── Private helpers ──────────────────────────────────────────────────────

    /**
     * Trim, collapse whitespace, and ensure valid UTF-8.
     */
    private function cleanText(string $value): string
    {
        // Re-encode to catch malformed byte sequences
        $value = mb_convert_encoding($value, 'UTF-8', 'UTF-8');
        $value = trim($value);
        return (string) preg_replace('/\s+/', ' ', $value);
    }

    /**
     * Map route string to a readable dosage form.
     * Tries exact match, then prefix match, then falls back to ucfirst of route.
     */
    private function mapDosageForm(string $route): string
    {
        if ($route === '') {
            return 'Other';
        }
        if (isset(self::ROUTE_MAP[$route])) {
            return self::ROUTE_MAP[$route];
        }
        foreach (self::ROUTE_MAP as $prefix => $label) {
            if (str_starts_with($route, $prefix)) {
                return $label;
            }
        }
        return ucfirst(strtolower($route));
    }

    /**
     * Extract a strength token from the English commercial name or scientific name.
     *
     * Matches patterns like:
     *   500 MG, 1.5 GM, 50000 I.U., 250MCG/5ML, 0.1%, 10 ML
     */
    private function extractStrength(string $nameEn, string $scientificName): string
    {
        $pattern = '/(\d+[.,]?\d*\s*(?:MG\/ML|MCG\/ML|MG|MCG|GM|G(?!\w)|IU|I\.U\.|ML(?!\w)|%))(?:\/\d+[.,]?\d*\s*(?:ML|MG|GM|G))?/i';

        if (preg_match($pattern, $nameEn, $m)) {
            return strtoupper(trim($m[0]));
        }
        if (preg_match($pattern, $scientificName, $m)) {
            return strtoupper(trim($m[0]));
        }
        return '';
    }

    /**
     * Parse a price string that may be float, integer, empty, or 'null'.
     */
    private function parsePrice(string $raw): float
    {
        if ($raw === '' || strtolower($raw) === 'null') {
            return 0.0;
        }
        $val = (float) str_replace(',', '.', $raw);
        return $val > 0 ? round($val, 3) : 0.0;
    }
}
