-- International LionProfit production schema
-- Run in Supabase SQL Editor AFTER creating the project.
-- No real wallet addresses or secrets are included here.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username = lower(username) and username ~ '^[a-z0-9_]{3,24}$'),
  email text,
  phone text not null,
  role text not null default 'user' check (role in ('user','admin')),
  account_status text not null default 'ACTIVE' check (account_status in ('ACTIVE','SUSPENDED')),
  available_balance numeric(20,8) not null default 0 check (available_balance >= 0),
  pending_withdrawal numeric(20,8) not null default 0 check (pending_withdrawal >= 0),
  referral_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.packages (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null unique,
  deposit numeric(20,8) not null check (deposit > 0),
  daily_accrual numeric(20,8) not null check (daily_accrual >= 0),
  duration_days integer not null check (duration_days > 0),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
  display_order integer not null default 1,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_settings (
  id text primary key default 'default' check (id = 'default'),
  binance_pay_id text not null default '',
  trc20_address text not null default '',
  bep20_address text not null default '',
  binance_qr_url text not null default '',
  trc20_qr_url text not null default '',
  bep20_qr_url text not null default '',
  instructions text not null default 'Please send the exact amount to the address shown and paste the transaction hash/TxID. Upload a payment screenshot when available.',
  min_deposit numeric(20,8) not null default 10 check (min_deposit >= 0),
  min_donation numeric(20,8) not null default 1 check (min_donation >= 0),
  min_withdrawal numeric(20,8) not null default 5 check (min_withdrawal >= 0),
  binance_enabled boolean not null default true,
  trc20_enabled boolean not null default true,
  bep20_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

create table if not exists public.user_packages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  package_id uuid not null references public.packages(id),
  package_name text not null,
  deposit_amount numeric(20,8) not null,
  daily_accrual numeric(20,8) not null,
  days_total integer not null,
  days_completed integer not null default 0,
  start_at timestamptz not null default now(),
  end_at timestamptz not null,
  last_accrual_at timestamptz,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','COMPLETED','CANCELLED')),
  created_at timestamptz not null default now()
);
create unique index if not exists one_active_package_per_user on public.user_packages(user_id) where status = 'ACTIVE';
create index if not exists user_packages_user_idx on public.user_packages(user_id, status);

create table if not exists public.deposits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  package_id uuid not null references public.packages(id),
  package_name text not null,
  amount numeric(20,8) not null check (amount > 0),
  method text not null check (method in ('Binance Pay','USDT TRC20','USDT BEP20')),
  txid text not null,
  sender_wallet text,
  proof_path text,
  status text not null default 'PENDING' check (status in ('PENDING','APPROVED','REJECTED')),
  submitted_at timestamptz not null default now(),
  verified_at timestamptz,
  verified_by uuid references public.profiles(id),
  note text
);
create index if not exists deposits_user_idx on public.deposits(user_id, submitted_at desc);

create table if not exists public.withdrawals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  username text not null,
  amount numeric(20,8) not null check (amount > 0),
  method text not null check (method in ('Binance Pay','USDT TRC20','USDT BEP20')),
  destination text not null,
  status text not null default 'PENDING' check (status in ('PENDING','SENT','REJECTED')),
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  processed_by uuid references public.profiles(id),
  payout_txid text,
  note text
);
create index if not exists withdrawals_user_idx on public.withdrawals(user_id, requested_at desc);

create table if not exists public.donations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  donor_name text,
  is_anonymous boolean not null default false,
  amount numeric(20,8) not null check (amount > 0),
  method text not null check (method in ('Reward Balance','Binance Pay','USDT TRC20','USDT BEP20')),
  txid text,
  proof_path text,
  status text not null default 'PENDING' check (status in ('PENDING','VERIFIED','REJECTED')),
  message text,
  submitted_at timestamptz not null default now(),
  verified_at timestamptz,
  verified_by uuid references public.profiles(id)
);
create index if not exists donations_public_idx on public.donations(status, submitted_at desc);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  amount numeric(20,8) not null,
  balance_before numeric(20,8) not null,
  balance_after numeric(20,8) not null,
  status text not null default 'COMPLETED',
  reference_id text not null,
  note text,
  created_at timestamptz not null default now(),
  unique(user_id, type, reference_id)
);
create index if not exists transactions_user_idx on public.transactions(user_id, created_at desc);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target text not null,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_created_idx on public.audit_logs(created_at desc);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.payment_settings (id) values ('default') on conflict (id) do nothing;

insert into public.packages (code, name, deposit, daily_accrual, duration_days, display_order, description)
values
  ('BASIC','BASIC',10,2,45,1,'Entry tier starter package with a 45-day cycle.'),
  ('RARE','RARE',25,6,45,2,'Mid-level package configuration with a 45-day cycle.'),
  ('EPIC','EPIC',35,10,45,3,'Higher-tier package configuration with a 45-day cycle.'),
  ('LEGENDARY','LEGENDARY',50,14,45,4,'Advanced package configuration with a 45-day cycle.'),
  ('MYTHIC','MYTHIC',100,20,45,5,'Top-tier package configuration with a 45-day cycle.')
on conflict (code) do update set
  name=excluded.name, deposit=excluded.deposit, daily_accrual=excluded.daily_accrual,
  duration_days=excluded.duration_days, display_order=excluded.display_order,
  description=excluded.description;

insert into public.announcements (title, content)
select 'Welcome to International LionProfit', 'Review the payment settings and account notices before using deposits or withdrawals.'
where not exists (select 1 from public.announcements);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists packages_updated_at on public.packages;
create trigger packages_updated_at before update on public.packages for each row execute function public.set_updated_at();
drop trigger if exists announcements_updated_at on public.announcements;
create trigger announcements_updated_at before update on public.announcements for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uname text;
begin
  uname := lower(coalesce(new.raw_user_meta_data->>'username', split_part(new.email,'@',1)));
  insert into public.profiles(id, username, email, phone)
  values (
    new.id,
    uname,
    nullif(new.raw_user_meta_data->>'contact_email',''),
    coalesce(nullif(new.raw_user_meta_data->>'phone',''),'not-provided')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin' and account_status = 'ACTIVE');
$$;

create or replace function public.log_admin_action(p_action text, p_target text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Administrator permission required'; end if;
  insert into public.audit_logs(admin_id, action, target, note) values(auth.uid(), p_action, p_target, p_note);
end;
$$;

create or replace function public.submit_deposit(
  p_package_id uuid,
  p_method text,
  p_txid text,
  p_sender_wallet text default null,
  p_proof_path text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  p public.packages%rowtype;
  s public.payment_settings%rowtype;
  new_id uuid;
  destination text;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if exists(select 1 from public.user_packages where user_id=uid and status='ACTIVE') then
    raise exception 'You already have an active package';
  end if;
  select * into p from public.packages where id=p_package_id and status='ACTIVE';
  if not found then raise exception 'Package is not available'; end if;
  if p.deposit < (select min_deposit from public.payment_settings where id='default') then
    raise exception 'Package amount is below the configured minimum deposit';
  end if;
  select * into s from public.payment_settings where id='default';
  if p_method = 'Binance Pay' then destination := s.binance_pay_id; if not s.binance_enabled then raise exception 'Binance Pay is disabled'; end if;
  elsif p_method = 'USDT TRC20' then destination := s.trc20_address; if not s.trc20_enabled then raise exception 'TRC20 is disabled'; end if;
  elsif p_method = 'USDT BEP20' then destination := s.bep20_address; if not s.bep20_enabled then raise exception 'BEP20 is disabled'; end if;
  else raise exception 'Unsupported payment method'; end if;
  if coalesce(trim(destination),'') = '' then raise exception 'Selected payment method is not configured'; end if;
  if length(trim(coalesce(p_txid,''))) < 6 then raise exception 'Transaction ID is required'; end if;
  insert into public.deposits(user_id, package_id, package_name, amount, method, txid, sender_wallet, proof_path)
  values(uid, p.id, p.name, p.deposit, p_method, trim(p_txid), nullif(trim(p_sender_wallet),''), nullif(trim(p_proof_path),''))
  returning id into new_id;
  return new_id;
end;
$$;


create or replace function public.approve_deposit(p_deposit_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.deposits%rowtype;
  u public.profiles%rowtype;
  p public.packages%rowtype;
  up_id uuid;
begin
  if not public.is_admin() then raise exception 'Administrator permission required'; end if;
  select * into d from public.deposits where id=p_deposit_id for update;
  if not found then raise exception 'Deposit not found'; end if;
  if d.status <> 'PENDING' then raise exception 'Deposit is already processed'; end if;
  select * into u from public.profiles where id=d.user_id for update;
  if u.account_status <> 'ACTIVE' then raise exception 'User account is suspended'; end if;
  if exists(select 1 from public.user_packages where user_id=d.user_id and status='ACTIVE') then
    raise exception 'User already has an active package';
  end if;
  select * into p from public.packages where id=d.package_id;
  if not found or p.status <> 'ACTIVE' then raise exception 'Package no longer active'; end if;
  insert into public.user_packages(user_id, package_id, package_name, deposit_amount, daily_accrual, days_total, start_at, end_at)
  values(d.user_id, p.id, p.name, p.deposit, p.daily_accrual, p.duration_days, now(), now() + make_interval(days => p.duration_days))
  returning id into up_id;
  update public.deposits
    set status='APPROVED', verified_at=now(), verified_by=auth.uid(), note=coalesce(note,'')
  where id=d.id;
  insert into public.transactions(user_id, type, amount, balance_before, balance_after, status, reference_id, note)
  values(d.user_id, 'DEPOSIT', d.amount, u.available_balance, u.available_balance, 'COMPLETED', d.id::text, 'Deposit approved and package activated');
  insert into public.audit_logs(admin_id, action, target, note)
  values(auth.uid(), 'APPROVE_DEPOSIT', d.id::text, format('Approved %s deposit for %s; package %s activated', d.amount, u.username, p.name));
end;
$$;


create or replace function public.attach_deposit_proof(p_deposit_id uuid, p_proof_path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.deposits set proof_path=nullif(trim(p_proof_path),'')
  where id=p_deposit_id and user_id=auth.uid() and status='PENDING';
  if not found then raise exception 'Deposit not found or no longer pending'; end if;
end;
$$;

create or replace function public.attach_donation_proof(p_donation_id uuid, p_proof_path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.donations set proof_path=nullif(trim(p_proof_path),'')
  where id=p_donation_id and user_id=auth.uid() and status='PENDING';
  if not found then raise exception 'Donation not found or no longer pending'; end if;
end;
$$;

create or replace function public.reject_deposit(p_deposit_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare d public.deposits%rowtype;
begin
  if not public.is_admin() then raise exception 'Administrator permission required'; end if;
  select * into d from public.deposits where id=p_deposit_id for update;
  if not found then raise exception 'Deposit not found'; end if;
  if d.status <> 'PENDING' then raise exception 'Deposit is already processed'; end if;
  update public.deposits set status='REJECTED', verified_at=now(), verified_by=auth.uid(), note=p_note where id=d.id;
  insert into public.audit_logs(admin_id, action, target, note) values(auth.uid(), 'REJECT_DEPOSIT', d.id::text, coalesce(p_note,'Deposit rejected'));
end;
$$;

create or replace function public.request_withdrawal(p_amount numeric, p_method text, p_destination text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  u public.profiles%rowtype;
  s public.payment_settings%rowtype;
  wid uuid;
  before_bal numeric;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_amount <= 0 then raise exception 'Invalid amount'; end if;
  if p_method not in ('Binance Pay','USDT TRC20','USDT BEP20') then raise exception 'Unsupported payment method'; end if;
  if length(trim(coalesce(p_destination,''))) < 6 then raise exception 'Destination is required'; end if;
  select * into s from public.payment_settings where id='default';
  if p_amount < s.min_withdrawal then raise exception 'Amount is below minimum withdrawal'; end if;
  select * into u from public.profiles where id=uid for update;
  if u.account_status <> 'ACTIVE' then raise exception 'Account is suspended'; end if;
  if p_amount > u.available_balance then raise exception 'Insufficient available balance'; end if;
  before_bal := u.available_balance;
  update public.profiles set available_balance=available_balance-p_amount, pending_withdrawal=pending_withdrawal+p_amount where id=uid;
  insert into public.withdrawals(user_id, username, amount, method, destination)
  values(uid, u.username, p_amount, p_method, trim(p_destination)) returning id into wid;
  insert into public.transactions(user_id, type, amount, balance_before, balance_after, status, reference_id, note)
  values(uid, 'WITHDRAWAL_REQUEST', p_amount, before_bal, before_bal-p_amount, 'COMPLETED', wid::text, 'Balance reserved for manual withdrawal processing');
  return wid;
end;
$$;

create or replace function public.mark_withdrawal_sent(p_withdrawal_id uuid, p_payout_txid text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  w public.withdrawals%rowtype;
  u public.profiles%rowtype;
begin
  if not public.is_admin() then raise exception 'Administrator permission required'; end if;
  if length(trim(coalesce(p_payout_txid,''))) < 6 then raise exception 'Payout TxID is required'; end if;
  select * into w from public.withdrawals where id=p_withdrawal_id for update;
  if not found then raise exception 'Withdrawal not found'; end if;
  if w.status <> 'PENDING' then raise exception 'Withdrawal is already processed'; end if;
  select * into u from public.profiles where id=w.user_id for update;
  update public.profiles set pending_withdrawal=greatest(0,pending_withdrawal-w.amount) where id=u.id;
  update public.withdrawals set status='SENT', processed_at=now(), processed_by=auth.uid(), payout_txid=trim(p_payout_txid), note=p_note where id=w.id;
  insert into public.transactions(user_id, type, amount, balance_before, balance_after, status, reference_id, note)
  values(w.user_id, 'WITHDRAWAL_SENT', w.amount, u.available_balance, u.available_balance, 'COMPLETED', w.id::text, 'Manual payout recorded by administrator');
  insert into public.audit_logs(admin_id, action, target, note) values(auth.uid(), 'MARK_WITHDRAWAL_SENT', w.id::text, coalesce(p_note,'Payout recorded'));
end;
$$;

create or replace function public.reject_withdrawal(p_withdrawal_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  w public.withdrawals%rowtype;
  u public.profiles%rowtype;
  before_bal numeric;
  after_bal numeric;
begin
  if not public.is_admin() then raise exception 'Administrator permission required'; end if;
  select * into w from public.withdrawals where id=p_withdrawal_id for update;
  if not found then raise exception 'Withdrawal not found'; end if;
  if w.status <> 'PENDING' then raise exception 'Withdrawal is already processed'; end if;
  select * into u from public.profiles where id=w.user_id for update;
  before_bal := u.available_balance;
  update public.profiles set available_balance=available_balance+w.amount, pending_withdrawal=greatest(0,pending_withdrawal-w.amount) where id=u.id;
  after_bal := before_bal + w.amount;
  update public.withdrawals set status='REJECTED', processed_at=now(), processed_by=auth.uid(), note=p_note where id=w.id;
  insert into public.transactions(user_id, type, amount, balance_before, balance_after, status, reference_id, note)
  values(w.user_id, 'WITHDRAWAL_RELEASED', w.amount, before_bal, after_bal, 'COMPLETED', w.id::text, 'Reserved balance released after withdrawal rejection');
  insert into public.audit_logs(admin_id, action, target, note) values(auth.uid(), 'REJECT_WITHDRAWAL', w.id::text, coalesce(p_note,'Withdrawal rejected'));
end;
$$;

create or replace function public.create_balance_donation(p_amount numeric, p_donor_name text default null, p_is_anonymous boolean default false, p_message text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  u public.profiles%rowtype;
  s public.payment_settings%rowtype;
  did uuid;
  before_bal numeric;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_amount <= 0 then raise exception 'Invalid amount'; end if;
  select * into s from public.payment_settings where id='default';
  if p_amount < s.min_donation then raise exception 'Amount is below minimum donation'; end if;
  select * into u from public.profiles where id=uid for update;
  if p_amount > u.available_balance then raise exception 'Insufficient reward balance'; end if;
  before_bal := u.available_balance;
  update public.profiles set available_balance=available_balance-p_amount where id=uid;
  insert into public.donations(user_id, donor_name, is_anonymous, amount, method, txid, status, message, verified_at)
  values(uid, nullif(trim(p_donor_name),''), p_is_anonymous, p_amount, 'Reward Balance', 'INTERNAL_LEDGER_TRANSFER', 'VERIFIED', p_message, now()) returning id into did;
  insert into public.transactions(user_id, type, amount, balance_before, balance_after, status, reference_id, note)
  values(uid, 'DONATION', p_amount, before_bal, before_bal-p_amount, 'COMPLETED', did::text, 'Verified internal reward-balance donation');
  return did;
end;
$$;

create or replace function public.submit_external_donation(p_amount numeric, p_method text, p_txid text, p_donor_name text default null, p_is_anonymous boolean default false, p_message text default null, p_proof_path text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  s public.payment_settings%rowtype;
  did uuid;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select * into s from public.payment_settings where id='default';
  if p_amount < s.min_donation then raise exception 'Amount is below minimum donation'; end if;
  if p_method not in ('Binance Pay','USDT TRC20','USDT BEP20') then raise exception 'Unsupported donation method'; end if;
  if length(trim(coalesce(p_txid,''))) < 6 then raise exception 'Transaction ID is required'; end if;
  insert into public.donations(user_id, donor_name, is_anonymous, amount, method, txid, proof_path, status, message)
  values(uid, nullif(trim(p_donor_name),''), p_is_anonymous, p_amount, p_method, trim(p_txid), nullif(trim(p_proof_path),''), 'PENDING', p_message)
  returning id into did;
  return did;
end;
$$;

create or replace function public.verify_donation(p_donation_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare d public.donations%rowtype;
begin
  if not public.is_admin() then raise exception 'Administrator permission required'; end if;
  select * into d from public.donations where id=p_donation_id for update;
  if not found then raise exception 'Donation not found'; end if;
  if d.status <> 'PENDING' then raise exception 'Donation is already processed'; end if;
  update public.donations set status='VERIFIED', verified_at=now(), verified_by=auth.uid() where id=d.id;
  insert into public.audit_logs(admin_id, action, target, note) values(auth.uid(), 'VERIFY_DONATION', d.id::text, p_note);
end;
$$;

create or replace function public.reject_donation(p_donation_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare d public.donations%rowtype;
begin
  if not public.is_admin() then raise exception 'Administrator permission required'; end if;
  select * into d from public.donations where id=p_donation_id for update;
  if not found then raise exception 'Donation not found'; end if;
  if d.status <> 'PENDING' then raise exception 'Donation is already processed'; end if;
  update public.donations set status='REJECTED', verified_at=now(), verified_by=auth.uid(), message=coalesce(p_note,message) where id=d.id;
  insert into public.audit_logs(admin_id, action, target, note) values(auth.uid(), 'REJECT_DONATION', d.id::text, p_note);
end;
$$;

create or replace function public.update_payment_settings(p_settings jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Administrator permission required'; end if;
  insert into public.payment_settings(
    id, binance_pay_id, trc20_address, bep20_address, binance_qr_url, trc20_qr_url, bep20_qr_url,
    instructions, min_deposit, min_donation, min_withdrawal, binance_enabled, trc20_enabled, bep20_enabled, updated_at, updated_by
  ) values (
    'default',
    coalesce(p_settings->>'binance_pay_id',''), coalesce(p_settings->>'trc20_address',''), coalesce(p_settings->>'bep20_address',''),
    coalesce(p_settings->>'binance_qr_url',''), coalesce(p_settings->>'trc20_qr_url',''), coalesce(p_settings->>'bep20_qr_url',''),
    coalesce(p_settings->>'instructions',''), coalesce((p_settings->>'min_deposit')::numeric,10), coalesce((p_settings->>'min_donation')::numeric,1),
    coalesce((p_settings->>'min_withdrawal')::numeric,5), coalesce((p_settings->>'binance_enabled')::boolean,true),
    coalesce((p_settings->>'trc20_enabled')::boolean,true), coalesce((p_settings->>'bep20_enabled')::boolean,true), now(), auth.uid()
  ) on conflict(id) do update set
    binance_pay_id=excluded.binance_pay_id, trc20_address=excluded.trc20_address, bep20_address=excluded.bep20_address,
    binance_qr_url=excluded.binance_qr_url, trc20_qr_url=excluded.trc20_qr_url, bep20_qr_url=excluded.bep20_qr_url,
    instructions=excluded.instructions, min_deposit=excluded.min_deposit, min_donation=excluded.min_donation,
    min_withdrawal=excluded.min_withdrawal, binance_enabled=excluded.binance_enabled, trc20_enabled=excluded.trc20_enabled,
    bep20_enabled=excluded.bep20_enabled, updated_at=now(), updated_by=auth.uid();
  insert into public.audit_logs(admin_id, action, target, note) values(auth.uid(), 'UPDATE_PAYMENT_SETTINGS', 'payment_settings:default', 'Payment receiving settings changed');
end;
$$;

create or replace function public.admin_set_user_status(p_user_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare uname text;
begin
  if not public.is_admin() then raise exception 'Administrator permission required'; end if;
  if p_status not in ('ACTIVE','SUSPENDED') then raise exception 'Invalid status'; end if;
  if p_user_id = auth.uid() and p_status='SUSPENDED' then raise exception 'You cannot suspend your own admin account'; end if;
  select username into uname from public.profiles where id=p_user_id;
  if not found then raise exception 'User not found'; end if;
  update public.profiles set account_status=p_status where id=p_user_id;
  insert into public.audit_logs(admin_id, action, target, note) values(auth.uid(), 'SET_USER_STATUS', p_user_id::text, format('%s -> %s', uname, p_status));
end;
$$;

create or replace function public.admin_update_package(p_package_id uuid, p_deposit numeric, p_daily_accrual numeric, p_duration_days integer, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare pname text;
begin
  if not public.is_admin() then raise exception 'Administrator permission required'; end if;
  if p_deposit <= 0 or p_daily_accrual < 0 or p_duration_days <= 0 then raise exception 'Invalid package values'; end if;
  if p_status not in ('ACTIVE','INACTIVE') then raise exception 'Invalid package status'; end if;
  select name into pname from public.packages where id=p_package_id;
  if not found then raise exception 'Package not found'; end if;
  update public.packages set deposit=p_deposit, daily_accrual=p_daily_accrual, duration_days=p_duration_days, status=p_status where id=p_package_id;
  insert into public.audit_logs(admin_id, action, target, note) values(auth.uid(), 'UPDATE_PACKAGE', p_package_id::text, format('%s updated', pname));
end;
$$;

create or replace function public.apply_due_rewards(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  up public.user_packages%rowtype;
  prof public.profiles%rowtype;
  due_days integer;
  n integer;
  reward_date date;
  before_bal numeric;
  after_bal numeric;
  ref text;
  credited integer := 0;
begin
  select * into prof from public.profiles where id=p_user_id for update;
  if not found or prof.account_status <> 'ACTIVE' then return 0; end if;
  for up in select * from public.user_packages where user_id=p_user_id and status='ACTIVE' order by start_at for update loop
    due_days := least(up.days_total, greatest(0, floor(extract(epoch from (least(now(), up.end_at) - up.start_at))/86400)::integer));
    if due_days > up.days_completed then
      for n in (up.days_completed+1)..due_days loop
        reward_date := (up.start_at::date + n);
        ref := format('reward:%s:%s', up.id, reward_date);
        if not exists(select 1 from public.transactions where user_id=p_user_id and type='REWARD_ACCRUAL' and reference_id=ref) then
          before_bal := prof.available_balance;
          after_bal := before_bal + up.daily_accrual;
          prof.available_balance := after_bal;
          insert into public.transactions(user_id, type, amount, balance_before, balance_after, status, reference_id, note)
          values(p_user_id, 'REWARD_ACCRUAL', up.daily_accrual, before_bal, after_bal, 'COMPLETED', ref, format('Daily reward for %s package', up.package_name));
          credited := credited + 1;
        end if;
      end loop;
      update public.profiles set available_balance=prof.available_balance where id=p_user_id;
      update public.user_packages
        set days_completed=due_days,
            last_accrual_at=up.start_at + make_interval(days => due_days),
            status=case when due_days >= days_total then 'COMPLETED' else 'ACTIVE' end
      where id=up.id;
    end if;
  end loop;
  return credited;
end;
$$;

create or replace function public.process_my_rewards()
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  return public.apply_due_rewards(auth.uid());
end;
$$;

create or replace function public.process_daily_rewards()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare u record; total integer := 0;
begin
  for u in select id from public.profiles where account_status='ACTIVE' loop
    total := total + public.apply_due_rewards(u.id);
  end loop;
  return total;
end;
$$;

create or replace view public.public_platform_stats as
select
  (select count(*) from public.profiles) as registered_users,
  (select count(*) from public.user_packages where status='ACTIVE') as active_packages,
  coalesce((select sum(amount) from public.deposits where status='APPROVED'),0) as verified_deposits,
  coalesce((select sum(amount) from public.withdrawals where status='SENT'),0) as verified_withdrawals,
  coalesce((select sum(amount) from public.donations where status='VERIFIED'),0) as verified_donations,
  (select count(distinct coalesce(user_id::text, donor_name)) from public.donations where status='VERIFIED') as verified_donors;

-- RLS
alter table public.profiles enable row level security;
alter table public.packages enable row level security;
alter table public.payment_settings enable row level security;
alter table public.user_packages enable row level security;
alter table public.deposits enable row level security;
alter table public.withdrawals enable row level security;
alter table public.donations enable row level security;
alter table public.transactions enable row level security;
alter table public.audit_logs enable row level security;
alter table public.announcements enable row level security;

-- Profiles
 drop policy if exists profiles_self on public.profiles;
create policy profiles_self on public.profiles for select to authenticated using (id=auth.uid());
drop policy if exists profiles_admin_select on public.profiles;
create policy profiles_admin_select on public.profiles for select to authenticated using (public.is_admin());
-- No direct client balance writes.

-- Packages
 drop policy if exists packages_public_read on public.packages;
create policy packages_public_read on public.packages for select to anon, authenticated using (true);
drop policy if exists packages_admin_write on public.packages;
create policy packages_admin_write on public.packages for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Payment settings
 drop policy if exists payment_public_read on public.payment_settings;
create policy payment_public_read on public.payment_settings for select to anon, authenticated using (true);
drop policy if exists payment_admin_write on public.payment_settings;
create policy payment_admin_write on public.payment_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- User packages
 drop policy if exists user_packages_self_read on public.user_packages;
create policy user_packages_self_read on public.user_packages for select to authenticated using (user_id=auth.uid() or public.is_admin());

-- Deposits
 drop policy if exists deposits_self_read on public.deposits;
create policy deposits_self_read on public.deposits for select to authenticated using (user_id=auth.uid() or public.is_admin());

-- Withdrawals
 drop policy if exists withdrawals_self_read on public.withdrawals;
create policy withdrawals_self_read on public.withdrawals for select to authenticated using (user_id=auth.uid() or public.is_admin());

-- Donations
 drop policy if exists donations_public_verified on public.donations;
create policy donations_public_verified on public.donations for select to anon, authenticated using (status='VERIFIED' or user_id=auth.uid() or public.is_admin());

-- Transactions
 drop policy if exists transactions_self_read on public.transactions;
create policy transactions_self_read on public.transactions for select to authenticated using (user_id=auth.uid() or public.is_admin());

-- Audit logs
 drop policy if exists audit_admin_read on public.audit_logs;
create policy audit_admin_read on public.audit_logs for select to authenticated using (public.is_admin());

-- Announcements
 drop policy if exists announcements_public_read on public.announcements;
create policy announcements_public_read on public.announcements for select to anon, authenticated using (active or public.is_admin());
drop policy if exists announcements_admin_write on public.announcements;
create policy announcements_admin_write on public.announcements for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Least-privilege grants
grant usage on schema public to anon, authenticated;
grant select on public.packages, public.payment_settings, public.announcements, public.donations, public.public_platform_stats to anon, authenticated;
grant select on public.profiles, public.user_packages, public.deposits, public.withdrawals, public.transactions, public.audit_logs to authenticated;
grant execute on function public.submit_deposit(uuid,text,text,text,text), public.attach_deposit_proof(uuid,text), public.attach_donation_proof(uuid,text) to authenticated;
grant execute on function public.request_withdrawal(numeric,text,text) to authenticated;
grant execute on function public.create_balance_donation(numeric,text,boolean,text) to authenticated;
grant execute on function public.submit_external_donation(numeric,text,text,text,boolean,text,text) to authenticated;
grant execute on function public.process_my_rewards() to authenticated;
grant execute on function public.approve_deposit(uuid), public.reject_deposit(uuid,text) to authenticated;
grant execute on function public.mark_withdrawal_sent(uuid,text,text), public.reject_withdrawal(uuid,text) to authenticated;
grant execute on function public.verify_donation(uuid,text), public.reject_donation(uuid,text) to authenticated;
grant execute on function public.update_payment_settings(jsonb), public.admin_set_user_status(uuid,text), public.admin_update_package(uuid,numeric,numeric,integer,text) to authenticated;
grant execute on function public.log_admin_action(text,text,text) to authenticated;
revoke execute on function public.process_daily_rewards() from public, anon, authenticated;
grant execute on function public.process_daily_rewards() to service_role;

-- Optional: enable the pg_cron extension in Supabase Dashboard, then schedule this server-side job:
-- select cron.schedule('lionprofit-daily-rewards', '*/15 * * * *', $$select public.process_daily_rewards();$$);

-- Private storage bucket for deposit/donation proof files.
insert into storage.buckets (id, name, public)
values ('payment-proofs', 'payment-proofs', false)
on conflict (id) do update set public=false;

drop policy if exists payment_proofs_upload_own on storage.objects;
create policy payment_proofs_upload_own on storage.objects
for insert to authenticated
with check (bucket_id='payment-proofs' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists payment_proofs_read_own on storage.objects;
create policy payment_proofs_read_own on storage.objects
for select to authenticated
using (bucket_id='payment-proofs' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
