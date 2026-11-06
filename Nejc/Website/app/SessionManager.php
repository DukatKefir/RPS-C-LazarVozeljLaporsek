<?php
declare(strict_types=1);

if (!defined('BUDDY_APP')) {
    http_response_code(404);
    exit;
}

final class SessionManager
{
    public function __construct(
        private readonly PDO $database,
        private readonly array $config
    ) {
    }

    private function browserHash(): string
    {
        // IP ne vezemo na sejo, ker se lahko pri veljavnem uporabniku spremeni.
        return hash('sha256', substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 512));
    }

    private function setCookie(string $token, int $expires): void
    {
        $path = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'])), '/');

        setcookie($this->config['cookie_name'], $token, [
            'expires' => $expires,
            'path' => $path . '/',
            'secure' => Http::isHttps(),
            'httponly' => true,
            'samesite' => 'Strict',
        ]);
    }

    public function current(): ?array
    {
        $token = $_COOKIE[$this->config['cookie_name']] ?? '';

        if (!is_string($token) || !preg_match('/\A[a-f0-9]{64}\z/', $token)) {
            return null;
        }

        $query = $this->database->prepare('SELECT * FROM sessions WHERE token_hash = ?');
        $query->execute([hash('sha256', $token)]);
        $session = $query->fetch();

        if (!$session) {
            return null;
        }

        if (!hash_equals($session['user_agent_hash'], $this->browserHash())) {
            // Drug brskalnik ne dobi podatkov in ne preklice veljavne seje zrtve.
            $this->setCookie('', time() - 3600);
            return null;
        }

        $now = time();
        $expired = (int) $session['expires_at'] <= $now;
        $idle = (int) $session['last_seen_at'] + $this->config['session_idle_timeout'] <= $now;

        if ($expired || $idle) {
            $this->revoke($session);
            return null;
        }

        $update = $this->database->prepare('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?');
        $update->execute([$now, $session['token_hash']]);

        return $session;
    }

    public function create(?int $userId, ?array $previous = null, bool $preserveLifetime = false): array
    {
        $now = time();
        $token = bin2hex(random_bytes(32));
        $session = [
            'token_hash' => hash('sha256', $token),
            'user_id' => $userId,
            'csrf_token' => $preserveLifetime ? $previous['csrf_token'] : bin2hex(random_bytes(32)),
            'user_agent_hash' => $this->browserHash(),
            'created_at' => $preserveLifetime ? (int) $previous['created_at'] : $now,
            'last_seen_at' => $now,
            'rotated_at' => $now,
            'expires_at' => $preserveLifetime ? (int) $previous['expires_at'] : $now + $this->config['session_lifetime'],
        ];

        $this->database->beginTransaction();
        try {
            $cleanup = $this->database->prepare('DELETE FROM sessions WHERE expires_at <= ? OR last_seen_at <= ?');
            $cleanup->execute([$now, $now - $this->config['session_idle_timeout']]);

            if ($previous) {
                $this->deleteToken($previous['token_hash']);
            }

            $insert = $this->database->prepare(
                'INSERT INTO sessions (token_hash, user_id, csrf_token, user_agent_hash, created_at, last_seen_at, rotated_at, expires_at)
                 VALUES (:token_hash, :user_id, :csrf_token, :user_agent_hash, :created_at, :last_seen_at, :rotated_at, :expires_at)'
            );
            $insert->execute($session);
            $this->database->commit();
        } catch (Throwable $error) {
            $this->database->rollBack();
            throw $error;
        }

        $this->setCookie($token, $session['expires_at']);
        return $session;
    }

    public function refresh(array $session): array
    {
        if ((int) $session['rotated_at'] + $this->config['session_rotation_interval'] > time()) {
            return $session;
        }

        // Menjamo zeton, vendar ne podaljsamo absolutne veljavnosti prijave.
        $userId = $session['user_id'] === null ? null : (int) $session['user_id'];
        return $this->create($userId, $session, true);
    }

    public function requireCsrf(?array $session): array
    {
        if (!$session) {
            throw new HttpError('Seja je potekla. Osveži stran in poskusi znova.', 401);
        }

        $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
        if (!is_string($token) || !hash_equals($session['csrf_token'], $token)) {
            throw new HttpError('Neveljaven varnostni žeton. Osveži stran.', 403);
        }

        return $session;
    }

    public function revoke(array $session): void
    {
        $this->deleteToken($session['token_hash']);
        $this->setCookie('', time() - 3600);
    }

    private function deleteToken(string $hash): void
    {
        $delete = $this->database->prepare('DELETE FROM sessions WHERE token_hash = ?');
        $delete->execute([$hash]);
    }
}
