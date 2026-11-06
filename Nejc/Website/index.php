<?php
declare(strict_types=1);

define('BUDDY_APP', true);
require __DIR__ . '/app/bootstrap.php';

if (!in_array($_SERVER['REQUEST_METHOD'], ['GET', 'HEAD'], true)) {
    header('Allow: GET, HEAD');
    throw new HttpError('Metoda ni dovoljena.', 405);
}

// Imena predlog niso nikoli neposredno vzeta iz URL-ja.
$pages = [
    'home' => ['title' => 'Desktop Buddy', 'template' => 'home.php'],
    'download' => ['title' => 'Prenos', 'template' => 'download.php'],
    'login' => ['title' => 'Prijava', 'template' => 'login.php'],
    'register' => ['title' => 'Registracija', 'template' => 'register.php'],
];
$page = $_GET['page'] ?? 'home';

if (!is_string($page) || !isset($pages[$page])) {
    http_response_code(404);
    $page = 'home';
}

$currentUser = null;

// Zasebne vsebine ne posljemo v HTML, ce prijava ni veljavna.
if (isset($_COOKIE[$config['cookie_name']])) {
    $database = Database::connect($config);
    $sessions = new SessionManager($database, $config);
    $accounts = new AuthService($database);
    $session = $sessions->current();

    if ($session !== null && $session['user_id'] !== null) {
        $session = $sessions->refresh($session);
        $currentUser = $accounts->publicUser((int) $session['user_id']);
    }
}

if ($page === 'download' && $currentUser === null) {
    header('Location: index.php?page=login&next=download', true, 303);
    exit;
}

// Cilj po prijavi je lahko samo nasa stran za prenos, nikoli poljuben URL.
$nextQuery = ($_GET['next'] ?? '') === 'download' ? '&next=download' : '';
$title = $pages[$page]['title'];
header('Content-Type: text/html; charset=utf-8');

require __DIR__ . '/views/header.php';
require __DIR__ . '/views/' . $pages[$page]['template'];
require __DIR__ . '/views/footer.php';
