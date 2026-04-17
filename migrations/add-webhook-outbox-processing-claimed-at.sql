-- Outbox delivery: claim timestamp for stale `processing` recovery and SKIP LOCKED claims.
-- Safe to run multiple times (IF NOT EXISTS).

ALTER TABLE webhook_outbox
  ADD COLUMN IF NOT EXISTS processing_claimed_at timestamptz;

-- Any rows stuck in `processing` from pre-fix crashes or deploys: return to queue once.
UPDATE webhook_outbox
SET status = 'pending', processing_claimed_at = NULL
WHERE status = 'processing';
