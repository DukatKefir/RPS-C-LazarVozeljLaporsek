-- MySQL 8 verzija sheme (pretvorjeno iz SQLite).
-- Uvoz v MySQL Workbench: File > Import > Reverse Engineer MySQL Create Script...

CREATE SCHEMA IF NOT EXISTS `app` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE `app`;

CREATE TABLE IF NOT EXISTS `users` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(60) NOT NULL,
    `email` VARCHAR(254) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `created_at` BIGINT NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `users_email_unique` (`email`),
    CONSTRAINT `users_name_len` CHECK (CHAR_LENGTH(`name`) BETWEEN 2 AND 60),
    CONSTRAINT `users_email_len` CHECK (CHAR_LENGTH(`email`) BETWEEN 3 AND 254)
) ENGINE = InnoDB;

-- user_id = NULL pomeni zacasno sejo za CSRF pred prijavo.
CREATE TABLE IF NOT EXISTS `sessions` (
    `token_hash` VARCHAR(128) NOT NULL,
    `user_id` INT UNSIGNED NULL,
    `csrf_token` VARCHAR(128) NOT NULL,
    `user_agent_hash` VARCHAR(128) NOT NULL,
    `created_at` BIGINT NOT NULL,
    `last_seen_at` BIGINT NOT NULL,
    `rotated_at` BIGINT NOT NULL,
    `expires_at` BIGINT NOT NULL,
    PRIMARY KEY (`token_hash`),
    INDEX `sessions_user` (`user_id`),
    INDEX `sessions_expiry` (`expires_at`),
    CONSTRAINT `sessions_user_fk`
        FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
        ON DELETE CASCADE
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS `rate_limits` (
    `bucket` VARCHAR(255) NOT NULL,
    `attempts` INT NOT NULL,
    `resets_at` BIGINT NOT NULL,
    PRIMARY KEY (`bucket`)
) ENGINE = InnoDB;
