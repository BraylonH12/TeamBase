-- Demo/test credentials; do not use on an internet-accessible production deployment.
INSERT INTO users (email, password_hash)
SELECT seed.email, seed.password_hash
FROM (VALUES
  ('Brickhouse@email.com', '$2a$12$b3MoUjUE3z6JujoJD25Wreafb28bpgMPRNNdC1/WqwwqFHsyTIxjq'),
  ('Michael@email.com', '$2a$12$laMn4gZts.LshGqyacxaM.OBoYEQHzk3/FuT2lgClKpkgQX/nFf8S')
) AS seed(email, password_hash)
WHERE NOT EXISTS (
  SELECT 1
  FROM users AS existing
  WHERE LOWER(existing.email) = LOWER(seed.email)
);
