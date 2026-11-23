drop policy if exists "Signed-in users add pending comments as themselves" on public.comments;

create policy "Signed-in users add pending comments as themselves"
on public.comments
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and status = 'pending'
  and exists (
    select 1
    from public.stories s
    where s.id = comments.story_id
      and s.published = true
      and s.deleted_at is null
  )
);

create index if not exists saved_stories_story_id_idx
on public.saved_stories (story_id);
