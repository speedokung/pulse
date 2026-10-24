-- Pulse · Supabase schema
-- Run this in Supabase: Dashboard → SQL Editor → New query → paste → Run.
-- Safe to run again after updates: it only adds what's missing and refreshes rules and functions.
--
-- Privacy model
--   pulses           public. Holds only the ROUGH location (snapped to a ~330 m grid) and an area name.
--   pulse_locations  the EXACT pin + place name. Row-level security returns it only when
--                    the Pulse is "everyone can see", or you are the host, or the host accepted you.
--   All joins / accepts / ending go through security-definer functions, so nobody can
--   write memberships directly or fake an acceptance.

create extension if not exists pgcrypto;

-- ---------- types ----------
do $$ begin
  create type pulse_category   as enum ('sport','music','games','outdoor','make');
  create type exact_visibility as enum ('all','accepted');
  create type member_status    as enum ('requested','accepted');
  create type post_kind        as enum ('update','photo','checkin');
exception when duplicate_object then null; end $$;

-- ---------- tables ----------
create table if not exists public.profiles (
  id           uuid primary key references auth.users on delete cascade,
  display_name text not null default 'Someone' check (char_length(display_name) between 1 and 40),
  created_at   timestamptz not null default now()
);

-- photo from Google sign-in, and the categories someone picked as interests
alter table public.profiles add column if not exists avatar_url text check (avatar_url is null or char_length(avatar_url) < 600);
alter table public.profiles add column if not exists interests pulse_category[] not null default '{}';

create table if not exists public.pulses (
  id          uuid primary key default gen_random_uuid(),
  host_id     uuid not null references public.profiles(id) on delete cascade,
  category    pulse_category not null,
  title       text not null check (char_length(title) between 3 and 80),
  need        int  not null check (need between 1 and 30),
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  visibility  exact_visibility not null default 'all',
  area_name   text not null default 'Nearby',
  rough_lat   double precision not null,
  rough_lng   double precision not null,
  created_at  timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists pulses_geo_time on public.pulses (rough_lat, rough_lng, ends_at);
create index if not exists pulses_created  on public.pulses (created_at desc);

create table if not exists public.pulse_locations (
  pulse_id   uuid primary key references public.pulses(id) on delete cascade,
  lat        double precision not null,
  lng        double precision not null,
  place_name text not null
);

create table if not exists public.memberships (
  pulse_id   uuid not null references public.pulses(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  status     member_status not null,
  created_at timestamptz not null default now(),
  primary key (pulse_id, user_id)
);

create table if not exists public.feed_posts (
  id         uuid primary key default gen_random_uuid(),
  pulse_id   uuid not null references public.pulses(id) on delete cascade,
  author_id  uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  kind       post_kind not null default 'update',
  body       text check (body is null or char_length(body) <= 280),
  photo_path text,
  created_at timestamptz not null default now()
);
create index if not exists feed_posts_pulse on public.feed_posts (pulse_id, created_at desc);

-- ---------- helpers ----------
create or replace function public.can_see_exact(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from pulses p
    where p.id = p_id
      and ( p.visibility = 'all'
         or p.host_id = auth.uid()
         or exists (select 1 from memberships m
                    where m.pulse_id = p.id and m.user_id = auth.uid() and m.status = 'accepted'))
  );
$$;

create or replace function public.is_participant(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from pulses p
    where p.id = p_id
      and p.starts_at < now() + interval '30 minutes'     -- can post from 30 min before start
      and p.ends_at   > now() - interval '3 hours'        -- ...until 3 h after the end (recap photos)
      and ( p.host_id = auth.uid()
         or exists (select 1 from memberships m
                    where m.pulse_id = p.id and m.user_id = auth.uid() and m.status = 'accepted'))
  );
$$;

-- ---------- row-level security ----------
alter table public.profiles        enable row level security;
alter table public.pulses          enable row level security;
alter table public.pulse_locations enable row level security;
alter table public.memberships     enable row level security;
alter table public.feed_posts      enable row level security;

drop policy if exists "profiles are public"   on public.profiles;
drop policy if exists "insert own profile"    on public.profiles;
drop policy if exists "update own profile"    on public.profiles;
create policy "profiles are public" on public.profiles for select using (true);
create policy "insert own profile"  on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "update own profile"  on public.profiles for update to authenticated using (id = auth.uid());

drop policy if exists "pulses are public" on public.pulses;
create policy "pulses are public" on public.pulses for select using (true);
-- no insert/update/delete policies: writes only through the functions below

drop policy if exists "exact spot for allowed viewers" on public.pulse_locations;
create policy "exact spot for allowed viewers" on public.pulse_locations
  for select using (public.can_see_exact(pulse_id));

drop policy if exists "memberships are public" on public.memberships;
create policy "memberships are public" on public.memberships for select using (true);

drop policy if exists "feed is public"            on public.feed_posts;
drop policy if exists "participants post"         on public.feed_posts;
drop policy if exists "authors delete own posts"  on public.feed_posts;
create policy "feed is public"           on public.feed_posts for select using (true);
create policy "participants post"        on public.feed_posts for insert to authenticated
  with check (author_id = auth.uid() and public.is_participant(pulse_id));
create policy "authors delete own posts" on public.feed_posts for delete to authenticated
  using (author_id = auth.uid());

-- ---------- actions ----------
-- skill level and weekly repeats
alter table public.pulses add column if not exists level text not null default 'any' check (level in ('any','beginner','casual','serious'));
alter table public.pulses add column if not exists series_id uuid;
create index if not exists pulses_series on public.pulses (series_id);

-- optional sub-type within a category (badminton, board games, run…); keys live in the app
alter table public.pulses add column if not exists sub text;
do $$ begin
  alter table public.pulses add constraint pulses_sub_key check (sub is null or sub ~ '^[a-z_]{1,24}$');
exception when duplicate_object then null; end $$;
create index if not exists pulses_sub on public.pulses (sub);

drop function if exists public.create_pulse(pulse_category,text,int,timestamptz,int,exact_visibility,double precision,double precision,text,text);
drop function if exists public.create_pulse(pulse_category,text,int,timestamptz,int,exact_visibility,double precision,double precision,text,text,text,int);
drop function if exists public.create_pulse(pulse_category,text,int,timestamptz,int,exact_visibility,double precision,double precision,text,text,text,int,text);
create or replace function public.create_pulse(
  p_category pulse_category, p_title text, p_need int,
  p_starts_at timestamptz, p_duration_min int, p_visibility exact_visibility,
  p_lat double precision, p_lng double precision, p_place text, p_area text,
  p_level text default 'any', p_repeat_weeks int default 1, p_sub text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_id uuid; v_first uuid; v_start timestamptz; v_series uuid; i int;
begin
  if v_uid is null then raise exception 'Sign in first'; end if;
  if p_starts_at > now() + interval '7 days' then raise exception 'Pick a start within the next 7 days'; end if;
  if p_starts_at < now() - interval '10 minutes' then raise exception 'That start time has passed'; end if;
  if p_duration_min not between 15 and 720 then raise exception 'Duration must be 15 min to 12 h'; end if;
  if p_repeat_weeks not between 1 and 8 then raise exception 'Repeat 1 to 8 weeks'; end if;
  -- a weekly series counts as one
  if (select count(distinct coalesce(series_id, id)) from pulses where host_id = v_uid and ends_at > now()) >= 5 then
    raise exception 'You already have 5 upcoming Pulses. End one first.';
  end if;
  insert into profiles (id) values (v_uid) on conflict do nothing;
  v_series := case when p_repeat_weeks > 1 then gen_random_uuid() else null end;
  for i in 0 .. p_repeat_weeks - 1 loop
    v_start := greatest(p_starts_at, now()) + make_interval(days => 7 * i);
    insert into pulses (host_id, category, title, need, starts_at, ends_at, visibility, area_name, rough_lat, rough_lng, level, series_id, sub)
    values (v_uid, p_category, trim(p_title), p_need, v_start, v_start + make_interval(mins => p_duration_min),
            p_visibility, coalesce(nullif(trim(p_area), ''), 'Nearby'),
            floor(p_lat / 0.003) * 0.003 + 0.0015,
            floor(p_lng / 0.003) * 0.003 + 0.0015,
            coalesce(p_level, 'any'), v_series, nullif(trim(p_sub), ''))
    returning id into v_id;
    insert into pulse_locations (pulse_id, lat, lng, place_name)
    values (v_id, p_lat, p_lng, coalesce(nullif(trim(p_place), ''), nullif(trim(p_area), ''), 'Pinned spot'));
    if i = 0 then v_first := v_id; end if;
  end loop;
  return v_first;
end $$;

create or replace function public.join_pulse(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); p pulses; n int; v_status member_status;
begin
  if v_uid is null then raise exception 'Sign in first'; end if;
  select * into p from pulses where id = p_id for update;
  if not found then raise exception 'Pulse not found'; end if;
  if p.ends_at <= now() then raise exception 'This Pulse has ended'; end if;
  if p.host_id = v_uid then raise exception 'You are hosting this one'; end if;
  select count(*) into n from memberships where pulse_id = p_id and status = 'accepted';
  if n >= p.need then raise exception 'This Pulse is full'; end if;
  v_status := case when p.visibility = 'all' then 'accepted'::member_status else 'requested'::member_status end;
  insert into profiles (id) values (v_uid) on conflict do nothing;
  insert into memberships (pulse_id, user_id, status) values (p_id, v_uid, v_status)
  on conflict (pulse_id, user_id) do nothing;
  return v_status::text;
end $$;

create or replace function public.leave_pulse(p_id uuid) returns void
language sql security definer set search_path = public as $$
  delete from memberships where pulse_id = p_id and user_id = auth.uid();
$$;

create or replace function public.respond_request(p_id uuid, p_user uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare p pulses; n int;
begin
  select * into p from pulses where id = p_id for update;
  if not found or p.host_id <> auth.uid() then raise exception 'Only the host can do that'; end if;
  if p_accept then
    select count(*) into n from memberships where pulse_id = p_id and status = 'accepted';
    if n >= p.need then raise exception 'This Pulse is already full'; end if;
    update memberships set status = 'accepted' where pulse_id = p_id and user_id = p_user;
  else
    delete from memberships where pulse_id = p_id and user_id = p_user and status = 'requested';
  end if;
end $$;

-- host adds time while it's on (or before it starts); a Pulse can run at most 12 h in total
create or replace function public.extend_pulse(p_id uuid, p_minutes int) returns void
language plpgsql security definer set search_path = public as $$
declare p pulses;
begin
  if p_minutes not between 5 and 240 then raise exception 'Extend by 5 min to 4 h'; end if;
  select * into p from pulses where id = p_id for update;
  if not found or p.host_id <> auth.uid() then raise exception 'Only the host can do that'; end if;
  if p.ends_at <= now() then raise exception 'This Pulse has already ended'; end if;
  if p.ends_at + make_interval(mins => p_minutes) > p.starts_at + interval '12 hours' then
    raise exception 'A Pulse can run for 12 hours at most';
  end if;
  update pulses set ends_at = ends_at + make_interval(mins => p_minutes) where id = p_id;
end $$;

create or replace function public.end_pulse(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  -- not started yet: cancel it outright (it never happened, so it doesn't become history)
  delete from pulses where id = p_id and host_id = auth.uid() and starts_at > now();
  update pulses set ends_at = greatest(now(), starts_at + interval '1 minute')
  where id = p_id and host_id = auth.uid() and ends_at > now();
end $$;

revoke all on function public.create_pulse(pulse_category,text,int,timestamptz,int,exact_visibility,double precision,double precision,text,text,text,int,text) from public, anon;
revoke all on function public.join_pulse(uuid)               from public, anon;
revoke all on function public.leave_pulse(uuid)              from public, anon;
revoke all on function public.respond_request(uuid,uuid,boolean) from public, anon;
revoke all on function public.end_pulse(uuid)                from public, anon;
revoke all on function public.extend_pulse(uuid,int)          from public, anon;
grant execute on function public.create_pulse(pulse_category,text,int,timestamptz,int,exact_visibility,double precision,double precision,text,text,text,int,text) to authenticated;
grant execute on function public.join_pulse(uuid)               to authenticated;
grant execute on function public.leave_pulse(uuid)              to authenticated;
grant execute on function public.respond_request(uuid,uuid,boolean) to authenticated;
grant execute on function public.end_pulse(uuid)                to authenticated;
grant execute on function public.extend_pulse(uuid,int)          to authenticated;

-- ---------- contact + group chat (only the host and accepted people) ----------
create or replace function public.is_member(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from pulses p
    where p.id = p_id
      and ( p.host_id = auth.uid()
         or exists (select 1 from memberships m
                    where m.pulse_id = p.id and m.user_id = auth.uid() and m.status = 'accepted'))
  );
$$;

create table if not exists public.pulse_private (
  pulse_id uuid primary key references public.pulses(id) on delete cascade,
  line_id  text check (line_id  is null or char_length(line_id)  <= 40),
  phone    text check (phone    is null or char_length(phone)    <= 20),
  landmark text check (landmark is null or char_length(landmark) <= 120)
);
alter table public.pulse_private enable row level security;
drop policy if exists "contact for members" on public.pulse_private;
create policy "contact for members" on public.pulse_private for select using (public.is_member(pulse_id));

create or replace function public.set_pulse_contact(p_id uuid, p_line text, p_phone text, p_landmark text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from pulses where id = p_id and host_id = auth.uid()) then raise exception 'Only the host can do that'; end if;
  -- applies to every upcoming Pulse in the same weekly series too
  insert into pulse_private (pulse_id, line_id, phone, landmark)
  select x.id, nullif(trim(p_line), ''), nullif(trim(p_phone), ''), nullif(trim(p_landmark), '')
  from pulses x
  where x.host_id = auth.uid()
    and (x.id = p_id or (x.series_id is not null and x.series_id = (select series_id from pulses where id = p_id) and x.ends_at > now()))
  on conflict (pulse_id) do update set line_id = excluded.line_id, phone = excluded.phone, landmark = excluded.landmark;
end $$;
revoke all on function public.set_pulse_contact(uuid,text,text,text) from public, anon;
grant execute on function public.set_pulse_contact(uuid,text,text,text) to authenticated;

create table if not exists public.pulse_messages (
  id         uuid primary key default gen_random_uuid(),
  pulse_id   uuid not null references public.pulses(id) on delete cascade,
  author_id  uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists pulse_messages_pulse on public.pulse_messages (pulse_id, created_at);
alter table public.pulse_messages enable row level security;
drop policy if exists "members read chat" on public.pulse_messages;
drop policy if exists "members write chat" on public.pulse_messages;
create policy "members read chat" on public.pulse_messages for select using (public.is_member(pulse_id));
create policy "members write chat" on public.pulse_messages for insert to authenticated
  with check (author_id = auth.uid() and public.is_member(pulse_id)
              and exists (select 1 from pulses p where p.id = pulse_id and p.ends_at > now() - interval '6 hours'));

do $$ begin
  alter publication supabase_realtime add table public.pulse_messages;
exception when duplicate_object then null; end $$;

-- ---------- "interested" and "on my way" ----------
create table if not exists public.pulse_signals (
  pulse_id   uuid not null references public.pulses(id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  kind       text not null check (kind in ('interested','omw')),
  eta_min    int check (eta_min is null or eta_min between 1 and 180),
  updated_at timestamptz not null default now(),
  primary key (pulse_id, user_id)
);
alter table public.pulse_signals enable row level security;
drop policy if exists "signals are public" on public.pulse_signals;
drop policy if exists "own signals insert" on public.pulse_signals;
drop policy if exists "own signals update" on public.pulse_signals;
drop policy if exists "own signals delete" on public.pulse_signals;
create policy "signals are public" on public.pulse_signals for select using (true);
create policy "own signals insert" on public.pulse_signals for insert to authenticated
  with check (user_id = auth.uid() and (kind = 'interested' or public.is_member(pulse_id)));
create policy "own signals update" on public.pulse_signals for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and (kind = 'interested' or public.is_member(pulse_id)));
create policy "own signals delete" on public.pulse_signals for delete to authenticated using (user_id = auth.uid());
do $$ begin
  alter publication supabase_realtime add table public.pulse_signals;
exception when duplicate_object then null; end $$;

-- ---------- trust: verified badge + how many meetups someone has hosted ----------
alter table public.profiles add column if not exists verified text check (verified is null or verified in ('google','line'));

-- called by the app after Google sign-in; marks the profile verified if a Google identity is really attached
create or replace function public.sync_verified() returns text
language plpgsql security definer set search_path = public, auth as $$
declare v text;
begin
  select case
    when exists (select 1 from auth.identities where user_id = auth.uid() and provider = 'google') then 'google'
    when exists (select 1 from line_links where user_id = auth.uid()) then 'line'
    else null end into v;
  update profiles set verified = v where id = auth.uid();
  return v;
end $$;

-- ended Pulses where at least one other person was accepted
create or replace function public.host_stats(p_ids uuid[]) returns table (host_id uuid, hosted int)
language sql stable security definer set search_path = public as $$
  select p.host_id, count(*)::int
  from pulses p
  where p.host_id = any(p_ids) and p.ends_at < now()
    and exists (select 1 from memberships m where m.pulse_id = p.id and m.status = 'accepted')
  group by p.host_id;
$$;

-- ---------- LINE: linked accounts + notification settings ----------
create table if not exists public.line_links (
  user_id      uuid primary key references public.profiles(id) on delete cascade,
  line_user_id text not null unique,
  line_name    text,
  linked_at    timestamptz not null default now()
);
alter table public.line_links enable row level security;
drop policy if exists "own line link" on public.line_links;
create policy "own line link" on public.line_links for select using (user_id = auth.uid());
-- written only by the server (Cloudflare Worker with the service role key)

create table if not exists public.line_link_codes (
  code       text primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null default now() + interval '15 minutes'
);
alter table public.line_link_codes enable row level security; -- no policies: server only

create or replace function public.start_line_link() returns text
language plpgsql security definer set search_path = public as $$
declare v text := replace(gen_random_uuid()::text, '-', '');
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  insert into profiles (id) values (auth.uid()) on conflict do nothing;
  delete from line_link_codes where user_id = auth.uid() or expires_at < now();
  insert into line_link_codes (code, user_id) values (v, auth.uid());
  return v;
end $$;

create table if not exists public.notify_prefs (
  user_id    uuid primary key default auth.uid() references public.profiles(id) on delete cascade,
  enabled    boolean not null default true,
  categories pulse_category[] not null default '{}',
  lat        double precision not null,
  lng        double precision not null,
  radius_m   int not null default 2000 check (radius_m between 300 and 15000),
  last_sent  timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.notify_prefs enable row level security;
drop policy if exists "own notify prefs" on public.notify_prefs;
create policy "own notify prefs" on public.notify_prefs for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on function public.sync_verified() from public, anon;
revoke all on function public.start_line_link() from public, anon;
grant execute on function public.sync_verified() to authenticated;
grant execute on function public.start_line_link() to authenticated;
grant execute on function public.host_stats(uuid[]) to anon, authenticated;

-- ---------- photo storage ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('feed-photos', 'feed-photos', true, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists "upload into own folder" on storage.objects;
create policy "upload into own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'feed-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- realtime ----------
do $$ begin
  alter publication supabase_realtime add table public.pulses, public.memberships, public.feed_posts;
exception when duplicate_object then null; end $$;

-- ---------- profiles: bio, public/private, follows ----------
-- A public profile shows the activities someone hosted and joined to everyone, and anyone can follow it.
-- A private profile shows them only to accepted followers; following it sends a request.
alter table public.profiles add column if not exists bio text check (bio is null or char_length(bio) <= 160);
alter table public.profiles add column if not exists is_public boolean not null default true;

create table if not exists public.follows (
  follower   uuid not null references public.profiles(id) on delete cascade,
  followee   uuid not null references public.profiles(id) on delete cascade,
  status     text not null default 'accepted' check (status in ('requested','accepted')),
  created_at timestamptz not null default now(),
  primary key (follower, followee),
  check (follower <> followee)
);
create index if not exists follows_followee on public.follows (followee, status);
alter table public.follows enable row level security;
drop policy if exists "follows seen by the two people" on public.follows;
drop policy if exists "unfollow or remove a follower" on public.follows;
create policy "follows seen by the two people" on public.follows for select to authenticated
  using (follower = auth.uid() or followee = auth.uid());
create policy "unfollow or remove a follower" on public.follows for delete to authenticated
  using (follower = auth.uid() or followee = auth.uid());
-- following and accepting go through the functions below

create or replace function public.can_see_profile(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_user = auth.uid()
      or coalesce((select is_public from profiles where id = p_user), false)
      or exists (select 1 from follows where follower = auth.uid() and followee = p_user and status = 'accepted');
$$;

create or replace function public.follow_user(p_user uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_status text;
begin
  if v_uid is null then raise exception 'Sign in first'; end if;
  if p_user = v_uid then raise exception 'That is you'; end if;
  if not exists (select 1 from profiles where id = p_user) then raise exception 'Profile not found'; end if;
  insert into profiles (id) values (v_uid) on conflict do nothing;
  v_status := case when (select is_public from profiles where id = p_user) then 'accepted' else 'requested' end;
  insert into follows (follower, followee, status) values (v_uid, p_user, v_status)
  on conflict (follower, followee) do nothing;
  return (select status from follows where follower = v_uid and followee = p_user);
end $$;

create or replace function public.respond_follow(p_follower uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_accept then
    update follows set status = 'accepted' where follower = p_follower and followee = auth.uid();
  else
    delete from follows where follower = p_follower and followee = auth.uid();
  end if;
end $$;

-- switching to public lets everyone who asked in
create or replace function public.set_profile_public(p_public boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id) values (auth.uid()) on conflict do nothing;
  update profiles set is_public = p_public where id = auth.uid();
  if p_public then update follows set status = 'accepted' where followee = auth.uid() and status = 'requested'; end if;
end $$;

create or replace function public.profile_summary(p_user uuid) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'id', p.id, 'display_name', p.display_name, 'avatar_url', p.avatar_url, 'verified', p.verified,
    'bio', p.bio, 'is_public', p.is_public, 'interests', p.interests,
    'can_see', public.can_see_profile(p.id),
    'hosted', (select count(*) from pulses where host_id = p.id),
    'joined', (select count(*) from memberships where user_id = p.id and status = 'accepted'),
    'followers', (select count(*) from follows where followee = p.id and status = 'accepted'),
    'following', (select count(*) from follows where follower = p.id and status = 'accepted'),
    'my_follow', (select status from follows where follower = auth.uid() and followee = p.id),
    'follows_me', exists (select 1 from follows where follower = p.id and followee = auth.uid() and status = 'accepted')
  ) from profiles p where p.id = p_user;
$$;

-- activities someone hosted / joined, newest first (empty if their profile is private to you)
create or replace function public.profile_activity(p_user uuid) returns table (pulse_id uuid, kind text, at timestamptz)
language sql stable security definer set search_path = public as $$
  select * from (
    select id, 'hosted'::text, starts_at from pulses where host_id = p_user
    union all
    select p.id, 'joined'::text, p.starts_at from memberships m join pulses p on p.id = m.pulse_id
    where m.user_id = p_user and m.status = 'accepted'
  ) a
  where public.can_see_profile(p_user)
  order by 3 desc limit 120;
$$;

-- for the "Following" feed: what people I follow are hosting or joining (recent and upcoming)
create or replace function public.following_pulses() returns table (pulse_id uuid, via uuid, kind text)
language sql stable security definer set search_path = public as $$
  with f as (select followee from follows where follower = auth.uid() and status = 'accepted')
  select distinct on (x.id) x.id, x.via, x.kind from (
    select p.id, p.host_id as via, 'hosted'::text as kind, p.starts_at from pulses p join f on f.followee = p.host_id
    where p.ends_at > now() - interval '2 days'
    union all
    select p.id, m.user_id, 'joined', p.starts_at from memberships m join f on f.followee = m.user_id join pulses p on p.id = m.pulse_id
    where m.status = 'accepted' and p.ends_at > now() - interval '2 days'
  ) x
  order by x.id, case x.kind when 'hosted' then 0 else 1 end
  limit 150;
$$;

revoke all on function public.follow_user(uuid) from public, anon;
revoke all on function public.respond_follow(uuid, boolean) from public, anon;
revoke all on function public.set_profile_public(boolean) from public, anon;
revoke all on function public.following_pulses() from public, anon;
grant execute on function public.follow_user(uuid) to authenticated;
grant execute on function public.respond_follow(uuid, boolean) to authenticated;
grant execute on function public.set_profile_public(boolean) to authenticated;
grant execute on function public.following_pulses() to authenticated;
grant execute on function public.can_see_profile(uuid) to anon, authenticated;
grant execute on function public.profile_summary(uuid) to anon, authenticated;
grant execute on function public.profile_activity(uuid) to anon, authenticated;

-- ---------- Instagram auto-poster (written only by the Worker with the service key) ----------
create table if not exists public.ig_posts (
  id           text primary key,
  status       text not null check (status in ('processing','published','error')),
  container_id text,
  media_id     text,
  error        text,
  attempts     int not null default 0,
  published_at timestamptz,
  updated_at   timestamptz not null default now()
);
create table if not exists public.ig_state (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);
alter table public.ig_posts enable row level security;
alter table public.ig_state enable row level security;
-- no policies: only the service role (the Worker) can read or write these
