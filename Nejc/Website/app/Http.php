<?php
declare(strict_types=1);

if (!defined('BUDDY_APP')) {
    http_response_code(404);
    exit;
}

final class HttpError extends RuntimeException
{
    public function __construct(string $message, public readonly int $status = 400)
    {
        parent::__construct($message);
    }
}

final class Http
{
    public static function isHttps(): bool
    {
        return isset($_SERVER['HTTPS']) && in_array(strtolower((string) $_SERVER['HTTPS']), ['on', '1'], true);
    }

    public static function securityHeaders(): void
    {
        header("Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
        header('X-Content-Type-Options: nosniff');
        header('X-Frame-Options: DENY');
        header('Referrer-Policy: no-referrer');
        header('Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()');
        header('Cross-Origin-Opener-Policy: same-origin');
        header('Cross-Origin-Resource-Policy: same-origin');
        header('Cache-Control: no-store');

        if (self::isHttps()) {
            header('Strict-Transport-Security: max-age=31536000');
        }
    }

    public static function validateRequest(array $config): void
    {
        $host = (string) ($_SERVER['HTTP_HOST'] ?? '');
        $hostname = strtolower((string) parse_url('http://' . $host, PHP_URL_HOST));
        $hostname = trim($hostname, '[]');

        if (!in_array($hostname, $config['allowed_hosts'], true)) {
            throw new HttpError('Nedovoljen gostitelj.', 403);
        }

        // Ne zaupamo X-Forwarded-* glavam, ki jih lahko poslje obiskovalec.
        $localClient = in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1', '::ffff:127.0.0.1'], true);
        $localHost = in_array($hostname, ['localhost', '127.0.0.1', '::1'], true);

        if (!self::isHttps() && (!$localClient || !$localHost)) {
            throw new HttpError('Za oddaljeno uporabo je potreben HTTPS.', 403);
        }

        $expectedOrigin = (self::isHttps() ? 'https://' : 'http://') . $host;
        $origin = $_SERVER['HTTP_ORIGIN'] ?? null;

        if ($origin !== null && $origin !== $expectedOrigin) {
            throw new HttpError('Zahteva z druge spletne strani ni dovoljena.', 403);
        }

        if (($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '') === 'cross-site') {
            throw new HttpError('Zahteva z druge spletne strani ni dovoljena.', 403);
        }
    }

    public static function readJson(): array
    {
        $contentType = strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0]));

        if ($contentType !== 'application/json') {
            throw new HttpError('Zahtevan je JSON.', 415);
        }

        if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 16384) {
            throw new HttpError('Zahteva je prevelika.', 413);
        }

        $input = file_get_contents('php://input', false, null, 0, 16385);

        if ($input === false || strlen($input) > 16384) {
            throw new HttpError('Zahteva je prevelika.', 413);
        }

        try {
            $body = json_decode($input, false, 16, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            throw new HttpError('Neveljaven JSON.');
        }

        if (!$body instanceof stdClass) {
            throw new HttpError('Telo zahteve mora biti objekt.');
        }

        return (array) $body;
    }

    public static function json(array $body, int $status = 200): never
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        exit;
    }
}

function escapeHtml(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}
