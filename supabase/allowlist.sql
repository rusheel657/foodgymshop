-- Only emails in public.allowed_emails can create an account (Google or any other method).
-- Run once in Supabase → SQL Editor, then enable the hook (see plan.md, Phase 2).
-- To let a friend in later:  insert into public.allowed_emails (email) values ('friend@gmail.com');

create table if not exists public.allowed_emails (
  email text primary key
);
alter table public.allowed_emails enable row level security;

-- Only the auth server may read the list; the app (anon/authenticated) cannot.
grant select on public.allowed_emails to supabase_auth_admin;
drop policy if exists "auth admin reads allowlist" on public.allowed_emails;
create policy "auth admin reads allowlist" on public.allowed_emails
  for select to supabase_auth_admin using (true);

insert into public.allowed_emails (email) values ('rusheel657@gmail.com')
  on conflict do nothing;

create or replace function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
as $$
begin
  if exists (
    select 1 from public.allowed_emails
    where lower(email) = lower(event->'user'->>'email')
  ) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object(
    'error', jsonb_build_object(
      'message', 'This app is private. Your email is not on the allowlist.',
      'http_code', 403
    )
  );
end;
$$;

grant execute on function public.hook_before_user_created to supabase_auth_admin;
revoke execute on function public.hook_before_user_created from authenticated, anon, public;
