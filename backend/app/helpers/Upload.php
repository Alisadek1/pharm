<?php

declare(strict_types=1);

class Upload
{
    private static array $allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    private static int $maxFileSize = 5242880; // 5MB

    public static function image(array $file, string $folder = 'medicines'): string
    {
        if ($file['error'] !== UPLOAD_ERR_OK) {
            throw new RuntimeException('File upload error: ' . $file['error']);
        }

        if ($file['size'] > self::$maxFileSize) {
            throw new RuntimeException('File size exceeds maximum allowed size of 5MB');
        }

        $finfo    = finfo_open(FILEINFO_MIME_TYPE);
        $mimeType = finfo_file($finfo, $file['tmp_name']);
        finfo_close($finfo);

        if (!in_array($mimeType, self::$allowedImageTypes, true)) {
            throw new RuntimeException('Invalid file type. Only JPEG, PNG, WebP, and GIF are allowed');
        }

        $ext      = pathinfo($file['name'], PATHINFO_EXTENSION);
        $filename = bin2hex(random_bytes(16)) . '.' . strtolower($ext);
        $dir      = __DIR__ . '/../../uploads/' . $folder . '/';

        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        $dest = $dir . $filename;
        if (!move_uploaded_file($file['tmp_name'], $dest)) {
            throw new RuntimeException('Failed to move uploaded file');
        }

        return 'uploads/' . $folder . '/' . $filename;
    }

    public static function delete(string $path): void
    {
        $fullPath = __DIR__ . '/../../' . $path;
        if (file_exists($fullPath)) {
            unlink($fullPath);
        }
    }
}
