-- Demo/test credentials; do not use on an internet-accessible production deployment.
INSERT INTO users (name, email, password_hash, role)
SELECT seed.name, seed.email, seed.password_hash, 'Owner'
FROM (VALUES
  ('Brickhouse', 'Brickhouse@email.com', '$2a$12$b3MoUjUE3z6JujoJD25Wreafb28bpgMPRNNdC1/WqwwqFHsyTIxjq'),
  ('Michael', 'Michael@email.com', '$2a$12$laMn4gZts.LshGqyacxaM.OBoYEQHzk3/FuT2lgClKpkgQX/nFf8S')
) AS seed(name, email, password_hash)
WHERE NOT EXISTS (
  SELECT 1
  FROM users AS existing
  WHERE LOWER(existing.email) = LOWER(seed.email)
);
