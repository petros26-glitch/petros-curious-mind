alter table public.stories
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null;

create index if not exists stories_deleted_at_idx
  on public.stories (deleted_at)
  where deleted_at is not null;

drop policy if exists "Published stories are public" on public.stories;

create policy "Published stories are public"
on public.stories
for select
to anon, authenticated
using (published = true and deleted_at is null);
