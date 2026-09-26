<?php

declare(strict_types=1);

/**
 * BarcodeService
 *
 * Barcode format detection, normalization, and GTIN check-digit validation.
 * All GTIN variants (EAN-8, UPC-A, EAN-13, GTIN-14) use the same
 * modulo-10 check digit algorithm — only digit count differs.
 *
 * Important: normalization preserves leading zeros.
 * Never cast a barcode to int — use string operations only.
 */
class BarcodeService
{
    public const FORMAT_EAN13    = 'EAN-13';
    public const FORMAT_EAN8     = 'EAN-8';
    public const FORMAT_UPCA     = 'UPC-A';
    public const FORMAT_GTIN14   = 'GTIN-14';
    public const FORMAT_INTERNAL = 'INTERNAL';
    public const FORMAT_UNKNOWN  = 'UNKNOWN';

    /**
     * Normalize a barcode: trim whitespace, preserve leading zeros exactly.
     * Never converts to int.
     */
    public static function normalize(string $raw): string
    {
        return trim($raw);
    }

    /**
     * Detect the barcode format by length and character set.
     */
    public static function detect(string $barcode): string
    {
        if ($barcode === '') {
            return self::FORMAT_UNKNOWN;
        }
        if (!ctype_digit($barcode)) {
            // Contains non-numeric characters — internal/proprietary code
            return self::FORMAT_INTERNAL;
        }
        return match (strlen($barcode)) {
            14      => self::FORMAT_GTIN14,
            13      => self::FORMAT_EAN13,
            12      => self::FORMAT_UPCA,
            8       => self::FORMAT_EAN8,
            default => self::FORMAT_INTERNAL,
        };
    }

    /**
     * Validate the GTIN check digit using the modulo-10 algorithm.
     *
     * Returns:
     *   true  — checksum passes
     *   false — checksum fails (invalid barcode)
     *   null  — not applicable (INTERNAL or UNKNOWN format)
     */
    public static function validateCheckDigit(string $barcode): ?bool
    {
        $format = self::detect($barcode);
        if (in_array($format, [self::FORMAT_INTERNAL, self::FORMAT_UNKNOWN], true)) {
            return null;
        }

        $digits  = str_split($barcode);
        $check   = (int)array_pop($digits);   // last digit is the check digit
        $sum     = 0;
        $mult    = 3;                          // rightmost payload digit × 3

        foreach (array_reverse($digits) as $d) {
            $sum  += (int)$d * $mult;
            $mult  = ($mult === 3) ? 1 : 3;
        }

        $expected = (10 - ($sum % 10)) % 10;
        return $check === $expected;
    }

    /**
     * Full validation result for a barcode string.
     */
    public static function validate(string $raw): array
    {
        $barcode = self::normalize($raw);
        $format  = self::detect($barcode);
        $valid   = self::validateCheckDigit($barcode);
        $isGtin  = in_array($format, [
            self::FORMAT_EAN13, self::FORMAT_EAN8,
            self::FORMAT_UPCA,  self::FORMAT_GTIN14,
        ], true);

        return [
            'barcode'        => $barcode,
            'format'         => $format,
            'is_gtin'        => $isGtin,
            'valid_checksum' => $valid,       // null for non-GTIN
            'length'         => strlen($barcode),
        ];
    }

    /**
     * Quick guard used before storing: throws if a GTIN has an invalid check digit.
     * Passes silently for INTERNAL barcodes (no check digit to verify).
     */
    public static function assertValidOrInternal(string $barcode): void
    {
        $result = self::validate($barcode);
        if ($result['is_gtin'] && $result['valid_checksum'] === false) {
            throw new \InvalidArgumentException(
                "Invalid {$result['format']} check digit for barcode '{$barcode}'"
            );
        }
    }
}
