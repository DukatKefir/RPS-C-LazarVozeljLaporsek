<?php
declare(strict_types=1);

define('BUDDY_APP', true);
require __DIR__ . '/app/bootstrap.php';

$action = $_GET['action'] ?? 'session';
$allowedMethods = [
    'session' => 'GET',
    'release' => 'GET',
    'download' => 'GET',
    'register' => 'POST',
    'login' => 'POST',
    'logout' => 'POST',
];

if (!is_string($action) || !isset($allowedMethods[$action]) || !empty($_SERVER['PATH_INFO'])) {
    throw new HttpError('Pot ne obstaja.', 404);
}

if ($_SERVER['REQUEST_METHOD'] !== $allowedMethods[$action]) {
    header('Allow: ' . $allowedMethods[$action]);
    throw new HttpError('Metoda ni dovoljena.', 405);
}

$input = $_SERVER['REQUEST_METHOD'] === 'POST' ? Http::readJson() : [];
$database = Database::connect($config);
$sessions = new SessionManager($database, $config);
$accounts = new AuthService($database);
$limiter = new RateLimiter($database);
$session = $sessions->current();
$clientIp = (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown');

// Ista strezniska zascita velja za metapodatke in neposredni prenos.
if (in_array($action, ['release', 'download'], true)) {
    $accounts->requireUser($session);

    if ($action === 'download') {
        throw new HttpError('Prenosi so trenutno onemogočeni.', 503);
    }

    Http::json([
        'available' => false,
        'message' => 'EXE namestitveni program še ni na voljo. Prenosi so trenutno onemogočeni.',
    ]);
}

if ($action === 'session') {
    if ($session === null) {
        $limiter->check('new-session:' . $clientIp, 30, 15 * 60);
        $session = $sessions->create(null);
    } else {
        $session = $sessions->refresh($session);
    }

    $userId = $session['user_id'] === null ? null : (int) $session['user_id'];
    Http::json([
        'user' => $accounts->publicUser($userId),
        'csrfToken' => $session['csrf_token'],
    ]);
}

// Vsaka sprememba preveri sejo in njen CSRF zeton, tudi prijava in odjava.
$session = $sessions->requireCsrf($session);

if ($action === 'logout') {
    $sessions->revoke($session);
    $guest = $sessions->create(null);
    Http::json(['user' => null, 'csrfToken' => $guest['csrf_token']]);
}

$limiter->check('auth-ip:' . $clientIp, $config['auth_attempts'], $config['auth_window']);

if (isset($input['email']) && is_string($input['email'])) {
    $emailKey = strtolower(trim(substr($input['email'], 0, 254)));
    $limiter->check('auth-email:' . $emailKey, 10, $config['auth_window']);
}

$user = $action === 'register' ? $accounts->register($input) : $accounts->login($input);
$authenticated = $sessions->create($user['id'], $session);

Http::json([
    'user' => $user,
    'csrfToken' => $authenticated['csrf_token'],
], $action === 'register' ? 201 : 200);
