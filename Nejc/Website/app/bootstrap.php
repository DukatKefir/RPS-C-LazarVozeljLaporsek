<?php
declare(strict_types=1);

if (!defined('BUDDY_APP')) {
    http_response_code(404);
    exit;
}

ini_set('display_errors', '0');
ini_set('log_errors', '1');

require_once __DIR__ . '/Http.php';
require_once __DIR__ . '/Database.php';
require_once __DIR__ . '/RateLimiter.php';
require_once __DIR__ . '/SessionManager.php';
require_once __DIR__ . '/AuthService.php';

$config = require __DIR__ . '/config.php';
Http::securityHeaders();

set_exception_handler(static function (Throwable $error): void {
    // Podrobnosti SQL, poti in sklad klicev ne smejo v odgovor obiskovalcu.
    $status = $error instanceof HttpError ? $error->status : 500;
    $message = $error instanceof HttpError ? $error->getMessage() : 'Prišlo je do napake na strežniku.';
    Http::json(['error' => $message], $status);
});

Http::validateRequest($config);
