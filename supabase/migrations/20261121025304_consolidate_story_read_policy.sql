create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role = 'admin'
  );
$$;

revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to anon, authenticated;

drop policy if exists "Published stories are public" on public.stories;
drop policy if exists "Admins can read all stories" on public.stories;

create policy "Stories readable by visitors and admins"
on public.stories
for select
to anon, authenticated
using (
  (published = true and deleted_at is null)
  or private.is_admin()
);

create index if not exists stories_deleted_by_idx
  on public.stories (deleted_by)
  where deleted_by is not null;
