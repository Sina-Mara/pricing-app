-- SPEC-018: Payment Cadence Discounts — add payment fields to quotes table

alter table quotes
  add column payment_upfront_months  integer      not null default 1,
  add column payment_discount_override numeric(5,2) null,        -- manual override %, null = use table
  add column payment_discount_pct    numeric(5,2) null,          -- effective % applied (stored after calculation)
  add column payment_discount_amount numeric(12,2) null;         -- absolute discount amount on contract total
