-- Apply using a migration role, NOT the application's runtime role.
CREATE TABLE IF NOT EXISTS public.nexion_governance_sweeps (
  id text PRIMARY KEY,
  ran_at timestamptz NOT NULL,
  payload jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS nexion_governance_sweeps_ran_at_idx ON public.nexion_governance_sweeps (ran_at DESC);
-- Provision a separate runtime role with SELECT and INSERT only; no UPDATE/DELETE.
