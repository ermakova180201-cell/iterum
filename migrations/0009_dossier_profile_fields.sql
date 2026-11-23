-- Additional fields for compact person profiles. Historical fields stay intact.
ALTER TABLE person_dossiers ADD COLUMN residence TEXT NOT NULL DEFAULT '';
ALTER TABLE person_dossiers ADD COLUMN workplace TEXT NOT NULL DEFAULT '';
ALTER TABLE person_dossiers ADD COLUMN marital_status TEXT NOT NULL DEFAULT '';
ALTER TABLE person_dossiers ADD COLUMN spouse TEXT NOT NULL DEFAULT '';
ALTER TABLE person_dossiers ADD COLUMN children TEXT NOT NULL DEFAULT '';
ALTER TABLE person_dossiers ADD COLUMN life_status TEXT NOT NULL DEFAULT '';
