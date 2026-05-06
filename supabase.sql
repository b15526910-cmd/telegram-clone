-- Supabase schema for Telegram Clone

-- 1) profiles table stores user metadata and unique username
create table if not exists profiles (
  id uuid primary key references auth.users(id),
  email text not null unique,
  username text not null unique,
  avatar text,
  status text default 'offline',
  created_at timestamp with time zone default now()
);

-- 2) chats table stores chat rooms
create table if not exists chats (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('private', 'group')),
  name text,
  created_at timestamp with time zone default now(),
  last_message text,
  last_message_time timestamp with time zone
);

-- 3) chat members list
create table if not exists chat_members (
  chat_id uuid references chats(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  primary key (chat_id, user_id)
);

-- 4) messages table
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid references chats(id) on delete cascade,
  sender_id uuid references profiles(id),
  content text,
  created_at timestamp with time zone default now()
);

-- 5) call history
create table if not exists calls (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid references chats(id),
  status text default 'ongoing',
  started_at timestamp with time zone default now(),
  ended_at timestamp with time zone
);

-- Recommended RLS policy examples (optional):
-- enable row level security on profiles, chats, chat_members and messages.
-- create policy "Users can read own profile" on profiles for select using ( auth.uid() = id );
-- create policy "Users can manage own chats" on chat_members for select using ( auth.uid() = user_id );
-- create policy "Users can insert messages" on messages for insert using ( auth.uid() = sender_id );
