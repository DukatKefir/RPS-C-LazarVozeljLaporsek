<?php
declare(strict_types=1);

if (!defined('BUDDY_APP')) {
    http_response_code(404);
    exit;
}

final class RateLimiter
{
    public function __construct(private readonly PDO $database)
    {
    }

    public function check(string $key, int $maximum, int $window): void
    {
        $now = time();
        $bucket = hash('sha256', $key);
        $limitedUntil = null;

        $this->database->exec('BEGIN IMMEDIATE');

        try {
            $cleanup = $this->database->prepare('DELETE FROM rate_limits WHERE resets_at <= ?');
            $cleanup->execute([$now]);

            $query = $this->database->prepare('SELECT attempts, resets_at FROM rate_limits WHERE bucket = ?');
            $query->execute([$bucket]);
            $current = $query->fetch();

            if ($current && (int) $current['attempts'] >= $maximum) {
                $limitedUntil = (int) $current['resets_at'];
            } else {
                $update = $this->database->prepare(
                    'INSERT INTO rate_limits (bucket, attempts, resets_at) VALUES (?, 1, ?)
                     ON CONFLICT(bucket) DO UPDATE SET attempts = attempts + 1'
                );
                $update->execute([$bucket, $now + $window]);
            }
            $this->database->exec('COMMIT');
        } catch (Throwable $error) {
            $this->database->exec('ROLLBACK');
            throw $error;
        }

        if ($limitedUntil !== null) {
            header('Retry-After: ' . max(1, $limitedUntil - $now));
            throw new HttpError('Preveč poskusov. Poskusi pozneje.', 429);
        }
    }
}
