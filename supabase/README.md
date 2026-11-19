# Petros Curious Mind — Supabase setup

The initial schema for the new Petros Curious Mind rebuild is in `migrations/202611190001_initial_petros_curious_mind.sql`.

## Created database objects

- `profiles`: public display name and avatar only; no email or password is stored here.
- `user_roles`: protected role assignments. Browser users cannot insert, update or delete roles.
- `stories`: folklore stories, drafts, publication state, featured flag and image path.
- `comments`: reader comments; new comments start pending and require admin approval.
- `likes`: one like per signed-in reader per story.
- `story-images` Storage bucket: public image delivery, admin-only uploads and changes.

RLS is enabled on every application table. The public-facing app uses only the Supabase publishable key. Never put a service-role or secret key in website JavaScript.

## First administrator setup

1. Register the owner's account through the website. Email confirmation should be disabled so users can sign in immediately.
2. In Supabase SQL Editor, run this statement after replacing the placeholder with the exact account email:

```sql
insert into public.user_roles (user_id, role)
select id, 'admin'
from auth.users
where lower(email) = lower('REPLACE_WITH_OWNER_EMAIL')
on conflict (user_id, role) do nothing;
```

3. Sign out and sign back in on the website. The Admin Dashboard link will then appear.

Do not automatically make the first person to register an administrator. Role assignment is deliberately restricted to trusted project-owner access.

## Supabase Auth URL configuration

In Supabase Dashboard → Authentication → Sign In / Providers → Email, turn **Confirm email** off. This allows immediate signup without clicking a confirmation link. Supabase will not send a signup-confirmation email while this is off. To send a separate welcome email, configure a transactional email provider (SMTP or an Auth Send Email Hook) first.\n\nIn Supabase Dashboard → Authentication → URL Configuration:
- Set the Site URL to the deployed website's exact origin.
- Add the deployed origin plus `/**` to Redirect URLs for allowed authentication redirects.

Use the same origin where the website is deployed. Add a localhost redirect only if you test locally.

## Notes

- The project currently has no registered users or story content. The tables are intentionally empty after setup.
- The browser dashboard lists public profile names only; it does not expose private Auth credentials.
- Auth user administration (suspending/deleting accounts) must be implemented through a separately protected server-side function. Do not use the service-role key in the browser.
