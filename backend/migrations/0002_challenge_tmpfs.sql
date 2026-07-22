-- Some challenges (notably the disk-&-filesystem "disk full" scenarios) need a
-- real, size-bounded filesystem to fill up. Per decisions/0002 we never bind-mount
-- host paths into challenge containers, so these use a size-limited tmpfs instead.
-- Stored as a JSON map of { "<mount path>": "<tmpfs options, e.g. size=16m>" }.
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS tmpfs JSONB;
