<?php

declare(strict_types=1);

/**
 * Validates a raw Egyptian-drug-database row before mapping occurs.
 *
 * Keeps validation concerns out of DrugMapper, which handles only the
 * structural transformation of a valid row into medicine table fields.
 */
class DrugValidator
{
    /**
     * @param  array<string,string> $row
     * @return array{valid:bool, reason:string}
     */
    public function validate(array $row): array
    {
        $nameEn = trim($row['commercial_name_en'] ?? '');
        $nameAr = trim($row['commercial_name_ar'] ?? '');

        if ($nameEn === '' && $nameAr === '') {
            return $this->reject('Both commercial_name_en and commercial_name_ar are empty');
        }

        $priceRaw = trim($row['price_egp'] ?? '');
        if ($priceRaw !== '' && strtolower($priceRaw) !== 'null') {
            $price = (float) str_replace(',', '.', $priceRaw);
            if ($price < 0) {
                return $this->reject("Negative price: {$priceRaw}");
            }
        }

        foreach (['commercial_name_en', 'commercial_name_ar', 'scientific_name'] as $field) {
            $value = $row[$field] ?? '';
            if ($value !== '' && !mb_check_encoding($value, 'UTF-8')) {
                return $this->reject("Malformed UTF-8 in field '{$field}'");
            }
        }

        return ['valid' => true, 'reason' => ''];
    }

    /** @return array{valid:false, reason:string} */
    private function reject(string $reason): array
    {
        return ['valid' => false, 'reason' => $reason];
    }
}
