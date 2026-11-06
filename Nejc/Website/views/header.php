<?php
if (!defined('BUDDY_APP')) {
    http_response_code(404);
    exit;
}
?>
<!doctype html>
<html lang="sl">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="Desktop Buddy — lokalni namizni pomočnik.">
    <title><?= escapeHtml($title) ?> · Desktop Buddy</title>
    <link rel="stylesheet" href="assets/css/style.css">
    <script src="assets/js/app.js" defer></script>
</head>
<body data-page="<?= escapeHtml($page) ?>">
    <header class="site-header">
        <a class="site-brand" href="index.php">Desktop Buddy</a>

        <nav class="site-nav" aria-label="Glavna navigacija">
            <a href="index.php">Domov</a>
            <?php if ($currentUser !== null): ?>
                <a href="index.php?page=download" data-member>Prenos</a>
            <?php endif; ?>
            <a href="index.php?page=login" data-guest <?= $currentUser !== null ? 'hidden' : '' ?>>Prijava</a>
            <a href="index.php?page=register" data-guest <?= $currentUser !== null ? 'hidden' : '' ?>>Registracija</a>
            <span id="account-name" <?= $currentUser === null ? 'hidden' : '' ?>><?= $currentUser !== null ? escapeHtml('Živjo, ' . $currentUser['name']) : '' ?></span>
            <button id="logout-button" class="button-link" type="button" <?= $currentUser === null ? 'hidden' : '' ?>>
                Odjava
            </button>
        </nav>
    </header>

    <main class="site-main">
