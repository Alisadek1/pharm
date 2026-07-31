<?php

declare(strict_types=1);

/**
 * Streams a CSV file in configurable chunks without loading the whole file
 * into memory. Handles UTF-8 BOM and variable column counts gracefully.
 */
class CsvReader
{
    private string $path;
    private int    $chunkSize;

    public function __construct(string $path, int $chunkSize = 500)
    {
        if (!is_readable($path)) {
            throw new RuntimeException("CSV file is not readable: {$path}");
        }
        $this->path      = $path;
        $this->chunkSize = $chunkSize;
    }

    /**
     * Yields arrays of associative rows keyed by the CSV header.
     *
     * @return \Generator<int, list<array<string,string>>, void, void>
     */
    public function chunks(): \Generator
    {
        $handle = fopen($this->path, 'r');
        if ($handle === false) {
            throw new RuntimeException("Cannot open CSV: {$this->path}");
        }

        // Strip UTF-8 BOM (EF BB BF) if present
        $bom = fread($handle, 3);
        if ($bom !== "\xEF\xBB\xBF") {
            rewind($handle);
        }

        // Read header row
        $header = fgetcsv($handle);
        if ($header === false || $header === null) {
            fclose($handle);
            return;
        }
        $header  = array_map('trim', $header);
        $colCount = count($header);

        $chunk = [];
        while (($row = fgetcsv($handle)) !== false) {
            // Silently skip structurally malformed rows
            if (count($row) < $colCount) {
                continue;
            }

            $assoc = array_combine($header, array_slice($row, 0, $colCount));
            if ($assoc === false) {
                continue;
            }

            $chunk[] = $assoc;

            if (count($chunk) >= $this->chunkSize) {
                yield $chunk;
                $chunk = [];
            }
        }

        if (!empty($chunk)) {
            yield $chunk;
        }

        fclose($handle);
    }

    /**
     * Count data rows (excluding header). Used for ETA calculation.
     */
    public function estimateTotal(): int
    {
        $handle = fopen($this->path, 'r');
        if ($handle === false) {
            return 0;
        }
        $count = 0;
        while (!feof($handle)) {
            fgets($handle);
            $count++;
        }
        fclose($handle);
        return max(0, $count - 1);
    }
}
