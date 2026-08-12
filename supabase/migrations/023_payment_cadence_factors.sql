-- SPEC-018: Payment Cadence Discounts
-- Lookup table: upfront payment term in months → discount % applied to contract total.

create table payment_cadence_factors (
  id             uuid primary key default gen_random_uuid(),
  upfront_months integer not null unique check (upfront_months >= 1),
  discount_pct   numeric(5,2) not null check (discount_pct >= 0 and discount_pct <= 100),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create trigger payment_cadence_factors_updated_at
  before update on payment_cadence_factors
  for each row execute function set_updated_at();

-- Seed with agreed discount schedule
insert into payment_cadence_factors (upfront_months, discount_pct) values
  (1,  0),
  (3,  2),
  (6,  4),
  (12, 6),
  (24, 15),
  (36, 23),
  (48, 25),
  (60, 30);
