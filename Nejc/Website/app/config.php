<?php
declare(strict_types=1);

if (!defined('BUDDY_APP')) {
    http_response_code(404);
    exit;
}

// Baza je zunaj spletne mape, tudi ce Apache ne uposteva .htaccess.
$projectId = substr(hash('sha256', dirname(__DIR__)), 0, 16);
$storage = getenv('BUDDY_DATA_DIR') ?: sys_get_temp_dir() . '/desktop-buddy-web-' . $projectId;

return [
    'storage' => $storage,
    'allowed_hosts' => ['localhost', '127.0.0.1', '::1'],
    'cookie_name' => 'buddy_' . $projectId,
    'session_lifetime' => 8 * 60 * 60,
    'session_idle_timeout' => 30 * 60,
    'session_rotation_interval' => 15 * 60,
    'auth_attempts' => 20,
    'auth_window' => 15 * 60,
];
