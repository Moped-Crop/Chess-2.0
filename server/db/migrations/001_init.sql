-- Схема Chess 2 Online: пользователи, статистика, дружба, партии.

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(32) UNIQUE NOT NULL,
  display_name VARCHAR(64) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  avatar_base64 TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE stats (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  draws INTEGER DEFAULT 0,
  games_played INTEGER DEFAULT 0
);

CREATE TABLE friendships (
  id SERIAL PRIMARY KEY,
  requester_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  addressee_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(16) NOT NULL DEFAULT 'pending', -- pending | accepted | declined
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(requester_id, addressee_id)
);

CREATE TABLE games (
  id SERIAL PRIMARY KEY,
  white_id INTEGER REFERENCES users(id),
  black_id INTEGER REFERENCES users(id),
  status VARCHAR(16) NOT NULL DEFAULT 'active', -- waiting | active | finished | aborted
  result VARCHAR(16),                           -- white | black | draw | aborted
  moves JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMP DEFAULT NOW(),
  finished_at TIMESTAMP
);
