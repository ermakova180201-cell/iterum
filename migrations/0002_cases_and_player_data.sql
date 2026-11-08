-- ITERUM: structure for cases, materials and player-specific investigation data.
-- This migration adds structure only; it does not create or reveal story content.

CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  case_code TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'closed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS case_access (
  user_id TEXT NOT NULL,
  case_id TEXT NOT NULL,
  access_status TEXT NOT NULL DEFAULT 'active'
    CHECK (access_status IN ('active', 'revoked')),
  granted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, case_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS materials (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  material_type TEXT NOT NULL
    CHECK (material_type IN ('email', 'publication', 'document', 'photo', 'audio', 'map', 'other')),
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  file_path TEXT,
  release_order INTEGER NOT NULL DEFAULT 0,
  is_published INTEGER NOT NULL DEFAULT 0 CHECK (is_published IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS material_unlocks (
  user_id TEXT NOT NULL,
  material_id TEXT NOT NULL,
  unlocked_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, material_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS player_progress (
  user_id TEXT NOT NULL,
  case_id TEXT NOT NULL,
  current_stage TEXT NOT NULL DEFAULT 'not_started',
  progress_data TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, case_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS player_notes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  case_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS player_clues (
  user_id TEXT NOT NULL,
  case_id TEXT NOT NULL,
  clue_key TEXT NOT NULL,
  clue_data TEXT NOT NULL DEFAULT '{}',
  discovered_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, case_id, clue_key),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_case_access_user ON case_access(user_id, access_status);
CREATE INDEX IF NOT EXISTS idx_materials_case_release ON materials(case_id, is_published, release_order);
CREATE INDEX IF NOT EXISTS idx_material_unlocks_user ON material_unlocks(user_id);
CREATE INDEX IF NOT EXISTS idx_player_notes_user_case ON player_notes(user_id, case_id);
CREATE INDEX IF NOT EXISTS idx_player_clues_user_case ON player_clues(user_id, case_id);
