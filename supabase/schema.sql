-- S.A Computers stock system — database schema
-- Optional: the app creates these tables by itself on first start.
-- Paste into Supabase → SQL Editor → Run if you prefer to create them by hand.

create table if not exists settings (
  key text primary key,
  value text not null
);

create table if not exists staff (
  id text primary key,
  name text not null,
  role text not null check (role in ('owner','manager','technician','counter')),
  pin_hash text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists batches (
  id text primary key,
  code text not null unique,
  supplier text not null,
  supplier_type text not null,
  date timestamptz not null,
  total_cost integer not null,
  count integer not null,
  note text
);

create table if not exists orders (
  id text primary key,
  code text not null unique,
  buyer text not null,
  created_at timestamptz not null,
  status text not null check (status in ('booked','dispatched','cancelled')),
  need jsonb not null,
  unit_price integer not null,
  dispatched_at timestamptz
);

create table if not exists machines (
  id text primary key,
  serial text not null unique,
  batch_id text not null references batches(id),
  type text not null,
  brand text not null,
  model text not null,
  cpu text not null,
  gen integer not null,
  ram integer not null,
  storage integer not null,
  storage_type text not null,
  screen real,
  condition text not null,
  grade text check (grade in ('A','B','C')),
  stage text not null check (stage in ('checking','repair','ready','booked','sold','scrap')),
  location text not null check (location in ('Shop','Godown')),
  cost integer not null default 0,
  repair_cost integer not null default 0,
  price integer not null default 0,
  sold_price integer,
  sold_to text,
  order_id text references orders(id),
  wiped boolean not null default false,
  battery integer,
  failed_checks text[],
  added_at timestamptz not null,
  updated_at timestamptz not null
);
create index if not exists machines_stage_idx on machines(stage);
create index if not exists machines_batch_idx on machines(batch_id);

create table if not exists order_items (
  order_id text not null references orders(id),
  machine_id text not null references machines(id),
  primary key (order_id, machine_id)
);

create table if not exists machine_events (
  id bigserial primary key,
  machine_id text not null references machines(id) on delete cascade,
  at timestamptz not null,
  text text not null,
  kind text not null,
  by_name text
);
create index if not exists machine_events_machine_idx on machine_events(machine_id);

create table if not exists sales (
  id text primary key,
  code text not null unique,
  machine_id text not null references machines(id),
  customer text not null,
  phone text not null,
  price integer not null,
  warranty_months integer not null,
  at timestamptz not null,
  by_name text
);

create table if not exists returns (
  id text primary key,
  code text not null unique,
  machine_id text not null references machines(id),
  source text not null check (source in ('shop','order')),
  ref_code text not null,
  customer text not null,
  reason text not null,
  refund integer not null default 0,
  at timestamptz not null,
  by_name text
);

create table if not exists activity (
  id text primary key,
  at timestamptz not null,
  text text not null,
  kind text not null,
  by_name text
);
create index if not exists activity_at_idx on activity(at desc);

create sequence if not exists batch_code_seq start 1101;
create sequence if not exists order_code_seq start 1040;
create sequence if not exists sale_code_seq start 2201;
create sequence if not exists return_code_seq start 3001;

-- The app talks to the database only from its own server, never from the browser.
-- Lock tables against Supabase's public API so the anon key can't read them.
alter table settings enable row level security;
alter table staff enable row level security;
alter table batches enable row level security;
alter table orders enable row level security;
alter table machines enable row level security;
alter table order_items enable row level security;
alter table machine_events enable row level security;
alter table sales enable row level security;
alter table returns enable row level security;
alter table activity enable row level security;
