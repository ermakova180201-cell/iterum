-- File metadata for private investigation attachments stored in Cloudflare R2.
CREATE TABLE IF NOT EXISTS material_files (
  id TEXT PRIMARY KEY,
  material_id TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_material_files_material ON material_files(material_id, created_at);
