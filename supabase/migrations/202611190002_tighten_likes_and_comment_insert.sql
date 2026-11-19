drop policy if exists "Likes are publicly readable" on public.likes;
drop policy if exists "Users read their own likes" on public.likes;
create policy "Users read their own likes" on public.likes
for select to authenticated using (user_id = (select auth.uid()));
revoke select on public.likes from anon;
grant select on public.likes to authenticated;

drop policy if exists "Signed-in users add pending comments as themselves" on public.comments;
create policy "Signed-in users add pending comments as themselves" on public.comments
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and status = 'pending'
  and exists (
    select 1 from public.stories s
    where s.id = story_id and s.published = true
  )
);