-- ============================================================
-- Factory Sales & Inventory System — Supabase Schema
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- PRODUCTS
-- ============================================================
create table products (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  standard_price numeric(12,2),
  low_stock_threshold integer,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================================
-- LOTS
-- ============================================================
create table lots (
  id uuid primary key default uuid_generate_v4(),
  lot_number text not null unique,
  product_id uuid not null references products(id),
  date_received date not null,
  boxes_received integer not null check (boxes_received > 0),
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================================
-- CUSTOMERS
-- ============================================================
create table customers (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================================
-- PAYMENT CHANNELS
-- ============================================================
create table payment_channels (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================================
-- ORDERS
-- ============================================================
create table orders (
  id uuid primary key default uuid_generate_v4(),
  order_number text not null unique,
  order_date date not null,
  customer_id uuid not null references customers(id),
  is_paid boolean not null default false,
  payment_channel_id uuid references payment_channels(id),
  note text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

-- ============================================================
-- ORDER LINES
-- ============================================================
create table order_lines (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid not null references orders(id) on delete cascade,
  lot_id uuid not null references lots(id),
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null,
  is_price_adjusted boolean not null default false,
  created_at timestamptz not null default now()
);

-- ============================================================
-- STOCK ADJUSTMENTS
-- ============================================================
create table stock_adjustments (
  id uuid primary key default uuid_generate_v4(),
  lot_id uuid not null references lots(id),
  quantity integer not null, -- positive = add, negative = reduce
  reason text not null, -- 'damaged', 'return', 'sample', 'correction', 'other'
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- ============================================================
-- CHANGE HISTORY
-- ============================================================
create table change_history (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id),
  user_email text,
  action text not null, -- 'create', 'edit', 'delete'
  entity_type text not null, -- 'order', 'lot', 'product', 'customer', 'adjustment', etc.
  entity_id uuid,
  entity_label text, -- human-readable identifier (order number, lot number, etc.)
  before_data jsonb,
  after_data jsonb,
  extra jsonb, -- e.g. { return_stock: true/false }
  created_at timestamptz not null default now()
);

-- ============================================================
-- ORDER NUMBER SEQUENCE (per year-month)
-- ============================================================
create table order_number_seq (
  year_month text primary key, -- e.g. '6911'
  last_seq integer not null default 0
);

-- ============================================================
-- VIEWS: lot remaining boxes
-- ============================================================
create or replace view lot_remaining as
select
  l.id as lot_id,
  l.lot_number,
  l.product_id,
  l.date_received,
  l.boxes_received,
  l.deleted_at,
  coalesce(sum(ol.quantity), 0) as boxes_sold,
  coalesce(sum(sa.quantity), 0) as adjustment_total,
  l.boxes_received
    - coalesce(sum(ol.quantity), 0)
    + coalesce(sum(sa.quantity), 0) as remaining_boxes
from lots l
left join order_lines ol on ol.lot_id = l.id
  and ol.order_id in (select id from orders where deleted_at is null)
left join stock_adjustments sa on sa.lot_id = l.id
group by l.id;

-- ============================================================
-- VIEWS: product stock totals
-- ============================================================
create or replace view product_stock as
select
  p.id as product_id,
  p.name,
  p.standard_price,
  p.low_stock_threshold,
  coalesce(sum(lr.remaining_boxes), 0) as total_remaining
from products p
left join lot_remaining lr on lr.product_id = p.id and lr.deleted_at is null
where p.deleted_at is null
group by p.id, p.name, p.standard_price, p.low_stock_threshold;

-- ============================================================
-- SEED DATA — products
-- ============================================================
insert into products (name, standard_price) values
  ('นิล 25-30', 630),
  ('นิล 25-30 (S)', 580),
  ('นิล 40-60', 750),
  ('นิล 60-80', 800),
  ('นิล 80-100', 850),
  ('นิล 40-60 (SP)', 780),
  ('นิลแล่ มารีน่า', 750),
  ('ทับทิม 100-120', 1100),
  ('ทับทิม 100-200', 1100),
  ('ทับทิม 120-150', 1150),
  ('ทับทิม 150-200', 1150),
  ('นิล 200-400', 1150),
  ('บุษรา 20-30', 670),
  ('บาซา 200-400', 800),
  ('กระพงขาว 15-20', 2000),
  ('กระพงขาว 200-300', 2000),
  ('กระพงขาว 300-500', 2000),
  ('นิลหั่นชิ้น', null);

-- ============================================================
-- SEED DATA — payment channels
-- ============================================================
insert into payment_channels (name) values
  ('เงินสด'),
  ('กสิกร พิชชาพร'),
  ('กสิกร ภาวิณี'),
  ('SCBเอกสมุทร'),
  ('กรุงศรี ภาวิณี'),
  ('กรุงเทพ'),
  ('อื่นๆ');

-- ============================================================
-- ROW LEVEL SECURITY
-- Enable RLS so only authenticated users can access data
-- ============================================================
alter table products enable row level security;
alter table lots enable row level security;
alter table customers enable row level security;
alter table payment_channels enable row level security;
alter table orders enable row level security;
alter table order_lines enable row level security;
alter table stock_adjustments enable row level security;
alter table change_history enable row level security;
alter table order_number_seq enable row level security;

-- Policies: authenticated users can read and write everything
create policy "auth read products" on products for select to authenticated using (true);
create policy "auth write products" on products for all to authenticated using (true) with check (true);

create policy "auth read lots" on lots for select to authenticated using (true);
create policy "auth write lots" on lots for all to authenticated using (true) with check (true);

create policy "auth read customers" on customers for select to authenticated using (true);
create policy "auth write customers" on customers for all to authenticated using (true) with check (true);

create policy "auth read payment_channels" on payment_channels for select to authenticated using (true);
create policy "auth write payment_channels" on payment_channels for all to authenticated using (true) with check (true);

create policy "auth read orders" on orders for select to authenticated using (true);
create policy "auth write orders" on orders for all to authenticated using (true) with check (true);

create policy "auth read order_lines" on order_lines for select to authenticated using (true);
create policy "auth write order_lines" on order_lines for all to authenticated using (true) with check (true);

create policy "auth read stock_adjustments" on stock_adjustments for select to authenticated using (true);
create policy "auth write stock_adjustments" on stock_adjustments for all to authenticated using (true) with check (true);

create policy "auth read change_history" on change_history for select to authenticated using (true);
create policy "auth write change_history" on change_history for all to authenticated using (true) with check (true);

create policy "auth read order_number_seq" on order_number_seq for select to authenticated using (true);
create policy "auth write order_number_seq" on order_number_seq for all to authenticated using (true) with check (true);
