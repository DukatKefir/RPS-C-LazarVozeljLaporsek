'use strict';

// JS uporablja ID-je in data-guest/data-member. Razrede CSS lahko oblikovalka spreminja.
const currentPage = document.body.dataset.page;
const nextPage = new URLSearchParams(window.location.search).get('next') === 'download'
    ? 'download'
    : null;
const elements = {
    accountName: document.getElementById('account-name'),
    logoutButton: document.getElementById('logout-button'),
    loginForm: document.getElementById('login-form'),
    registerForm: document.getElementById('register-form'),
    notice: document.getElementById('notice'),
    protectedContent: document.querySelector('[data-protected]'),
};

const state = {
    user: null,
    csrfToken: null,
    pending: false,
};

function showNotice(message, isError = false) {
    elements.notice.textContent = message;
    elements.notice.dataset.error = String(isError);
    elements.notice.hidden = false;
}

function renderAccount() {
    const isLoggedIn = state.user !== null;

    if (elements.protectedContent) {
        elements.protectedContent.hidden = !isLoggedIn;
    }

    if (!isLoggedIn && currentPage === 'download') {
        window.location.replace('index.php?page=login&next=download');
        return;
    }

    document.querySelectorAll('[data-guest]').forEach((element) => {
        element.hidden = isLoggedIn;
    });

    document.querySelectorAll('[data-member]').forEach((element) => {
        element.hidden = !isLoggedIn;
    });

    // Ime je vedno besedilo, nikoli HTML iz uporabnikovega vnosa.
    elements.accountName.textContent = isLoggedIn ? `Živjo, ${state.user.name}` : '';
    elements.accountName.hidden = !isLoggedIn;
    elements.logoutButton.hidden = !isLoggedIn;
}

async function apiRequest(action, body = undefined) {
    const url = new URL('api.php', window.location.href);
    url.searchParams.set('action', action);

    const headers = { Accept: 'application/json' };
    const options = {
        method: body === undefined ? 'GET' : 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        signal: AbortSignal.timeout(15000),
        headers,
    };

    if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
        headers['X-CSRF-Token'] = state.csrfToken || '';
        options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    let result;

    try {
        result = await response.json();
    } catch {
        throw new Error('Strežnik ne vrača pričakovanega odgovora. Preveri zagon PHP.');
    }

    if (!response.ok) {
        throw new Error(result.error || 'Zahteva ni uspela.');
    }

    if (typeof result.csrfToken === 'string') {
        state.csrfToken = result.csrfToken;
    }

    return result;
}

async function refreshSession() {
    const result = await apiRequest('session');
    state.user = result.user;
    renderAccount();
}

function connectAuthForm(form, action) {
    if (!form) {
        return;
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        if (state.pending || !state.csrfToken) {
            return;
        }

        const input = Object.fromEntries(new FormData(form));
        if (action === 'register' && input.password !== input.passwordConfirmation) {
            showNotice('Gesli se ne ujemata.', true);
            return;
        }

        const button = form.querySelector('button[type="submit"]');
        state.pending = true;
        button.disabled = true;
        elements.notice.hidden = true;

        try {
            await apiRequest(action, input);
            form.reset();
            window.location.assign(nextPage === 'download'
                ? 'index.php?page=download'
                : 'index.php?signedIn=1');
        } catch (error) {
            showNotice(error.message, true);

            // Ob poteku seje pridobimo nov CSRF zeton; gesla ne posiljamo ponovno.
            try {
                await refreshSession();
            } catch {
                state.csrfToken = null;
            }
        } finally {
            state.pending = false;
            button.disabled = state.csrfToken === null;
        }
    });
}

elements.logoutButton.addEventListener('click', async () => {
    if (state.pending) {
        return;
    }

    state.pending = true;
    elements.logoutButton.disabled = true;

    try {
        await apiRequest('logout', {});
        state.user = null;

        if (currentPage === 'download') {
            window.location.replace('index.php');
            return;
        }

        renderAccount();
        showNotice('Uspešno si se odjavil.');
    } catch (error) {
        showNotice(error.message, true);
    } finally {
        state.pending = false;
        elements.logoutButton.disabled = false;
    }
});

connectAuthForm(elements.loginForm, 'login');
connectAuthForm(elements.registerForm, 'register');

refreshSession().then(() => {
    [elements.loginForm, elements.registerForm].forEach((form) => {
        if (form) {
            form.querySelector('button[type="submit"]').disabled = false;
        }
    });

    if (state.user && new URLSearchParams(window.location.search).has('signedIn')) {
        showNotice('Uspešno si prijavljen. Prenosi ostajajo onemogočeni.');
        window.history.replaceState(null, '', 'index.php');
    }
}).catch((error) => {
    if (currentPage === 'download') {
        if (elements.protectedContent) {
            elements.protectedContent.hidden = true;
        }
        window.location.replace('index.php?page=login&next=download');
        return;
    }

    showNotice(`Prijava trenutno ni dosegljiva. ${error.message}`, true);
});

// Tudi pri vrnitvi z gumbom Nazaj preverimo, ali je zasebna stran se dovoljena.
window.addEventListener('pagehide', () => {
    if (elements.protectedContent) {
        elements.protectedContent.hidden = true;
    }
});

window.addEventListener('pageshow', (event) => {
    if (event.persisted && !state.pending) {
        refreshSession().catch(() => {
            if (currentPage === 'download') {
                window.location.replace('index.php?page=login&next=download');
            }
        });
    }
});

// Ob vrnitvi preverimo sejo. Neaktivnega zavihka ne ohranjamo prijavljenega.
document.addEventListener('visibilitychange', () => {
    if (document.hidden && elements.protectedContent) {
        elements.protectedContent.hidden = true;
    }

    if (!document.hidden && !state.pending) {
        refreshSession().catch(() => {
            state.csrfToken = null;

            if (currentPage === 'download') {
                window.location.replace('index.php?page=login&next=download');
                return;
            }

            showNotice('Seja ni dosegljiva. Osveži stran.', true);
        });
    }
});
