create policy "service role manages story backup events"
on public.story_backup_events
for all
to service_role
using (true)
with check (true);
