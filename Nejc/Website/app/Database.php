<?php
declare(strict_types=1);

if (!defined('BUDDY_APP')) {
    http_response_code(404);
    exit;
}

final class Database
{
    public static function connect(array $config): PDO
    {
        if (!extension_loaded('pdo_sqlite')) {
            throw new HttpError('Na strežniku omogoči razširitev pdo_sqlite.', 503);
        }

        $storage = $config['storage'];

        if (!is_dir($storage) && !mkdir($storage, 0700, true) && !is_dir($storage)) {
            throw new RuntimeException('Storage could not be created.');
        }

        $realStorage = realpath($storage);
        $webRoots = [dirname(__DIR__), $_SERVER['DOCUMENT_ROOT'] ?? dirname(__DIR__)];

        foreach ($webRoots as $root) {
            $realRoot = realpath($root);
            if ($realRoot === false || $realStorage === false) {
                throw new RuntimeException('Storage path could not be verified.');
            }

            $prefix = strtolower(rtrim(str_replace('\\', '/', $realRoot), '/')) . '/';
            $target = strtolower(rtrim(str_replace('\\', '/', $realStorage), '/')) . '/';

            if (str_starts_with($target, $prefix)) {
                throw new RuntimeException('Database must be outside the web root.');
            }
        }

        $filename = $realStorage . DIRECTORY_SEPARATOR . 'website.sqlite';
        $database = new PDO('sqlite:' . $filename, null, null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);

        $database->exec('PRAGMA foreign_keys = ON');
        $database->exec('PRAGMA busy_timeout = 5000');
        $database->exec('PRAGMA journal_mode = WAL');
        $database->exec(file_get_contents(dirname(__DIR__) . '/database/schema.sql'));
        @chmod($filename, 0600);

        return $database;
    }
}
