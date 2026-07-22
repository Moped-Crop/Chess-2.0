-- Рейтинговая система: Elo-рейтинг, отдельная статистика по рейтинговым
-- партиям, история изменения рейтинга внутри партий.
--
-- Рейтинг ОДИН на все контроли времени (пулю/блиц/рапид/классику не дробим):
-- при маленьком онлайне отдельный пул под каждую категорию никогда бы не
-- сошёлся. Подробности и обоснование — в CLAUDE.md.

ALTER TABLE stats
  -- Старт 1000 — третья ступень лестницы рангов (Петух), чтобы новичку было
  -- куда и падать, и расти. Existing-строки stats получают 1000 из DEFAULT;
  -- новые пользователи — тоже (register полагается на этот DEFAULT).
  ADD COLUMN rating INTEGER NOT NULL DEFAULT 1000,
  ADD COLUMN peak_rating INTEGER NOT NULL DEFAULT 1000,
  -- Отдельная четвёрка счётчиков ТОЛЬКО по рейтинговым партиям. Обычные
  -- wins/losses/draws/games_played остаются и считают ВСЕ онлайн-партии.
  ADD COLUMN ranked_games_played INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN ranked_wins INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN ranked_losses INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN ranked_draws INTEGER NOT NULL DEFAULT 0;

ALTER TABLE games
  -- Уже сыгранные партии остаются нерейтинговыми (DEFAULT false) — обратная
  -- совместимость сохраняется сама.
  ADD COLUMN is_ranked BOOLEAN NOT NULL DEFAULT false,
  -- Рейтинг сторон ДО партии и дельты — нужны прямо сейчас (история партий
  -- показывает «+18» рядом с результатом) и на будущее (график роста рейтинга,
  -- который задним числом уже не восстановить). NULL для нерейтинговых.
  ADD COLUMN white_rating_before INTEGER,
  ADD COLUMN black_rating_before INTEGER,
  ADD COLUMN white_rating_delta INTEGER,
  ADD COLUMN black_rating_delta INTEGER;

-- Индекс под лидерборд: «топ по рейтингу, сверху вниз».
CREATE INDEX idx_stats_leaderboard ON stats (rating DESC);
