-- ITERUM: searchable dossier records and in-game email metadata.
ALTER TABLE materials ADD COLUMN is_searchable INTEGER NOT NULL DEFAULT 0
  CHECK (is_searchable IN (0, 1));
ALTER TABLE materials ADD COLUMN sender_name TEXT NOT NULL DEFAULT '';
ALTER TABLE materials ADD COLUMN sender_address TEXT NOT NULL DEFAULT '';
ALTER TABLE materials ADD COLUMN sent_at TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_materials_searchable ON materials(case_id, is_searchable, is_published);
