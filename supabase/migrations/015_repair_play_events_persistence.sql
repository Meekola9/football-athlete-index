-- Repair Playmaker / Havoc persistence after team_members gained RLS.
--
-- A policy that queries team_members directly can be rejected while Postgres
-- evaluates nested RLS. Use a narrowly scoped security-definer helper in the
-- non-exposed private schema, and explicitly grant Data API privileges.

begin;

create schema if not exists private;

create or replace function private.can_manage_play_events(requested_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.team_members tm
    where tm.team_id = requested_team_id
      and tm.user_id = (select auth.uid())
      and lower(tm.role) in ('owner', 'admin', 'coach')
  );
$$;

revoke all on function private.can_manage_play_events(uuid) from public;
grant usage on schema private to authenticated;
grant execute on function private.can_manage_play_events(uuid) to authenticated;

grant select on table public.play_events to anon;
grant select, insert, update, delete on table public.play_events to authenticated;

alter table public.play_events enable row level security;

drop policy if exists "Public can view plays" on public.play_events;
create policy "Public can view plays"
  on public.play_events for select
  to anon, authenticated
  using (true);

do $$
declare policy_row record;
begin
  for policy_row in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'play_events'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  loop
    execute format(
      'drop policy if exists %I on public.play_events',
      policy_row.policyname
    );
  end loop;
end $$;

create policy "Staff manage plays"
  on public.play_events for all
  to authenticated
  using (private.can_manage_play_events(team_id))
  with check (private.can_manage_play_events(team_id));

commit;
