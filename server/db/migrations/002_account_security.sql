-- Безопасность аккаунта: обязательное подтверждение почты, восстановление
-- пароля, двухфакторная аутентификация (TOTP), мягкое удаление аккаунта.

ALTER TABLE users
  -- ВАЖНО: колонка добавляется со значением true по умолчанию — это
  -- нужно, чтобы все УЖЕ существующие пользователи (заведённые до этой
  -- миграции) остались рабочими и не оказались внезапно заблокированы
  -- задним числом требованием подтвердить почту, которого при их
  -- регистрации ещё не существовало.
  ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN email_verify_token_hash TEXT,
  ADD COLUMN email_verify_expires TIMESTAMP,
  ADD COLUMN email_verify_last_sent_at TIMESTAMP,

  ADD COLUMN pending_email VARCHAR(255),
  ADD COLUMN pending_email_token_hash TEXT,
  ADD COLUMN pending_email_expires TIMESTAMP,

  ADD COLUMN password_reset_token_hash TEXT,
  ADD COLUMN password_reset_expires TIMESTAMP,

  ADD COLUMN totp_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN totp_secret_enc TEXT,
  ADD COLUMN pending_totp_secret_enc TEXT,
  ADD COLUMN totp_backup_codes JSONB NOT NULL DEFAULT '[]',

  ADD COLUMN account_delete_code_hash TEXT,
  ADD COLUMN account_delete_expires TIMESTAMP,
  ADD COLUMN account_delete_attempts INTEGER NOT NULL DEFAULT 0,

  ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN deleted_at TIMESTAMP;

-- Начиная с этой строки все НОВЫЕ регистрации по умолчанию считаются
-- неподтверждёнными — код регистрации (см. промт) в любом случае
-- проставляет false явно, но пусть и значение по умолчанию в схеме
-- отражает реальное намерение на будущее.
ALTER TABLE users ALTER COLUMN email_verified SET DEFAULT false;
