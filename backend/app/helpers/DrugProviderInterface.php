<?php

declare(strict_types=1);

interface DrugProviderInterface
{
    /**
     * Fetch drug info by barcode/GTIN.
     * Returns array with keys: public_price, availability, drug_name, gtin, saudi_drug_code
     * or null if not found.
     */
    public function lookupByBarcode(string $barcode): ?array;

    /**
     * Fetch drug info by Saudi Drug Code.
     */
    public function lookupBySaudiCode(string $code): ?array;

    /**
     * Fetch all available drug records (full sync).
     * Returns iterable of drug arrays.
     */
    public function fetchAll(): array;

    /**
     * Test connectivity to the provider API.
     * Returns true on success.
     */
    public function testConnection(): bool;
}
