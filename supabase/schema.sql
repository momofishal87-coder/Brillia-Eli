-- Brillia · Base inicial para notificaciones push
-- Ejecutar en Supabase > SQL Editor > New query.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  reminder_time time not null default '09:00',
  timezone text not null default 'Europe/Madrid',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_due_idx
  on public.push_subscriptions (enabled, reminder_time);

alter table public.push_subscriptions enable row level security;

drop policy if exists "Users can view their own push subscription" on public.push_subscriptions;
create policy "Users can view their own push subscription"
  on public.push_subscriptions for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can create their own push subscription" on public.push_subscriptions;
create policy "Users can create their own push subscription"
  on public.push_subscriptions for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own push subscription" on public.push_subscriptions;
create policy "Users can update their own push subscription"
  on public.push_subscriptions for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own push subscription" on public.push_subscriptions;
create policy "Users can delete their own push subscription"
  on public.push_subscriptions for delete
  to authenticated
  using (auth.uid() = user_id);

create or replace function public.set_push_subscriptions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists push_subscriptions_updated_at on public.push_subscriptions;
create trigger push_subscriptions_updated_at
before update on public.push_subscriptions
for each row execute function public.set_push_subscriptions_updated_at();
