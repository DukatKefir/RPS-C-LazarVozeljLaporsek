<?php
if (!defined('BUDDY_APP')) {
    http_response_code(404);
    exit;
}
?>
        <section class="panel auth-panel">
            <h1>Registracija</h1>
            <p>Ustvari brezplačen račun.</p>

            <form id="register-form" class="auth-form">
                <div class="form-field">
                    <label for="register-name">Ime</label>
                    <input
                        id="register-name"
                        name="name"
                        type="text"
                        autocomplete="name"
                        minlength="2"
                        maxlength="60"
                        required
                    >
                </div>

                <div class="form-field">
                    <label for="register-email">E-pošta</label>
                    <input
                        id="register-email"
                        name="email"
                        type="email"
                        autocomplete="username"
                        maxlength="254"
                        required
                    >
                </div>

                <div class="form-field">
                    <label for="register-password">Geslo</label>
                    <input
                        id="register-password"
                        name="password"
                        type="password"
                        autocomplete="new-password"
                        minlength="12"
                        maxlength="128"
                        aria-describedby="password-help"
                        required
                    >
                    <p id="password-help" class="muted">Najmanj 12 znakov.</p>
                </div>

                <div class="form-field">
                    <label for="register-confirmation">Ponovi geslo</label>
                    <input
                        id="register-confirmation"
                        name="passwordConfirmation"
                        type="password"
                        autocomplete="new-password"
                        minlength="12"
                        maxlength="128"
                        required
                    >
                </div>

                <button class="button" type="submit" disabled>Ustvari račun</button>
            </form>

            <p>Račun že imaš? <a href="<?= escapeHtml('index.php?page=login' . $nextQuery) ?>">Prijavi se</a>.</p>
        </section>
