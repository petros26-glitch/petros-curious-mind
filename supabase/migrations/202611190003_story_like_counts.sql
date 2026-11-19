alter table public.stories
  add column if not exists likes_count bigint not null default 0;
alter table public.stories
  drop constraint if exists stories_likes_count_nonnegative;
alter table public.stories
  add constraint stories_likes_count_nonnegative check (likes_count >= 0);

create index if not exists stories_likes_count_published_idx
  on public.stories (published, likes_count desc, published_at desc);

update public.stories s
set likes_count = (select count(*) from public.likes l where l.story_id = s.id);

create or replace function private.sync_story_like_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'INSERT' then
    update public.stories
    set likes_count = likes_count + 1
    where id = new.story_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.stories
    set likes_count = greatest(likes_count - 1, 0)
    where id = old.story_id;
    return old;
  end if;
  return null;
end;
$function$;

revoke all on function private.sync_story_like_count() from public, anon, authenticated;
drop trigger if exists sync_story_like_count_after_change on public.likes;
create trigger sync_story_like_count_after_change
after insert or delete on public.likes
for each row execute function private.sync_story_like_count();