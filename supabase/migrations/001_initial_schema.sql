create extension if not exists pgcrypto;

create type public.member_role as enum ('owner', 'member');
create type public.transaction_kind as enum ('income', 'expense', 'payable', 'receivable', 'payment', 'collection');

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  created_at timestamptz not null default now()
);

create table public.company_memberships (
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  new_company_id uuid;
begin
  insert into public.companies (name)
  values (coalesce(nullif(trim(new.raw_user_meta_data ->> 'company_name'), ''), 'Yeni işletme'))
  returning id into new_company_id;
  insert into public.company_memberships (company_id, user_id, role)
  values (new_company_id, new.id, 'owner');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create table public.contacts (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  name text not null, relationship text not null default 'other', phone text, email text, address text, notes text,
  is_active boolean not null default true, created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  name text not null, code text, description text, customer_id uuid references public.contacts(id) on delete set null,
  start_date date, end_date date, status text not null default 'active', notes text, created_at timestamptz not null default now()
);

create table public.transaction_categories (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  name text not null, kind public.transaction_kind not null, unique(company_id, name, kind)
);

create table public.financial_transactions (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  kind public.transaction_kind not null, amount numeric(14,2) not null check (amount > 0), transaction_date date not null,
  description text not null, category_id uuid references public.transaction_categories(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete restrict, project_id uuid references public.projects(id) on delete set null,
  payment_method text, reference_number text, created_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);

create index financial_transactions_company_date_idx on public.financial_transactions(company_id, transaction_date desc);
create index financial_transactions_contact_idx on public.financial_transactions(contact_id);
create index financial_transactions_project_idx on public.financial_transactions(project_id);

create or replace function public.is_company_member(target_company uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.company_memberships where company_id = target_company and user_id = auth.uid()); $$;

alter table public.companies enable row level security;
alter table public.company_memberships enable row level security;
alter table public.contacts enable row level security;
alter table public.projects enable row level security;
alter table public.transaction_categories enable row level security;
alter table public.financial_transactions enable row level security;

create policy "members read companies" on public.companies for select using (public.is_company_member(id));
create policy "members read memberships" on public.company_memberships for select using (public.is_company_member(company_id));
create policy "members manage contacts" on public.contacts for all using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));
create policy "members manage projects" on public.projects for all using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));
create policy "members manage categories" on public.transaction_categories for all using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));
create policy "members manage transactions" on public.financial_transactions for all using (public.is_company_member(company_id)) with check (public.is_company_member(company_id) and created_by = auth.uid());