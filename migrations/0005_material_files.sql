-- Small private investigation attachments stored directly in D1.
CREATE TABLE IF NOT EXISTS material_files (
  id TEXT PRIMARY KEY,
  material_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_data BLOB NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_material_files_material ON material_files(material_id, created_at);
