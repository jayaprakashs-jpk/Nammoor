-- =====================================================================
-- Nammoor :: sign-in hardening
--  * New users from ANY sign-in method get a profile: mobile OTP (no email),
--    email OTP, email + password, Google (name comes from Google).
--  * Linking a mobile number later keeps profiles.phone in sync.
--  * SMS rate limit in the database. The Send SMS hook (an Edge Function,
--    see supabase/functions/send-sms) calls sms_rate_check() before every
--    text, so even a caller who skips the app is limited:
--      - at most 3 texts per number per 15 minutes
--      - only allowed country codes (default: India, +91)
--      - a global cap per hour, so SMS-pumping fraud cannot run up a bill
-- =====================================================================

-- ---------- profiles for every kind of new user ----------
create or replace function app.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, phone)
  values (
    new.id,
    left(coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),   -- Google
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),        -- Google, other providers
      ''), 80),
    case when new.phone ~ '^[0-9]{6,20}$' then '+' || new.phone end   -- auth stores digits only
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- A mobile number added later (Security settings) shows on the profile too.
create or replace function app.sync_profile_phone()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.phone ~ '^[0-9]{6,20}$' then
    update public.profiles set phone = '+' || new.phone where id = new.id and phone is distinct from '+' || new.phone;
  end if;
  return new;
end $$;
drop trigger if exists on_auth_user_phone on auth.users;
create trigger on_auth_user_phone after update of phone on auth.users
  for each row when (new.phone is distinct from old.phone) execute function app.sync_profile_phone();

-- ---------- SMS rate limit ----------
create table app.sms_settings (
  id                 int primary key default 1 check (id = 1),     -- one row
  allowed_prefixes   text[] not null default array['91'],           -- calling codes we will text
  per_number_max     int not null default 3 check (per_number_max between 1 and 20),
  per_number_minutes int not null default 15 check (per_number_minutes between 1 and 1440),
  hourly_cap         int not null default 300 check (hourly_cap >= 1)
);
insert into app.sms_settings default values;

create table app.sms_otp_log (
  id      bigint generated always as identity primary key,
  phone   text not null,
  at      timestamptz not null default now(),
  allowed boolean not null,
  reason  text
);
create index sms_otp_log_phone_idx on app.sms_otp_log (phone, at desc);
create index sms_otp_log_at_idx on app.sms_otp_log (at);

alter table app.sms_settings enable row level security;
alter table app.sms_otp_log enable row level security;
revoke all on app.sms_settings, app.sms_otp_log from public, anon, authenticated;

-- Atomic: two requests at the same instant cannot both squeeze in as the 3rd.
create or replace function app.sms_rate_check(p_phone text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  d text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  s app.sms_settings;
  n int;
  edge timestamptz;
  win interval;
  retry int;
begin
  select * into s from app.sms_settings where id = 1;
  win := make_interval(mins => s.per_number_minutes);

  if length(d) < 8 or length(d) > 15 then
    return jsonb_build_object('allowed', false, 'reason', 'bad_number', 'retry_after', 0);
  end if;
  perform pg_advisory_xact_lock(hashtext('sms:' || d));

  -- blocked attempts are logged for review, but only once a minute per number so an attacker can't fill the table
  if not exists (select 1 from unnest(s.allowed_prefixes) p where d like p || '%') then
    insert into app.sms_otp_log (phone, allowed, reason)
    select d, false, 'country_not_allowed'
     where not exists (select 1 from app.sms_otp_log where phone = d and not allowed and at > now() - interval '1 minute');
    return jsonb_build_object('allowed', false, 'reason', 'country_not_allowed', 'retry_after', 0);
  end if;

  select count(*) into n from app.sms_otp_log where phone = d and allowed and at > now() - win;
  if n >= s.per_number_max then
    -- the request that, once it ages out, makes room again
    select at into edge from app.sms_otp_log where phone = d and allowed and at > now() - win
     order by at desc offset s.per_number_max - 1 limit 1;
    retry := greatest(1, ceil(extract(epoch from (edge + win - now())))::int);
    insert into app.sms_otp_log (phone, allowed, reason)
    select d, false, 'number_limit'
     where not exists (select 1 from app.sms_otp_log where phone = d and not allowed and at > now() - interval '1 minute');
    return jsonb_build_object('allowed', false, 'reason', 'number_limit', 'retry_after', retry);
  end if;

  select count(*) into n from app.sms_otp_log where allowed and at > now() - interval '1 hour';
  if n >= s.hourly_cap then
    insert into app.sms_otp_log (phone, allowed, reason)
    select d, false, 'global_cap'
     where not exists (select 1 from app.sms_otp_log where phone = d and not allowed and at > now() - interval '1 minute');
    return jsonb_build_object('allowed', false, 'reason', 'global_cap', 'retry_after', 600);
  end if;

  insert into app.sms_otp_log (phone, allowed) values (d, true);
  delete from app.sms_otp_log where at < now() - interval '7 days';
  return jsonb_build_object('allowed', true, 'reason', null, 'retry_after', 0);
end $$;

-- Reachable only with the service key (the Edge Function). Never from the app.
create or replace function public.sms_rate_check(p_phone text)
returns jsonb language sql security definer set search_path = '' as $$
  select app.sms_rate_check(p_phone)
$$;
revoke all on function app.sms_rate_check(text) from public, anon, authenticated;
revoke all on function public.sms_rate_check(text) from public, anon, authenticated;
grant execute on function public.sms_rate_check(text) to service_role;
