<?php
declare(strict_types=1);

if (!defined('BUDDY_APP')) {
    http_response_code(404);
    exit;
}

final class AuthService
{
    // Tudi neobstojeci racun opravi primerljivo zahtevno preverjanje gesla.
    private const DUMMY_ARGON = '$argon2id$v=19$m=65536,t=3,p=1$V04uM1RUR05oTElrV0ROQg$HbZXuD6w7gdNmp2gSGbRNOrHayQWv9CxDSoMcDWtSL4';
    private const DUMMY_BCRYPT = '$2y$12$JNt8m7OINYfEo.DEufdsc.7IV7NfNrmB.GYPQCvocT.Ov9Yg8O.8i';

    public function __construct(private readonly PDO $database)
    {
    }

    private function credentials(array $input): array
    {
        $email = $input['email'] ?? null;
        $password = $input['password'] ?? null;

        if (!is_string($email) || strlen($email) > 254 || !filter_var(trim($email), FILTER_VALIDATE_EMAIL)) {
            throw new HttpError('Vnesi veljaven e-poštni naslov.');
        }

        if (!is_string($password) || mb_strlen($password, 'UTF-8') < 12 || mb_strlen($password, 'UTF-8') > 128 || str_contains($password, "\0")) {
            throw new HttpError('Geslo mora imeti od 12 do 128 znakov.');
        }

        if (!defined('PASSWORD_ARGON2ID') && strlen($password) > 72) {
            throw new HttpError('Ta strežnik podpira gesla do 72 bajtov. Uporabi krajše geslo.');
        }

        return [strtolower(trim($email)), $password];
    }

    public function register(array $input): array
    {
        [$email, $password] = $this->credentials($input);
        $name = $input['name'] ?? null;

        if (!is_string($name) || mb_strlen(trim($name), 'UTF-8') < 2 || mb_strlen(trim($name), 'UTF-8') > 60 || preg_match('/[\x00-\x1f]/', $name)) {
            throw new HttpError('Ime mora imeti od 2 do 60 znakov.');
        }

        if (($input['passwordConfirmation'] ?? null) !== $password) {
            throw new HttpError('Gesli se ne ujemata.');
        }

        $algorithm = defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_BCRYPT;
        $options = defined('PASSWORD_ARGON2ID')
            ? ['memory_cost' => 65536, 'time_cost' => 3, 'threads' => 1]
            : ['cost' => 12];
        $hash = password_hash($password, $algorithm, $options);

        try {
            $insert = $this->database->prepare(
                'INSERT INTO users (name, email, password_hash, created_at) VALUES (?, ?, ?, ?)'
            );
            $insert->execute([trim($name), $email, $hash, time()]);
        } catch (PDOException $error) {
            if ($error->getCode() === '23000' && str_contains($error->getMessage(), 'users.email')) {
                throw new HttpError('Račun s tem naslovom že obstaja. Prijavi se.', 409);
            }
            throw $error;
        }

        return $this->publicUser((int) $this->database->lastInsertId());
    }

    public function login(array $input): array
    {
        [$email, $password] = $this->credentials($input);
        $query = $this->database->prepare('SELECT id, password_hash FROM users WHERE email = ?');
        $query->execute([$email]);
        $record = $query->fetch();

        $dummyHash = defined('PASSWORD_ARGON2ID') ? self::DUMMY_ARGON : self::DUMMY_BCRYPT;
        $valid = password_verify($password, $record ? $record['password_hash'] : $dummyHash);

        if (!$record || !$valid) {
            throw new HttpError('E-pošta ali geslo ni pravilno.', 401);
        }

        return $this->publicUser((int) $record['id']);
    }

    public function publicUser(?int $id): ?array
    {
        if ($id === null) {
            return null;
        }

        $query = $this->database->prepare('SELECT id, name, email FROM users WHERE id = ?');
        $query->execute([$id]);
        $user = $query->fetch();

        if (!$user) {
            return null;
        }

        return ['id' => (int) $user['id'], 'name' => $user['name'], 'email' => $user['email']];
    }

    public function requireUser(?array $session): array
    {
        $userId = $session['user_id'] ?? null;
        $user = $userId === null ? null : $this->publicUser((int) $userId);

        if ($user === null) {
            throw new HttpError('Za dostop se najprej prijavi.', 401);
        }

        return $user;
    }
}
