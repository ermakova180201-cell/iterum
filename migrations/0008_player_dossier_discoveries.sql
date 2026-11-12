-- A player only acquires a published dossier after opening it from person search.
-- Persistent per-user, per-case access; it is not a published shared material.
CREATE TABLE IF NOT EXISTS player_dossier_discoveries (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dossier_id TEXT NOT NULL REFERENCES person_dossiers(id) ON DELETE CASCADE,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  discovered_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, dossier_id)
);
CREATE INDEX IF NOT EXISTS idx_player_dossier_discoveries_case
  ON player_dossier_discoveries(user_id, case_id, discovered_at);
