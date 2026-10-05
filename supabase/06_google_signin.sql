-- Google sign in support.
-- Run once in the Supabase SQL Editor.
--
-- A Google account arrives with no sign-up form behind it, so the trigger
-- that creates the profile has to read the name and picture that Google
-- supplies instead. Everything else is unchanged: the account is still
-- created as a BUYER, and platform_role is still only granted when an
-- administrator approves a verification application.

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  -- Our own sign-up form sends display_name. Google sends full_name, and
  -- some accounts only carry name, so take whichever one arrived.
  v_name text := left(coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      'New member'), 100);

  v_type text := upper(coalesce(new.raw_user_meta_data ->> 'signup_type', 'BUYER'));

  -- Google sends the profile picture under one of two keys. It is a link
  -- to Google, not a file in our storage, which the site already handles.
  v_avatar text := nullif(trim(coalesce(
      new.raw_user_meta_data ->> 'avatar_url',
      new.raw_user_meta_data ->> 'picture')), '');
begin
  if v_type not in ('BUYER', 'PRODUCER', 'BUSINESS') then
    v_type := 'BUYER';
  end if;

  insert into public.profiles (id, display_name, signup_type, contact_email, avatar_path)
  values (new.id, v_name, v_type::public.account_role, new.email, v_avatar);

  return new;
end;
$$;
