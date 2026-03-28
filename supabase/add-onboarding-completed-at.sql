-- Migration: add onboarding_completed_at to profiles table.
-- Run this on existing deployments after updating the application code.
-- For new deployments, schema.sql already includes the column.

alter table public.profiles
  add column if not exists onboarding_completed_at timestamptz;

-- Backfill: mark all existing users as having completed onboarding
-- so they are not redirected to the onboarding page.
update public.profiles
  set onboarding_completed_at = created_at
  where onboarding_completed_at is null;
