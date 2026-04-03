-- Allow inviting users with the "owner" role.
-- The team_memberships table already accepts 'owner'; this brings team_invites in line.
ALTER TABLE public.team_invites DROP CONSTRAINT team_invites_role_check;
ALTER TABLE public.team_invites ADD CONSTRAINT team_invites_role_check CHECK (role IN ('owner', 'admin', 'member'));
