-- Email ownership proof (6-digit OTP) and Google sign-in. Existing accounts stay verified (DEFAULT TRUE);
-- new self-registrations are inserted with email_verified = 0 until the code is confirmed.
ALTER TABLE users ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT TRUE AFTER email;
ALTER TABLE users ADD COLUMN google_id VARCHAR(40) NULL UNIQUE AFTER email_verified;

CREATE TABLE IF NOT EXISTS email_verifications (
  user_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  code_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  sent_at DATETIME NOT NULL,
  CONSTRAINT fk_emailver_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
