<?php

declare(strict_types=1);

/**
 * Gs1EgyptAdapter
 *
 * Stub adapter for GS1 Egypt GTIN lookup.
 *
 * To enable:
 *   1. Obtain API access from https://www.gs1eg.org/ (member portal)
 *   2. Set the following variables in backend/.env:
 *        GS1_EGYPT_API_URL=<actual endpoint from official documentation>
 *        GS1_EGYPT_API_KEY=<your API key>
 *   3. Confirm the response schema from official documentation and
 *      update normalizeProduct() below to map fields correctly.
 *
 * Until configured, all calls return configured=false.
 * The URL placeholder must be replaced with the real endpoint —
 * do NOT invent or guess an endpoint.
 */
class Gs1EgyptAdapter
{
    private const TIMEOUT = 10;

    private string $apiUrl;
    private string $apiKey;
    private bool   $configured;

    public function __construct()
    {
        $this->apiUrl     = $_ENV['GS1_EGYPT_API_URL'] ?? '';
        $this->apiKey     = $_ENV['GS1_EGYPT_API_KEY'] ?? '';
        $this->configured = $this->apiUrl !== '' && $this->apiKey !== '';
    }

    public function isConfigured(): bool
    {
        return $this->configured;
    }

    public function lookup(string $barcode): array
    {
        if (!$this->configured) {
            return [
                'found'      => false,
                'source'     => 'gs1',
                'configured' => false,
                'error'      => 'GS1 Egypt is not configured. Set GS1_EGYPT_API_URL and GS1_EGYPT_API_KEY in backend/.env.',
            ];
        }

        $url = rtrim($this->apiUrl, '/') . '/' . rawurlencode($barcode);

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => self::TIMEOUT,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_HTTPHEADER     => [
                'Accept: application/json',
                'Authorization: Bearer ' . $this->apiKey,
            ],
            CURLOPT_SSL_VERIFYPEER => true,
        ]);

        $body  = curl_exec($ch);
        $errno = curl_errno($ch);
        $code  = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($errno !== 0) {
            return ['found' => false, 'source' => 'gs1', 'configured' => true, 'error' => 'Connection error or timeout'];
        }
        if ($code === 401 || $code === 403) {
            return ['found' => false, 'source' => 'gs1', 'configured' => true, 'error' => 'GS1 Egypt authentication failed — check GS1_EGYPT_API_KEY'];
        }
        if ($code === 404) {
            return ['found' => false, 'source' => 'gs1', 'configured' => true];
        }
        if ($code !== 200) {
            return ['found' => false, 'source' => 'gs1', 'configured' => true, 'error' => "GS1 Egypt returned HTTP {$code}"];
        }

        $data = json_decode($body ?: '', true);
        if (!is_array($data)) {
            return ['found' => false, 'source' => 'gs1', 'configured' => true, 'error' => 'Invalid JSON response'];
        }

        // TODO: Map actual response fields once GS1 Egypt API documentation is obtained.
        // The structure below is a placeholder — update normalizeProduct() once the real
        // schema is known.
        return [
            'found'      => true,
            'source'     => 'gs1',
            'configured' => true,
            'data'       => $this->normalizeProduct($barcode, $data),
        ];
    }

    /**
     * Map GS1 Egypt API response to the common candidate shape.
     * UPDATE THIS METHOD once the actual API response schema is documented.
     */
    private function normalizeProduct(string $barcode, array $data): array
    {
        // Placeholder mapping — replace field names with actual GS1 Egypt response fields
        return [
            'barcode'      => $barcode,
            'name'         => $data['productName'] ?? $data['name'] ?? null,
            'name_ar'      => $data['productNameAr'] ?? $data['nameAr'] ?? null,
            'manufacturer' => $data['brand'] ?? $data['manufacturer'] ?? null,
            'quantity'     => $data['netContent'] ?? null,
            'dosage_form'  => null,
            'strength'     => null,
            'source'       => 'gs1',
            'source_url'   => null,
            'raw'          => $data,   // pass through raw response for debugging
        ];
    }
}
