create extension if not exists moddatetime schema extensions;

create table if not exists public.saved_cards (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references auth.users(id) on delete cascade not null,
    payment_token text not null unique,
    card_mask text not null,
    payment_system text default 'Unknown',
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.saved_cards enable row level security;

create policy "Users can view their own saved cards"
    on public.saved_cards for select
    using (auth.uid() = user_id);

create policy "Users can delete their own saved cards"
    on public.saved_cards for delete
    using (auth.uid() = user_id);

create trigger handle_updated_at before update on public.saved_cards 
  for each row execute procedure extensions.moddatetime (updated_at);
