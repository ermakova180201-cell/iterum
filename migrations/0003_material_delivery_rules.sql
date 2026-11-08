-- ITERUM: player-specific material delivery rules and read-triggered releases.
ALTER TABLE materials ADD COLUMN delivery_mode TEXT NOT NULL DEFAULT 'automatic'
  CHECK (delivery_mode IN ('automatic', 'triggered'));
ALTER TABLE materials ADD COLUMN trigger_material_id TEXT
  REFERENCES materials(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS player_material_reads (
  user_id TEXT NOT NULL,
  material_id TEXT NOT NULL,
  read_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, material_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_materials_trigger ON materials(trigger_material_id, delivery_mode, is_published);
CREATE INDEX IF NOT EXISTS idx_player_material_reads_user ON player_material_reads(user_id, material_id);
