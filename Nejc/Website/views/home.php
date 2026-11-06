<?php
if (!defined('BUDDY_APP')) {
    http_response_code(404);
    exit;
}
?>
        <section class="intro">
            <p class="eyebrow">LOKALNI NAMIZNI POMOČNIK</p>
            <h1>Tvoj pomočnik na računalniku.</h1>
            <p>
                Pogovarjaj se z Buddyjem, ustvari datoteko ali odpri mapo.
                Jezikovni model teče pri tebi, brez plačljivega API-ja.
            </p>
            <?php if ($currentUser !== null): ?>
                <a class="button" href="index.php?page=download" data-member>Preveri razpoložljivost</a>
            <?php else: ?>
                <a class="button" href="index.php?page=login" data-guest>Prijavi se</a>
            <?php endif; ?>
        </section>

        <div class="features">
            <section class="feature">
                <h2>Pogovor</h2>
                <p>Vprašanja, ideje in pomoč pri vsakdanjih stvareh.</p>
            </section>

            <section class="feature">
                <h2>Opravila</h2>
                <p>Ustvarjanje datotek, odpiranje map in zagon podprtih aplikacij.</p>
            </section>

            <section class="feature">
                <h2>Lokalno</h2>
                <p>Pogovor po namestitvi modela deluje tudi brez interneta.</p>
            </section>
        </div>

