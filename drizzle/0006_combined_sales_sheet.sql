-- Refresh historical completed sales into the combined Sales layout exactly once.
-- Keep existing row reservations and legacy detail data for safe retries/rollback.
UPDATE sheets_sync_job
SET revision = revision + 1, attempts = 0, last_error = NULL,
    next_attempt_at = now(), updated_at = now()
WHERE kind = 'sale';
