-- SPEC-017: CNS Cost Sharing
-- Global table defining how shared infrastructure costs are split across CNS customers.

create table cns_pool (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  nodes             integer not null default 0,
  share_pct_override numeric(6,4) null,  -- explicit override (0–100), null = compute from nodes
  is_this_customer  boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- At most one row may be flagged as "this customer"
create unique index cns_pool_single_this_customer
  on cns_pool (is_this_customer)
  where is_this_customer = true;

-- Trigger to keep updated_at current
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger cns_pool_updated_at
  before update on cns_pool
  for each row execute function set_updated_at();

-- Seed data
insert into cns_pool (name, nodes, is_this_customer) values
  ('GMCP',  17,  false),
  ('LACS',  194, false),
  ('HBW',   15,  false),
  ('VF',    30,  true);
