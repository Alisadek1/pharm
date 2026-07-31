<?php

declare(strict_types=1);

/**
 * Streams a JSON array file ([ {...}, {...}, ... ]) in configurable chunks
 * without loading the full file into memory.
 *
 * Uses a character-by-character parser that tracks string/escape state and
 * brace depth so it correctly handles any embedded braces or quotes inside
 * string values.
 */
class JsonReader
{
    private string $path;
    private int    $chunkSize;

    /** Read buffer size in bytes */
    private const READ_SIZE = 65536;

    public function __construct(string $path, int $chunkSize = 500)
    {
        if (!is_readable($path)) {
            throw new RuntimeException("JSON file is not readable: {$path}");
        }
        $this->path      = $path;
        $this->chunkSize = $chunkSize;
    }

    /**
     * Yields arrays of decoded records.
     *
     * @return \Generator<int, list<array<string,mixed>>, void, void>
     */
    public function chunks(): \Generator
    {
        $handle = fopen($this->path, 'r');
        if ($handle === false) {
            throw new RuntimeException("Cannot open JSON: {$this->path}");
        }

        // Strip UTF-8 BOM if present
        $bom = fread($handle, 3);
        if ($bom !== "\xEF\xBB\xBF") {
            rewind($handle);
        }

        $chunk  = [];
        $objBuf = null;    // null = outside top-level object; string = accumulating
        $depth  = 0;
        $inStr  = false;
        $esc    = false;

        while (!feof($handle)) {
            $data = fread($handle, self::READ_SIZE);
            if ($data === false || $data === '') {
                continue;
            }

            $len = strlen($data);
            for ($i = 0; $i < $len; $i++) {
                $ch = $data[$i];

                // Escape sequence inside string
                if ($esc) {
                    $esc = false;
                    if ($objBuf !== null) {
                        $objBuf .= $ch;
                    }
                    continue;
                }

                if ($ch === '\\' && $inStr) {
                    $esc = true;
                    if ($objBuf !== null) {
                        $objBuf .= $ch;
                    }
                    continue;
                }

                // Toggle string state
                if ($ch === '"') {
                    $inStr = !$inStr;
                    if ($objBuf !== null) {
                        $objBuf .= $ch;
                    }
                    continue;
                }

                // Inside string: accumulate but don't parse structure
                if ($inStr) {
                    if ($objBuf !== null) {
                        $objBuf .= $ch;
                    }
                    continue;
                }

                // Structure parsing (outside strings)
                if ($ch === '{') {
                    if ($depth === 0) {
                        $objBuf = '{';
                    } else {
                        $objBuf .= $ch;
                    }
                    $depth++;
                } elseif ($ch === '}') {
                    $depth--;
                    if ($objBuf !== null) {
                        $objBuf .= $ch;
                    }
                    if ($depth === 0 && $objBuf !== null) {
                        $record = json_decode($objBuf, true);
                        if (is_array($record)) {
                            $chunk[] = $record;
                            if (count($chunk) >= $this->chunkSize) {
                                yield $chunk;
                                $chunk = [];
                            }
                        }
                        $objBuf = null;
                    }
                } else {
                    if ($objBuf !== null) {
                        $objBuf .= $ch;
                    }
                }
            }
        }

        if (!empty($chunk)) {
            yield $chunk;
        }

        fclose($handle);
    }

    /**
     * Count top-level objects for ETA calculation.
     * Does a fast single pass counting '{' at depth 0.
     */
    public function estimateTotal(): int
    {
        $handle = fopen($this->path, 'r');
        if ($handle === false) {
            return 0;
        }

        $count = 0;
        $depth = 0;
        $inStr = false;
        $esc   = false;

        while (!feof($handle)) {
            $data = fread($handle, self::READ_SIZE);
            if ($data === false) {
                continue;
            }
            $len = strlen($data);
            for ($i = 0; $i < $len; $i++) {
                $ch = $data[$i];
                if ($esc)                   { $esc = false; continue; }
                if ($ch === '\\' && $inStr) { $esc = true;  continue; }
                if ($ch === '"')            { $inStr = !$inStr; continue; }
                if ($inStr)                 { continue; }
                if ($ch === '{')            { if ($depth === 0) { $count++; } $depth++; }
                elseif ($ch === '}')        { $depth--; }
            }
        }

        fclose($handle);
        return $count;
    }
}
