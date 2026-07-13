-- Онлайн-таймер + персистентная причина завершения партии.
--
-- time_control_id — id пресета из src/app/clock/clock.ts ('none' | '1+0' |
-- '3+2' | ...). NULL = партия создана до этой фичи (без часов) — полная
-- обратная совместимость со всеми уже сыгранными партиями.
--
-- white_ms/black_ms — остаток времени сторон в миллисекундах НА МОМЕНТ
-- turn_started_at (начало текущего хода, Date.now() сервера). Живой остаток
-- активной стороны = white_ms/black_ms − (now − turn_started_at).
-- turn_started_at = NULL — часы остановлены (партия окончена или без часов).
--
-- win_reason: 'game' = партия закончилась по правилам (мат/пат/ничья —
-- различает клиент той же эвристикой, что в GameOverModal), 'resign' =
-- сдача, 'abandon' = разрыв соединения, 'timeout' = упал флажок.

ALTER TABLE games
  ADD COLUMN time_control_id VARCHAR(16),
  ADD COLUMN white_ms INTEGER,
  ADD COLUMN black_ms INTEGER,
  ADD COLUMN turn_started_at TIMESTAMP,
  ADD COLUMN win_reason VARCHAR(16);

-- Индекс под запросы истории: «завершённые партии пользователя, свежие сверху».
CREATE INDEX idx_games_history ON games (white_id, black_id, status, finished_at DESC);
