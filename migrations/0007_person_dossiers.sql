-- Person dossiers for the website. Drafts and author-only notes are never returned by player endpoints.
CREATE TABLE IF NOT EXISTS person_dossiers (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  role_name TEXT NOT NULL DEFAULT '',
  birth_date TEXT NOT NULL DEFAULT '',
  occupation TEXT NOT NULL DEFAULT '',
  biography TEXT NOT NULL DEFAULT '',
  relationships TEXT NOT NULL DEFAULT '',
  chronology TEXT NOT NULL DEFAULT '',
  related_materials TEXT NOT NULL DEFAULT '',
  photo_data TEXT NOT NULL DEFAULT '',
  author_notes TEXT NOT NULL DEFAULT '',
  is_published INTEGER NOT NULL DEFAULT 0 CHECK (is_published IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_person_dossiers_case_visible
  ON person_dossiers(case_id, is_published, full_name);
