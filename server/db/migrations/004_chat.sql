-- Переписка между принятыми друзьями: сообщения, реакции, отметки прочтения.
--
-- messages.kind:
--   'text'   — обычное сообщение, весь смысл в body;
--   'invite' — карточка приглашения в партию. body пустой, значение несут
--              invite_game_id (та же самая партия, что создаёт обычный
--              friend-invite), invite_time_control_id и invite_status.
--
-- invite_status ('pending' | 'accepted' | 'declined') обновляется хуком в
-- обработчиках invite-accepted/invite-declined (server/sockets/game.ts) —
-- поэтому карточка в чате показывает актуальный статус независимо от того,
-- откуда решение было принято (из чата или из обычного тоста).
--
-- ON DELETE CASCADE по friendship_id — осознанное решение: удалили человека
-- из друзей, значит и история переписки с ним уходит вместе с дружбой.

CREATE TABLE messages (
  id SERIAL PRIMARY KEY,
  friendship_id INTEGER NOT NULL REFERENCES friendships(id) ON DELETE CASCADE,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind VARCHAR(16) NOT NULL DEFAULT 'text',
  body TEXT NOT NULL,
  invite_game_id INTEGER REFERENCES games(id),
  invite_time_control_id VARCHAR(16),
  invite_status VARCHAR(16) NOT NULL DEFAULT 'pending',
  edited_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Лента треда: «сообщения этой дружбы, свежие сверху».
CREATE INDEX idx_messages_thread ON messages (friendship_id, created_at DESC);

-- Один пользователь может поставить на одно сообщение несколько РАЗНЫХ
-- реакций, но не продублировать одну и ту же — это и обеспечивает составной
-- первичный ключ. Повторный клик по своей реакции снимает её (toggle).
CREATE TABLE message_reactions (
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji VARCHAR(16) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, user_id, emoji)
);

-- Какую из двух колонок обновлять при прочтении, зависит от того, кто из
-- участников дружбы сейчас читает (requester_id/addressee_id уже есть).
ALTER TABLE friendships
  ADD COLUMN requester_last_read TIMESTAMP,
  ADD COLUMN addressee_last_read TIMESTAMP;
