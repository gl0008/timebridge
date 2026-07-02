# Supabase setup for TimeBridge

Create a free Supabase project, then open SQL Editor and run:

```sql
create table if not exists public.timebridge_schedules (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.timebridge_schedules enable row level security;

create policy "Public read schedules"
on public.timebridge_schedules
for select
to anon
using (true);

create policy "Public insert schedules"
on public.timebridge_schedules
for insert
to anon
with check (id = 'weekend');

create policy "Public update schedules"
on public.timebridge_schedules
for update
to anon
using (id = 'weekend')
with check (id = 'weekend');
```

Then copy these from Supabase Project Settings > API:

- Project URL
- anon public key

Paste them into `config.js`:

```js
window.TIMEBRIDGE_CONFIG = {
  supabaseUrl: "https://YOUR-PROJECT.supabase.co",
  supabaseAnonKey: "YOUR-ANON-KEY",
  scheduleId: "weekend",
};
document.documentElement.dataset.timebridgeConfig = "loaded";
```

After publishing, everyone can use:

```text
https://gl0008.github.io/timebridge/#weekend
```

Availability will be stored in the shared Supabase row instead of only in the
URL.
