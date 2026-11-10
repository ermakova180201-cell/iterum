-- Per-player configurable delay after the prerequisite material is read.
ALTER TABLE materials ADD COLUMN delivery_delay_seconds INTEGER DEFAULT NULL;
