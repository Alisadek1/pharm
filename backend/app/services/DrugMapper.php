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
     * Category alias map.
     *
     * Keyed by the result of categoryAliasKey() (all lowercase, non-alpha
     * stripped), so the same key matches every hyphen/space/case variant.
     * Values are canonical category names that resolveCategory() will then
     * title-case before storage.
     */
    private const CATEGORY_ALIASES = [
        // ── User-specified ────────────────────────────────────────────────────
        'multivitamins'         => 'MULTIVITAMIN',
        'vitamins'              => 'VITAMIN',
        'nsaids'                => 'NSAID',
        // anti-hypertensive: strips to "antihypertensive" for all three variants
        'antihypertensive'      => 'ANTI-HYPERTENSIVE',

        // ── Plural → singular ─────────────────────────────────────────────────
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

        // ── Hyphen/spacing variants (key already strips hyphens+spaces) ───────
        'antihistamine'         => 'ANTI-HISTAMINE',
        'antihistamines'        => 'ANTI-HISTAMINE',
        'antiviral'             => 'ANTI-VIRAL',
        'antiepileptic'         => 'ANTI-EPILEPTIC',
        'antirheumatic'         => 'ANTI-RHEUMATIC',
        'antiacne'              => 'ANTI-ACNE',
        'antihyperlipidemic'    => 'ANTIHYPERLIPIDEMIC',

        // ── Massage sub-types → single category ──────────────────────────────
        'massagecream'          => 'MASSAGE',
        'massagegel'            => 'MASSAGE',
        'massageoil'            => 'MASSAGE',

        // ── Skincare / topical variants ───────────────────────────────────────
        'whiteningtopical'      => 'SKIN CARE',
        'moisturizingtopical'   => 'SKIN CARE',
    ];

    /** Category field values treated as "no category" → category_id = NULL. */
    private const INVALID_CATEGORY_MARKERS = ['.', '-', 'null', 'n/a', 'na', 'none', 'unknown'];

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
        $scientificName = $this->cleanText($row['scientific_name'] ?? '');
        $manufacturer   = self::extractCompanyName($this->cleanText($row['manufacturer'] ?? ''));
        $drugClass      = self::extractCategoryFirstSegment($this->cleanText($row['drug_class'] ?? ''));
        $route          = strtoupper(trim($row['route'] ?? ''));
        $priceRaw       = trim($row['price_egp'] ?? '');

        return [
            'name'            => mb_substr($name, 0, 200, 'UTF-8'),
            'name_ar'         => $nameAr         !== '' ? mb_substr($nameAr, 0, 200, 'UTF-8')         : null,
            'scientific_name' => $scientificName !== '' ? mb_substr($scientificName, 0, 200, 'UTF-8') : null,
            'manufacturer'    => $manufacturer   !== '' ? $manufacturer                                : null,
            'drug_class'      => $drugClass,  // null when invalid or empty
            'dosage_form'     => mb_substr($this->mapDosageForm($route), 0, 50, 'UTF-8'),
            'strength'        => mb_substr($this->extractStrength($name, $scientificName), 0, 100, 'UTF-8'),
            'public_price'    => $this->parsePrice($priceRaw),
            'description'     => null,
        ];
    }

    // ─── Extraction helpers (public for use in analysis/tests) ────────────────

    /**
     * Extract the primary company name from a manufacturer field.
     *
     * The dataset encodes supply-chain relationships as "A > B" where A is the
     * international brand owner and B is the Egyptian local distributor. We keep
     * only the brand owner (A).
     *
     * Special case: strings starting with "> B" are artifacts where the left side
     * is missing — we use B.
     *
     * Examples:
     *   "JANSSEN CILAG > SOFICOPHARM"   →  "JANSSEN CILAG"
     *   "PFIZER > EIPICO"               →  "PFIZER"
     *   "> EVA PHARMA"                  →  "EVA PHARMA"
     *   "SANOFI"                        →  "SANOFI"   (unchanged)
     */
    public static function extractCompanyName(string $raw): string
    {
        $raw = trim($raw);
        if ($raw === '') {
            return '';
        }

        // Artifact: leading "> " — no left-side, use right-side
        if (str_starts_with($raw, '> ')) {
            return trim(substr($raw, 2));
        }

        // "A > B" notation — use A (primary brand owner)
        $arrowPos = strpos($raw, ' > ');
        if ($arrowPos !== false) {
            return trim(substr($raw, 0, $arrowPos));
        }

        return $raw;
    }

    /**
     * Extract the first taxonomy segment from a drug_class field and apply
     * canonical aliases.
     *
     * The dataset uses dot-notation for sub-categories ("ANTIBIOTIC.QUINOLONE").
     * The POS system only needs the top-level segment ("ANTIBIOTIC").
     *
     * Values that carry no meaningful category information (`.`, `-`, `null`,
     * empty) are returned as null so the medicine gets category_id = NULL.
     *
     * Examples:
     *   "ANTIBIOTIC.QUINOLONE"         →  "ANTIBIOTIC"
     *   "NSAID.ACETIC ACID DERIVATIVES"→  "NSAID"
     *   "MULTIVITAMINS"                →  "MULTIVITAMIN"
     *   "ANTI-HYPERTENSIVE...."        →  "ANTI-HYPERTENSIVE"
     *   "ANTIHYPERTENSIVE"             →  "ANTI-HYPERTENSIVE"  (alias)
     *   "."                            →  null
     *   ""                             →  null
     */
    public static function extractCategoryFirstSegment(string $raw): ?string
    {
        $raw = trim($raw);

        // Take only the first segment (before the first dot)
        $dotPos = strpos($raw, '.');
        if ($dotPos !== false) {
            $raw = trim(substr($raw, 0, $dotPos));
        }

        if ($raw === '') {
            return null;
        }

        // Reject values that are not real categories
        if (in_array(strtolower($raw), self::INVALID_CATEGORY_MARKERS, true)) {
            return null;
        }

        // Apply alias map using a super-normalized key (strips ALL non-alpha)
        $aliasKey = self::categoryAliasKey($raw);
        if (isset(self::CATEGORY_ALIASES[$aliasKey])) {
            return self::CATEGORY_ALIASES[$aliasKey];
        }

        return $raw;
    }

    // ─── Normalization utilities ──────────────────────────────────────────────

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
     * Lowercases, strips zero-width/soft-hyphen codepoints, normalizes Arabic
     * character variants, and collapses whitespace. Two strings that differ only
     * in those ways produce the same key.
     */
    public static function normalizeForKey(string $text): string
    {
        if ($text === '') {
            return '';
        }
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
     * Derive a category alias lookup key.
     * Strips ALL non-lowercase-alpha so that "ANTI-HYPERTENSIVE",
     * "ANTIHYPERTENSIVE", and "ANTI HYPERTENSIVE" all map to "antihypertensive".
     */
    private static function categoryAliasKey(string $s): string
    {
        return (string) preg_replace('/[^a-z]/u', '', mb_strtolower($s, 'UTF-8'));
    }

    /**
     * Trim, collapse whitespace, and ensure valid UTF-8.
     */
    private function cleanText(string $value): string
    {
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
     * Matches patterns like: 500 MG, 1.5 GM, 50000 I.U., 250MCG/5ML, 0.1%, 10 ML
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
