-- Repair Playmaker/Havoc cloud persistence after the account-role migration.
--
-- The original play_events policy queried team_members directly. Once
-- team_members moved to helper-backed RLS, authenticated Playmaker upserts could
-- return 403 even for the team owner. Use the same SECURITY DEFINER membership
-- helper as the rest of the current FAI access model.

drop policy if exists "Members manage plays" on public.play_events;

create policy "Members manage plays"
  on public.play_events for all
  to authenticated
  using (private.is_team_member(team_id))
  with check (private.is_team_member(team_id));
