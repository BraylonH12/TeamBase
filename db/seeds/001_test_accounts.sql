-- Demo/test credentials; do not use on an internet-accessible production deployment.
INSERT INTO users (name, email, password_hash, role)
SELECT seed.name, seed.email, seed.password_hash, seed.role
FROM (VALUES
  ('Brickhouse', 'Brickhouse@email.com', '$2a$12$b3MoUjUE3z6JujoJD25Wreafb28bpgMPRNNdC1/WqwwqFHsyTIxjq', 'Owner'),
  ('Michael', 'Michael@email.com', '$2a$12$laMn4gZts.LshGqyacxaM.OBoYEQHzk3/FuT2lgClKpkgQX/nFf8S', 'Player'),
  ('Player', 'Player@email.com', '$2a$12$0XX274DFk/6PlPTiSWZ1puc7pOMjOBxkNYKl5z.AkJ.T9X1Bw3op6', 'Player'),
  ('Owner', 'Owner@email.com', '$2a$12$WwKQI3dT6XxWO.eqjR5x/.sQ9ANoPEPF46vGVaqdql8Qj8tiJXmD6', 'Owner')
) AS seed(name, email, password_hash, role)
WHERE NOT EXISTS (
  SELECT 1
  FROM users AS existing
  WHERE LOWER(existing.email) = LOWER(seed.email)
);

INSERT INTO teams (name, sport, owner_id)
SELECT 'Warriors', 'Basketball', owner.id
FROM users AS owner
WHERE LOWER(owner.email) = LOWER('Owner@email.com')
  AND NOT EXISTS (
    SELECT 1
    FROM teams AS existing
    WHERE existing.owner_id = owner.id AND LOWER(existing.name) = LOWER('Warriors')
  );

INSERT INTO players (user_id, team_id, name, jersey_number, position)
SELECT player.id, team.id, 'Lebron', 23, 'Forward'
FROM users AS player
JOIN teams AS team ON team.owner_id = (
  SELECT id FROM users WHERE LOWER(email) = LOWER('Owner@email.com')
)
WHERE LOWER(player.email) = LOWER('Player@email.com')
  AND LOWER(team.name) = LOWER('Warriors')
  AND NOT EXISTS (
    SELECT 1 FROM players AS existing
    WHERE existing.team_id = team.id AND LOWER(existing.name) = LOWER('Lebron')
  );

INSERT INTO players (user_id, team_id, name, jersey_number, position)
SELECT NULL, team.id, 'Larry', 30, 'Guard'
FROM teams AS team
JOIN users AS owner ON owner.id = team.owner_id
WHERE LOWER(owner.email) = LOWER('Owner@email.com')
  AND LOWER(team.name) = LOWER('Warriors')
  AND NOT EXISTS (
    SELECT 1 FROM players AS existing
    WHERE existing.team_id = team.id AND LOWER(existing.name) = LOWER('Larry')
  );
