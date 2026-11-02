-- Demo data so a fresh install has something to look at. Local/dev only.
-- Safe to re-run: every insert is guarded by NOT EXISTS.
-- Builds on 001_test_accounts.sql (Owner, Brickhouse, Player, Michael).
-- All demo passwords: 123456 (Michael: 654321). Dates are relative to today.

-- Coach demo account (same bcrypt hash as Owner@email.com, password 123456)
INSERT INTO users (name, email, password_hash, role)
SELECT 'Coach', 'Coach@email.com', password_hash, 'Coach'
FROM users
WHERE LOWER(email) = 'owner@email.com'
  AND NOT EXISTS (SELECT 1 FROM users WHERE LOWER(email) = 'coach@email.com');

-- Opponent teams owned by Brickhouse (Warriors is created in 001)
INSERT INTO teams (name, sport, owner_id)
SELECT v.name, v.sport, o.id
FROM (VALUES ('Thunder', 'Basketball'), ('Eagles', 'Basketball')) AS v(name, sport)
JOIN users o ON LOWER(o.email) = 'brickhouse@email.com'
WHERE NOT EXISTS (
  SELECT 1 FROM teams t WHERE t.owner_id = o.id AND LOWER(t.name) = LOWER(v.name)
);

-- Coach assigned to Warriors
INSERT INTO team_coaches (team_id, user_id, assigned_by)
SELECT t.id, c.id, t.owner_id
FROM teams t
JOIN users o ON o.id = t.owner_id AND LOWER(o.email) = 'owner@email.com'
JOIN users c ON LOWER(c.email) = 'coach@email.com'
WHERE LOWER(t.name) = 'warriors'
ON CONFLICT DO NOTHING;

-- Thunder roster (Michael is linked to his Player account)
INSERT INTO players (user_id, team_id, name, jersey_number, position)
SELECT u.id, t.id, 'Michael', 11, 'Guard'
FROM teams t
JOIN users o ON o.id = t.owner_id AND LOWER(o.email) = 'brickhouse@email.com'
JOIN users u ON LOWER(u.email) = 'michael@email.com'
WHERE LOWER(t.name) = 'thunder'
  AND NOT EXISTS (SELECT 1 FROM players p WHERE p.team_id = t.id AND LOWER(p.name) = 'michael')
  AND NOT EXISTS (SELECT 1 FROM players p WHERE p.user_id = u.id);

INSERT INTO players (user_id, team_id, name, jersey_number, position)
SELECT NULL, t.id, v.name, v.jersey, v.position
FROM teams t
JOIN users o ON o.id = t.owner_id AND LOWER(o.email) = 'brickhouse@email.com'
CROSS JOIN (VALUES ('Dwayne', 3, 'Forward'), ('Kobe', 24, 'Center')) AS v(name, jersey, position)
WHERE LOWER(t.name) = 'thunder'
  AND NOT EXISTS (SELECT 1 FROM players p WHERE p.team_id = t.id AND LOWER(p.name) = LOWER(v.name));

INSERT INTO players (user_id, team_id, name, jersey_number, position)
SELECT NULL, t.id, v.name, v.jersey, v.position
FROM teams t
JOIN users o ON o.id = t.owner_id AND LOWER(o.email) = 'brickhouse@email.com'
CROSS JOIN (VALUES ('Magic', 32, 'Guard'), ('Shaq', 34, 'Center')) AS v(name, jersey, position)
WHERE LOWER(t.name) = 'eagles'
  AND NOT EXISTS (SELECT 1 FROM players p WHERE p.team_id = t.id AND LOWER(p.name) = LOWER(v.name));

-- Warriors announcement and practice
INSERT INTO posts (team_id, author_id, title, content)
SELECT t.id, o.id, 'Welcome to TeamBase',
       'Season kickoff! Check the schedule for practices and RSVP so coaches know who is coming.'
FROM teams t
JOIN users o ON o.id = t.owner_id AND LOWER(o.email) = 'owner@email.com'
WHERE LOWER(t.name) = 'warriors'
  AND NOT EXISTS (SELECT 1 FROM posts p WHERE p.team_id = t.id AND p.title = 'Welcome to TeamBase');

INSERT INTO events (team_id, event_type, title, event_date, event_time, location)
SELECT t.id, 'Practice', 'Team Practice', CURRENT_DATE + 2, '18:00', 'Main Gym'
FROM teams t
JOIN users o ON o.id = t.owner_id AND LOWER(o.email) = 'owner@email.com'
WHERE LOWER(t.name) = 'warriors'
  AND NOT EXISTS (SELECT 1 FROM events e WHERE e.team_id = t.id AND e.title = 'Team Practice');

-- Game requests between Warriors (Owner) and Brickhouse's teams:
--   Thunder -> Warriors  Pending   (Owner sees it as incoming and can accept)
--   Warriors -> Eagles   Pending   (Owner sees it as outgoing; Brickhouse can accept)
--   Eagles -> Warriors   Accepted  (already on both schedules, see events below)
INSERT INTO game_requests (sender_team_id, receiver_team_id, proposed_date, proposed_time, location, status)
SELECT s.id, r.id, v.d, v.t::time, v.loc, v.status
FROM (VALUES
  ('Thunder', 'Warriors', CURRENT_DATE + 7,  '19:00', 'Thunder Arena',  'Pending'),
  ('Warriors', 'Eagles',  CURRENT_DATE + 10, '17:30', 'Warriors Court', 'Pending'),
  ('Eagles', 'Warriors',  CURRENT_DATE + 4,  '20:00', 'Eagles Dome',    'Accepted')
) AS v(sender, receiver, d, t, loc, status)
JOIN teams s ON LOWER(s.name) = LOWER(v.sender)
JOIN teams r ON LOWER(r.name) = LOWER(v.receiver)
WHERE NOT EXISTS (
  SELECT 1 FROM game_requests g
  WHERE g.sender_team_id = s.id AND g.receiver_team_id = r.id AND g.location = v.loc
);

-- The accepted game shows on both schedules, as the accept flow would create it
INSERT INTO events (team_id, event_type, title, event_date, event_time, location, opponent_team_id)
SELECT a.id, 'Game', 'Game vs ' || b.name, CURRENT_DATE + 4, '20:00', 'Eagles Dome', b.id
FROM teams a
JOIN teams b ON b.id <> a.id
WHERE ((LOWER(a.name) = 'eagles' AND LOWER(b.name) = 'warriors')
    OR (LOWER(a.name) = 'warriors' AND LOWER(b.name) = 'eagles'))
  AND NOT EXISTS (
    SELECT 1 FROM events e
    WHERE e.team_id = a.id AND e.opponent_team_id = b.id AND e.location = 'Eagles Dome'
  );
