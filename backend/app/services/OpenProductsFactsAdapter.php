<?php

declare(strict_types=1);

/**
 * OpenProductsFactsAdapter
 *
 * Lookups the Open Products Facts public API.
 * API: https://world.openproductsfacts.org/api/v2/product/{barcode}.json
 * No authentication required. Rate limit: reasonable use only.
 *
 * IMPORTANT: Results must NEVER overwrite local operational data
 * (prices, stock, supplier, SKU, existing barcodes).
 * This adapter returns raw candidate data for user review only.
 */
class OpenProductsFactsAdapter
{
    private const BASE_URL  = 'https://world.openproductsfacts.org/api/v2/product/';
    private const TIMEOUT   = 8;  // seconds
    private const USER_AGENT = 'PharmERP/1.0 (barcode-lookup; contact=admin)';

    public function lookup(string $barcode): array
    {
        $url = self::BASE_URL . rawurlencode($barcode) . '.json';

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => self::TIMEOUT,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS      => 2,
            CURLOPT_USERAGENT      => self::USER_AGENT,
            CURLOPT_HTTPHEADER     => ['Accept: application/json'],
            CURLOPT_SSL_VERIFYPEER => true,
        ]);

        $body  = curl_exec($ch);
        $errno = curl_errno($ch);
        $code  = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($errno !== 0) {
            return ['found' => false, 'source' => 'opf', 'error' => 'Connection error or timeout'];
        }
        if ($code === 404) {
            return ['found' => false, 'source' => 'opf'];
        }
        if ($code !== 200) {
            return ['found' => false, 'source' => 'opf', 'error' => "OPF returned HTTP {$code}"];
        }

        $data = json_decode($body ?: '', true);
        if (!is_array($data)) {
            return ['found' => false, 'source' => 'opf', 'error' => 'Invalid JSON response'];
        }

        // status=1 means product found; status=0 means not found
        if (($data['status'] ?? 0) !== 1 || empty($data['product'])) {
            return ['found' => false, 'source' => 'opf'];
        }

        return [
            'found'  => true,
            'source' => 'opf',
            'data'   => $this->normalizeProduct($barcode, $data['product']),
        ];
    }

    private function normalizeProduct(string $barcode, array $p): array
    {
        // Prefer English name, fall back to generic product_name field
        $name = $p['product_name_en']
             ?? $p['product_name']
             ?? null;

        $nameAr = $p['product_name_ar'] ?? null;

        // brands field can be comma-separated; take the first
        $manufacturer = null;
        if (!empty($p['brands'])) {
            $parts        = explode(',', $p['brands']);
            $manufacturer = trim($parts[0]);
        }

        return [
            'barcode'      => $barcode,
            'name'         => $name ? substr($name, 0, 200) : null,
            'name_ar'      => $nameAr ? substr($nameAr, 0, 200) : null,
            'manufacturer' => $manufacturer ? substr($manufacturer, 0, 200) : null,
            'quantity'     => isset($p['quantity']) ? substr($p['quantity'], 0, 100) : null,
            'dosage_form'  => null,   // OPF is not a medicine database
            'strength'     => null,
            'source'       => 'opf',
            'source_url'   => 'https://world.openproductsfacts.org/product/' . rawurlencode($barcode),
        ];
    }
}
