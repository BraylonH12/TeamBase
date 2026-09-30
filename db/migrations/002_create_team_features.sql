ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(100);

UPDATE users
SET name = COALESCE(NULLIF(BTRIM(name), ''), SPLIT_PART(email, '@', 1))
WHERE name IS NULL OR BTRIM(name) = '';

UPDATE users
SET role = CASE WHEN LOWER(role) = 'player' THEN 'Player' ELSE 'Owner' END;

ALTER TABLE users ALTER COLUMN name SET NOT NULL;
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'Owner';
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('Owner', 'Player'));

CREATE TABLE teams (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  sport VARCHAR(50) NOT NULL,
  owner_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE players (
  id SERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  jersey_number INTEGER NOT NULL CHECK (jersey_number BETWEEN 0 AND 999),
  position VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id)
);

CREATE TABLE events (
  id SERIAL PRIMARY KEY,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  event_type VARCHAR(20) NOT NULL CHECK (event_type IN ('Practice', 'Game')),
  title VARCHAR(100) NOT NULL,
  event_date DATE NOT NULL,
  event_time TIME NOT NULL,
  location VARCHAR(255) NOT NULL,
  opponent_team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE game_requests (
  id SERIAL PRIMARY KEY,
  sender_team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  receiver_team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  proposed_date DATE NOT NULL,
  proposed_time TIME NOT NULL,
  location VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'Pending'
    CHECK (status IN ('Pending', 'Accepted', 'Rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (sender_team_id <> receiver_team_id)
);

CREATE TABLE posts (
  id SERIAL PRIMARY KEY,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  author_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(150) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX players_team_id_idx ON players(team_id);
CREATE INDEX events_team_date_idx ON events(team_id, event_date, event_time);
CREATE INDEX game_requests_receiver_status_idx ON game_requests(receiver_team_id, status);
CREATE INDEX game_requests_sender_status_idx ON game_requests(sender_team_id, status);
CREATE INDEX posts_team_created_idx ON posts(team_id, created_at DESC);