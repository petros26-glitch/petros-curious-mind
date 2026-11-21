drop policy if exists "Published stories are public; admins can read all" on public.stories;

create policy "Published stories are public"
on public.stories
for select
to anon, authenticated
using (published = true);

create policy "Admins can read all stories"
on public.stories
for select
to authenticated
using (
  exists (
    select 1
    from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role = 'admin'
  )
);
