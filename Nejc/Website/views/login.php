<?php
if (!defined('BUDDY_APP')) {
    http_response_code(404);
    exit;
}
?>
        <section class="panel auth-panel">
            <h1>Prijava</h1>
            <p>Prijavi se v svoj račun.</p>

            <form id="login-form" class="auth-form">
                <div class="form-field">
                    <label for="login-email">E-pošta</label>
                    <input
                        id="login-email"
                        name="email"
                        type="email"
                        autocomplete="username"
                        maxlength="254"
                        required
                    >
                </div>

                <div class="form-field">
                    <label for="login-password">Geslo</label>
                    <input
                        id="login-password"
                        name="password"
                        type="password"
                        autocomplete="current-password"
                        minlength="12"
                        maxlength="128"
                        required
                    >
                </div>

                <button class="button" type="submit" disabled>Prijavi se</button>
            </form>

            <p>Še nimaš računa? <a href="<?= escapeHtml('index.php?page=register' . $nextQuery) ?>">Registriraj se</a>.</p>
        </section>
