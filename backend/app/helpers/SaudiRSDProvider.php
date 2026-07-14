<?php

declare(strict_types=1);

class SaudiRSDProvider implements DrugProviderInterface
{
    private string $apiUrl;
    private string $apiKey;
    private string $apiSecret;
    private int    $timeout = 30;

    public function __construct(string $apiUrl, string $apiKey, string $apiSecret)
    {
        $this->apiUrl    = rtrim($apiUrl, '/');
        $this->apiKey    = $apiKey;
        $this->apiSecret = $apiSecret;
    }

    public function lookupByBarcode(string $barcode): ?array
    {
        $response = $this->request('GET', '/drugs/barcode/' . urlencode($barcode));
        return $response ? $this->normalize($response) : null;
    }

    public function lookupBySaudiCode(string $code): ?array
    {
        $response = $this->request('GET', '/drugs/code/' . urlencode($code));
        return $response ? $this->normalize($response) : null;
    }

    public function fetchAll(): array
    {
        $page  = 1;
        $drugs = [];
        do {
            $response = $this->request('GET', '/drugs', ['page' => $page, 'per_page' => 100]);
            if (!$response || empty($response['data'])) break;
            foreach ($response['data'] as $drug) {
                $normalized = $this->normalize($drug);
                if ($normalized) $drugs[] = $normalized;
            }
            $hasMore = isset($response['meta']['current_page']) && $response['meta']['current_page'] < ($response['meta']['last_page'] ?? 1);
            $page++;
        } while ($hasMore);

        return $drugs;
    }

    public function testConnection(): bool
    {
        try {
            $result = $this->request('GET', '/ping');
            return $result !== null;
        } catch (Exception) {
            return false;
        }
    }

    private function normalize(array $drug): ?array
    {
        if (empty($drug)) return null;
        return [
            'barcode'         => $drug['barcode']          ?? $drug['gtin']             ?? null,
            'gtin'            => $drug['gtin']             ?? null,
            'saudi_drug_code' => $drug['saudi_drug_code']  ?? $drug['drug_code']        ?? null,
            'drug_name'       => $drug['drug_name']        ?? $drug['name']             ?? null,
            'public_price'    => isset($drug['price'])     ? (float)$drug['price']      : null,
            'availability'    => $drug['availability']     ?? $drug['is_available']     ?? null,
            'manufacturer'    => $drug['manufacturer']     ?? $drug['manufacturer_name'] ?? null,
        ];
    }

    private function request(string $method, string $path, array $query = []): ?array
    {
        $url  = $this->apiUrl . $path;
        if ($query) $url .= '?' . http_build_query($query);

        $timestamp = time();
        $signature = hash_hmac('sha256', $method . $path . $timestamp, $this->apiSecret);

        $context = stream_context_create([
            'http' => [
                'method'  => $method,
                'header'  => implode("\r\n", [
                    'Content-Type: application/json',
                    'X-API-Key: ' . $this->apiKey,
                    'X-Timestamp: ' . $timestamp,
                    'X-Signature: ' . $signature,
                    'Accept: application/json',
                ]),
                'timeout'        => $this->timeout,
                'ignore_errors'  => true,
            ],
            'ssl' => ['verify_peer' => true],
        ]);

        $raw = @file_get_contents($url, false, $context);
        if ($raw === false) return null;

        $decoded = json_decode($raw, true);
        return is_array($decoded) ? $decoded : null;
    }
}
