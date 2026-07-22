-- Пометка «рейтинговая» на карточке приглашения в чате. Денормализуем на само
-- сообщение — ровно так же, как уже хранится invite_time_control_id, — чтобы
-- карточка показывала пометку без джойна на games. Старые карточки (DEFAULT
-- false) остаются обычными.

ALTER TABLE messages
  ADD COLUMN invite_ranked BOOLEAN NOT NULL DEFAULT false;
