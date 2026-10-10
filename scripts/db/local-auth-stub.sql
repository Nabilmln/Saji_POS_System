-- Local PostgreSQL only: Neon owns this schema on the linked database.
CREATE SCHEMA IF NOT EXISTS neon_auth;
CREATE TABLE IF NOT EXISTS neon_auth."user" (id uuid PRIMARY KEY);
INSERT INTO neon_auth."user" (id) VALUES
  ('00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000002')
ON CONFLICT DO NOTHING;
