create table if not exists public.story_backup_events (
  event_id bigint generated always as identity primary key,
  story_id uuid not null,
  operation text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  before_story jsonb,
  after_story jsonb,
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  delivery_attempts integer not null default 0,
  last_delivery_error text,
  constraint story_backup_events_payload_check check (
    (operation = 'INSERT' and before_story is null and after_story is not null)
    or (operation = 'UPDATE' and before_story is not null and after_story is not null)
    or (operation = 'DELETE' and before_story is not null and after_story is null)
  )
);

create index if not exists story_backup_events_pending_idx
  on public.story_backup_events (event_id)
  where delivered_at is null;

alter table public.story_backup_events enable row level security;
revoke all on table public.story_backup_events from anon, authenticated;
grant select, insert, update, delete on table public.story_backup_events to service_role;
grant usage, select on sequence public.story_backup_events_event_id_seq to service_role;

create or replace function public.capture_story_backup_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.story_backup_events (story_id, operation, before_story, after_story)
    values (new.id, 'INSERT', null, to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    if (to_jsonb(old) - 'views' - 'likes_count' - 'updated_at')
       is distinct from
       (to_jsonb(new) - 'views' - 'likes_count' - 'updated_at') then
      insert into public.story_backup_events (story_id, operation, before_story, after_story)
      values (new.id, 'UPDATE', to_jsonb(old), to_jsonb(new));
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.story_backup_events (story_id, operation, before_story, after_story)
    values (old.id, 'DELETE', to_jsonb(old), null);
    return old;
  end if;
  return null;
end;
$$;

revoke all on function public.capture_story_backup_event() from public, anon, authenticated;

drop trigger if exists story_backup_capture on public.stories;
create trigger story_backup_capture
after insert or update or delete on public.stories
for each row execute function public.capture_story_backup_event();
