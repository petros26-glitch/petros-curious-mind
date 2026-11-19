-- Petros Curious Mind initial schema
-- Safe to re-run: tables, indexes, policies, trigger and bucket are idempotent.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','moderator')),
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 220),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  excerpt text not null default '',
  content text not null,
  image_path text,
  featured boolean not null default false,
  published boolean not null default false,
  views bigint not null default 0 check (views >= 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 3000),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.likes (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (story_id, user_id)
);

create index if not exists stories_published_created_idx on public.stories (published, created_at desc);
create index if not exists stories_featured_published_idx on public.stories (featured, published);
create index if not exists stories_created_by_idx on public.stories (created_by);
create index if not exists comments_story_status_created_idx on public.comments (story_id, status, created_at desc);
create index if not exists comments_user_created_idx on public.comments (user_id, created_at desc);
create index if not exists likes_story_idx on public.likes (story_id);
create index if not exists likes_user_idx on public.likes (user_id);
create index if not exists user_roles_user_role_idx on public.user_roles (user_id, role);

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.stories enable row level security;
alter table public.comments enable row level security;
alter table public.likes enable row level security;

grant usage on schema public to anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant update (display_name, avatar_url, updated_at) on public.profiles to authenticated;
grant select on public.user_roles to authenticated;
grant select on public.stories to anon, authenticated;
grant insert, update, delete on public.stories to authenticated;
grant select on public.comments to anon, authenticated;
grant insert, update, delete on public.comments to authenticated;
grant select on public.likes to anon, authenticated;
grant insert, delete on public.likes to authenticated;

drop policy if exists "Public profiles are readable" on public.profiles;
create policy "Public profiles are readable" on public.profiles for select to anon, authenticated using (true);
drop policy if exists "Users update their own profile" on public.profiles;
create policy "Users update their own profile" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
drop policy if exists "Users read their own role rows" on public.user_roles;
create policy "Users read their own role rows" on public.user_roles for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Published stories are public; admins can read all" on public.stories;
create policy "Published stories are public; admins can read all" on public.stories for select to anon, authenticated using (
  published = true or exists (select 1 from public.user_roles ur where ur.user_id = (select auth.uid()) and ur.role = 'admin')
);
drop policy if exists "Admins create stories" on public.stories;
create policy "Admins create stories" on public.stories for insert to authenticated with check (
  exists (select 1 from public.user_roles ur where ur.user_id = (select auth.uid()) and ur.role = 'admin')
  and (created_by is null or created_by = (select auth.uid()))
);
drop policy if exists "Admins update stories" on public.stories;
create policy "Admins update stories" on public.stories for update to authenticated using (
  exists (select 1 from public.user_roles ur where ur.user_id = (select auth.uid()) and ur.role = 'admin')
) with check (
  exists (select 1 from public.user_roles ur where ur.user_id = (select auth.uid()) and ur.role = 'admin')
);
drop policy if exists "Admins delete stories" on public.stories;
create policy "Admins delete stories" on public.stories for delete to authenticated using (
  exists (select 1 from public.user_roles ur where ur.user_id = (select auth.uid()) and ur.role = 'admin')
);

drop policy if exists "Approved comments and own comments are readable" on public.comments;
create policy "Approved comments and own comments are readable" on public.comments for select to anon, authenticated using (
  status = 'approved' or user_id = (select auth.uid())
  or exists (select 1 from public.user_roles ur where ur.user_id = (select auth.uid()) and ur.role = 'admin')
);
drop policy if exists "Signed-in users add pending comments as themselves" on public.comments;
create policy "Signed-in users add pending comments as themselves" on public.comments for insert to authenticated with check (
  user_id = (select auth.uid()) and status = 'pending'
);
drop policy if exists "Admins moderate comments" on public.comments;
create policy "Admins moderate comments" on public.comments for update to authenticated using (
  exists (select 1 from public.user_roles ur where ur.user_id = (select auth.uid()) and ur.role = 'admin')
) with check (
  exists (select 1 from public.user_roles ur where ur.user_id = (select auth.uid()) and ur.role = 'admin')
);
drop policy if exists "Users delete their own comments; admins can delete any" on public.comments;
create policy "Users delete their own comments; admins can delete any" on public.comments for delete to authenticated using (
  user_id = (select auth.uid())
  or exists (select 1 from public.user_roles ur where ur.user_id = (select auth.uid()) and ur.role = 'admin')
);

drop policy if exists "Likes are publicly readable" on public.likes;
create policy "Likes are publicly readable" on public.likes for select to anon, authenticated using (true);
drop policy if exists "Users like published stories as themselves" on public.likes;
create policy "Users like published stories as themselves" on public.likes for insert to authenticated with check (
  user_id = (select auth.uid()) and exists (select 1 from public.stories s where s.id = story_id and s.published = true)
);
drop policy if exists "Users remove their own likes" on public.likes;
create policy "Users remove their own likes" on public.likes for delete to authenticated using (user_id = (select auth.uid()));

create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $function$
declare profile_name text;
begin
  profile_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Reader'
  );
  insert into public.profiles (id, display_name) values (new.id, left(profile_name, 80))
  on conflict (id) do nothing;
  return new;
end;
$function$;
revoke all on function private.handle_new_user() from public, anon, authenticated;
drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile after insert on auth.users
for each row execute function private.handle_new_user();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('story-images','story-images',true,5242880,array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public=excluded.public, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "Story images are publicly viewable" on storage.objects;
create policy "Story images are publicly viewable" on storage.objects for select to anon, authenticated using (bucket_id = 'story-images');
drop policy if exists "Admins upload story images" on storage.objects;
create policy "Admins upload story images" on storage.objects for insert to authenticated with check (
  bucket_id = 'story-images' and exists (select 1 from public.user_roles ur where ur.user_id = (select auth.uid()) and ur.role = 'admin')
);
drop policy if exists "Admins update story images" on storage.objects;
create policy "Admins update story images" on storage.objects for update to authenticated using (
  bucket_id = 'story-images' and exists (select 1 from public.user_roles ur where ur.user_id = (select auth.uid()) and ur.role = 'admin')
) with check (
  bucket_id = 'story-images' and exists (select 1 from public.user_roles ur where ur.user_id = (select auth.uid()) and ur.role = 'admin')
);
drop policy if exists "Admins delete story images" on storage.objects;
create policy "Admins delete story images" on storage.objects for delete to authenticated using (
  bucket_id = 'story-images' and exists (select 1 from public.user_roles ur where ur.user_id = (select auth.uid()) and ur.role = 'admin')
);

revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
