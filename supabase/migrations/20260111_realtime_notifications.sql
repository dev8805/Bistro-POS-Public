-- Create table for notification settings
create table if not exists public.table_notification_settings (
    id uuid default gen_random_uuid() primary key,
    business_id uuid references public.businesses(id),
    role_name text not null, -- 'Cocinero', 'Cajero', etc.
    notify_on_confirm boolean default false,
    created_at timestamptz default now(),
    unique(business_id, role_name)
);

-- Enable RLS
alter table public.table_notification_settings enable row level security;

-- Create policy for managing settings (simplified for authenticated users)
drop policy if exists "Users can manage settings" on public.table_notification_settings;
create policy "Users can manage settings" on public.table_notification_settings
    for all using (business_id = (select business_id from profiles where id = auth.uid()));

-- Add last_confirmed_at column to orders table if it doesn't exist
do $$
begin
    if not exists (select 1 from information_schema.columns where table_name = 'orders' and column_name = 'last_confirmed_at') then
        alter table public.orders add column last_confirmed_at timestamptz;
    end if;
end $$;
