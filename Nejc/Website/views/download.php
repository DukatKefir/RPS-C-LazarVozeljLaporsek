<?php
if (!defined('BUDDY_APP') || !isset($currentUser)) {
    http_response_code(404);
    exit;
}
?>
        <section class="panel download-panel" data-protected>
            <p class="eyebrow">NAMESTITEV ZA WINDOWS</p>
            <h1>Prenos Desktop Buddyja</h1>
            <p>
                Pripravljamo EXE namestitveni program, ki bo poskrbel za
                potrebno okolje in lokalni model.
            </p>
            <p>Trenutno ni mogoče prenesti nobene različice, tudi po prijavi.</p>

            <button class="button" type="button" disabled>
                EXE še ni na voljo
            </button>

            <p class="muted">
                Račun lahko ustvariš že zdaj. Prenos bo omogočen pozneje.
            </p>
        </section>
