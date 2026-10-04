-- GoLocal Cambodia — Supabase database setup
-- HOW TO USE
--   Supabase Dashboard -> SQL Editor -> New query -> paste this whole
--   file -> Run. Run it ONCE on a new, empty project.
--   Everything is inside one transaction: if anything fails, nothing is
--   saved, so you can fix the problem and run it again.
--
-- HOW THE WEBSITE USES IT
--   The HTML/CSS/JS website talks to Supabase directly with the public
--   "anon" key. That key is safe to put in browser code because every
--   table below has Row Level Security (RLS) rules deciding who can read
--   or change each row. NEVER put the "service_role" key in the website.
--
-- ACCOUNT TYPES
--   BUYER    - browses, reviews, reports. Every new account starts here.
--   PRODUCER - lists products. Needs an approved verification application.
--   BUSINESS - factories/retailers. Lists products and posts sourcing
--              requests. Needs an approved verification application.
--   ADMIN    - reviews applications, reports, boosts. Set by hand in SQL.

begin;

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- 1. Fixed lists of allowed values
create type public.account_role        as enum ('BUYER', 'PRODUCER', 'BUSINESS', 'ADMIN');
create type public.verification_status as enum ('NOT_APPLIED', 'PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED');
create type public.application_status  as enum ('PENDING', 'NEEDS_MORE_INFO', 'APPROVED', 'REJECTED');
create type public.evidence_type       as enum ('NATIONAL_ID', 'FARM_OR_WORKSHOP', 'PRODUCTION_PROCESS', 'BUSINESS_REGISTRATION', 'OTHER');
create type public.listing_status      as enum ('DRAFT', 'PUBLISHED', 'HIDDEN', 'ARCHIVED');
create type public.stock_status        as enum ('IN_STOCK', 'LIMITED', 'OUT_OF_STOCK', 'PRE_ORDER');
create type public.request_status      as enum ('OPEN', 'CLOSED', 'HIDDEN');
create type public.request_urgency     as enum ('NORMAL', 'URGENT');
create type public.contract_type       as enum ('ONE_TIME', 'LONG_TERM');
create type public.boost_status        as enum ('PENDING', 'APPROVED', 'REJECTED');
create type public.report_target       as enum ('PRODUCT', 'REVIEW', 'SOURCING_REQUEST', 'PROFILE');
create type public.report_status       as enum ('OPEN', 'RESOLVED', 'DISMISSED');

-- 2. Reference data: provinces and categories
create table public.regions (
  id         uuid primary key default gen_random_uuid(),
  name_en    text not null unique,
  name_km    text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.regions (name_en, name_km) values
  ('Banteay Meanchey', 'បន្ទាយមានជ័យ'), ('Battambang', 'បាត់ដំបង'),
  ('Kampong Cham', 'កំពង់ចាម'),         ('Kampong Chhnang', 'កំពង់ឆ្នាំង'),
  ('Kampong Speu', 'កំពង់ស្ពឺ'),        ('Kampong Thom', 'កំពង់ធំ'),
  ('Kampot', 'កំពត'),                  ('Kandal', 'កណ្ដាល'),
  ('Kep', 'កែប'),                      ('Koh Kong', 'កោះកុង'),
  ('Kratie', 'ក្រចេះ'),                 ('Mondulkiri', 'មណ្ឌលគិរី'),
  ('Oddar Meanchey', 'ឧត្តរមានជ័យ'),    ('Pailin', 'ប៉ៃលិន'),
  ('Phnom Penh', 'ភ្នំពេញ'),            ('Preah Vihear', 'ព្រះវិហារ'),
  ('Prey Veng', 'ព្រៃវែង'),             ('Pursat', 'ពោធិ៍សាត់'),
  ('Preah Sihanouk', 'ព្រះសីហនុ'),       ('Ratanakiri', 'រតនគិរី'),
  ('Siem Reap', 'សៀមរាប'),              ('Stung Treng', 'ស្ទឹងត្រែង'),
  ('Svay Rieng', 'ស្វាយរៀង'),           ('Takeo', 'តាកែវ'),
  ('Tboung Khmum', 'ត្បូងឃ្មុំ');

create table public.categories (
  id            uuid primary key default gen_random_uuid(),
  name_en       text not null unique,
  name_km       text,
  slug          text not null unique check (slug ~ '^[a-z0-9-]+$'),
  icon_path     text,
  display_order integer not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

-- Matches the category row in the Figma home page. Edit freely later in Table Editor.
insert into public.categories (name_en, name_km, slug, display_order) values
  ('Fruits & Vegetables',  'ផ្លែឈើ និងបន្លែ',        'fruits-vegetables',    1),
  ('Dairy & Eggs',         'ទឹកដោះគោ និងស៊ុត',       'dairy-eggs',           2),
  ('Snacks',               'អាហារសម្រន់',            'snacks',               3),
  ('Beverages',            'ភេសជ្ជៈ',                'beverages',            4),
  ('Bread & Bakery',       'នំប៉័ង និងនំ',            'bread-bakery',         5),
  ('Spices & Seasonings',  'គ្រឿងទេស',               'spices-seasonings',    6),
  ('Household Essentials', 'សម្ភារៈប្រើប្រាស់ក្នុងផ្ទះ', 'household-essentials', 7),
  ('Textiles & Fabrics',   'វាយនភណ្ឌ',               'textiles-fabrics',     8),
  ('Arts & Crafts',        'សិប្បកម្ម',               'arts-crafts',          9),
  ('Raw Materials',        'វត្ថុធាតុដើម',            'raw-materials',        10),
  ('Industrial Goods',     'ទំនិញឧស្សាហកម្ម',         'industrial-goods',     11);

-- 3. Profiles (one per account, created automatically at sign-up)
--    Everything in this table is PUBLIC. Never store ID numbers here.
create table public.profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  display_name        text not null check (char_length(display_name) between 1 and 100),
  signup_type         public.account_role not null default 'BUYER'
                      check (signup_type in ('BUYER', 'PRODUCER', 'BUSINESS')),
  platform_role       public.account_role not null default 'BUYER',
  verification_status public.verification_status not null default 'NOT_APPLIED',
  business_name       text check (char_length(business_name) <= 150),
  avatar_path         text,
  cover_path          text,
  bio                 text check (char_length(bio) <= 1500),
  farm_story          text check (char_length(farm_story) <= 5000),
  established_year    smallint check (established_year between 1900 and 2100),
  production_capacity text check (char_length(production_capacity) <= 200),
  region_id           uuid references public.regions(id) on delete set null,
  contact_phone       text check (char_length(contact_phone) <= 30),
  contact_telegram    text check (char_length(contact_telegram) <= 100),
  contact_facebook    text check (char_length(contact_facebook) <= 200),
  contact_email       text check (char_length(contact_email) <= 255),
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Farm / workshop photo gallery shown on a producer's profile page.
create table public.seller_photos (
  id            uuid primary key default gen_random_uuid(),
  seller_id     uuid not null references public.profiles(id) on delete cascade,
  storage_path  text not null unique,
  caption       text check (char_length(caption) <= 200),
  display_order smallint not null default 0,
  created_at    timestamptz not null default now()
);
create index seller_photos_seller_idx on public.seller_photos(seller_id, display_order);

-- 4. Verification applications (PRIVATE: applicant + admins only)
create table public.verification_applications (
  id                    uuid primary key default gen_random_uuid(),
  applicant_id          uuid not null references public.profiles(id) on delete cascade,
  requested_role        public.account_role not null check (requested_role in ('PRODUCER', 'BUSINESS')),
  legal_name            text not null check (char_length(legal_name) between 2 and 150),
  business_or_farm_name text not null check (char_length(business_or_farm_name) between 2 and 150),
  phone_number          text not null check (char_length(phone_number) between 6 and 30),
  region_id             uuid not null references public.regions(id),
  address_summary       text not null check (char_length(address_summary) between 5 and 800),
  about_business        text not null check (char_length(about_business) between 20 and 5000),
  status                public.application_status not null default 'PENDING',
  admin_note            text check (char_length(admin_note) <= 2000),
  reviewed_by           uuid references public.profiles(id) on delete set null,
  reviewed_at           timestamptz,
  submitted_at          timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
-- Only one open application per person at a time.
create unique index verification_one_open_idx
  on public.verification_applications(applicant_id)
  where status in ('PENDING', 'NEEDS_MORE_INFO');
create index verification_queue_idx on public.verification_applications(status, submitted_at);

-- File records only. The actual images live in the private
-- "verification-evidence" storage bucket under <user id>/...
create table public.verification_evidence (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.verification_applications(id) on delete cascade,
  evidence_type  public.evidence_type not null,
  storage_path   text not null unique,
  created_at     timestamptz not null default now()
);

-- 5. Products
create table public.products (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references public.profiles(id) on delete cascade,
  category_id       uuid not null references public.categories(id),
  region_id         uuid not null references public.regions(id),
  name              text not null check (char_length(name) between 2 and 160),
  name_km           text check (char_length(name_km) <= 160),
  description       text not null check (char_length(description) between 10 and 5000),
  price_min         numeric(12,2) check (price_min >= 0),
  price_max         numeric(12,2) check (price_max >= 0),
  currency          text not null default 'USD' check (currency in ('USD', 'KHR')),
  unit              text not null default 'kg' check (char_length(unit) between 1 and 30),
  min_order_qty     numeric(12,2) check (min_order_qty > 0),
  packaging         text check (char_length(packaging) <= 200),
  certification     text check (char_length(certification) <= 200),
  production_period text check (char_length(production_period) <= 100),
  stock_status      public.stock_status not null default 'IN_STOCK',
  tags              text[] not null default '{}' check (cardinality(tags) <= 12),
  status            public.listing_status not null default 'DRAFT',
  moderation_note   text check (char_length(moderation_note) <= 2000),
  boosted_until     timestamptz,           -- set only by admin approving a boost
  published_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (price_min is null or price_max is null or price_max >= price_min)
);
create index products_feed_idx     on public.products(status, category_id, region_id, published_at desc);
create index products_owner_idx    on public.products(owner_id, created_at desc);
create index products_boost_idx    on public.products(boosted_until desc) where boosted_until is not null;
create index products_name_trgm    on public.products using gin (name gin_trgm_ops);
create index products_name_km_trgm on public.products using gin (name_km gin_trgm_ops);

create table public.product_images (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references public.products(id) on delete cascade,
  storage_path  text not null unique,
  display_order smallint not null default 0 check (display_order between 0 and 20),
  is_cover      boolean not null default false,
  created_at    timestamptz not null default now()
);
create unique index product_images_one_cover on public.product_images(product_id) where is_cover;
create index product_images_product_idx on public.product_images(product_id, display_order);

-- 6. Reviews (one per account per product; seller rating is the
--    average of reviews on all of that seller's products)
create table public.product_reviews (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  rating      smallint not null check (rating between 1 and 5),
  review_text text check (char_length(review_text) <= 1500),
  is_hidden   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (product_id, reviewer_id)
);
create index product_reviews_product_idx on public.product_reviews(product_id, created_at desc);

-- 7. B2B sourcing requests (posted by verified BUSINESS accounts).
--    Producers reply using the contact buttons (phone/Telegram/etc.).
create table public.sourcing_requests (
  id                     uuid primary key default gen_random_uuid(),
  business_id            uuid not null references public.profiles(id) on delete cascade,
  category_id            uuid references public.categories(id) on delete set null,
  title                  text not null check (char_length(title) between 5 and 160),
  description            text not null check (char_length(description) between 10 and 5000),
  quantity_min           numeric(14,2) check (quantity_min > 0),
  quantity_max           numeric(14,2) check (quantity_max > 0),
  quantity_unit          text not null default 'kg' check (char_length(quantity_unit) between 1 and 30),
  budget_min             numeric(14,2) check (budget_min >= 0),
  budget_max             numeric(14,2) check (budget_max >= 0),
  currency               text not null default 'USD' check (currency in ('USD', 'KHR')),
  packaging              text check (char_length(packaging) <= 200),
  certification_required text check (char_length(certification_required) <= 200),
  quality_requirements   text check (char_length(quality_requirements) <= 2000),
  contract_type          public.contract_type not null default 'ONE_TIME',
  urgency                public.request_urgency not null default 'NORMAL',
  preferred_region_ids   uuid[] not null default '{}',   -- empty = any province
  image_paths            text[] not null default '{}' check (cardinality(image_paths) <= 5),
  deadline               date,
  status                 public.request_status not null default 'OPEN',
  moderation_note        text check (char_length(moderation_note) <= 2000),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  check (quantity_min is null or quantity_max is null or quantity_max >= quantity_min),
  check (budget_min is null or budget_max is null or budget_max >= budget_min)
);
create index sourcing_requests_feed_idx  on public.sourcing_requests(status, category_id, created_at desc);
create index sourcing_requests_owner_idx on public.sourcing_requests(business_id, created_at desc);

-- 8. Product boosting (paid visibility, paid by bank QR, checked by admin)
create table public.product_boosts (
  id                 uuid primary key default gen_random_uuid(),
  product_id         uuid not null references public.products(id) on delete cascade,
  seller_id          uuid not null references public.profiles(id) on delete cascade,
  duration_days      smallint not null check (duration_days in (7, 14, 30)),
  amount_usd         numeric(8,2) not null check (amount_usd >= 0),
  payment_proof_path text not null,   -- screenshot in private "payment-proofs" bucket
  status             public.boost_status not null default 'PENDING',
  admin_note         text check (char_length(admin_note) <= 1000),
  starts_at          timestamptz,
  ends_at            timestamptz,
  reviewed_by        uuid references public.profiles(id) on delete set null,
  reviewed_at        timestamptz,
  created_at         timestamptz not null default now()
);
create index product_boosts_queue_idx on public.product_boosts(status, created_at);

-- 9. Reports / flags (community flagging, then admin review)
create table public.content_reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid not null references public.profiles(id) on delete cascade,
  target_type  public.report_target not null,
  target_id    uuid not null,
  reason       text not null check (char_length(reason) between 3 and 1000),
  status       public.report_status not null default 'OPEN',
  admin_note   text check (char_length(admin_note) <= 1000),
  resolved_by  uuid references public.profiles(id) on delete set null,
  resolved_at  timestamptz,
  created_at   timestamptz not null default now(),
  unique (reporter_id, target_type, target_id)   -- one report per person per item
);
create index content_reports_queue_idx on public.content_reports(status, created_at);

-- 10. Helper functions used by the security rules
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and platform_role = 'ADMIN' and is_active
  );
$$;

-- True when the signed-in user is an active, verified account of one of the given roles.
create or replace function public.is_verified_as(variadic roles public.account_role[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and platform_role = any(roles)
      and verification_status = 'VERIFIED'
      and is_active
  );
$$;

-- True when a database change comes from an ordinary website visitor (not
-- the SQL editor, not an admin, and not one of the trusted automatic
-- actions below, which switch on the "golocal.trusted" flag while they run).
-- Used by the protection triggers.
create or replace function public.is_website_user()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '')
           in ('anon', 'authenticated')
     and coalesce(current_setting('golocal.trusted', true), '') <> 'on'
     and not public.is_admin();
$$;

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated        before update on public.profiles                  for each row execute function public.set_updated_at();
create trigger applications_updated    before update on public.verification_applications for each row execute function public.set_updated_at();
create trigger products_updated        before update on public.products                  for each row execute function public.set_updated_at();
create trigger reviews_updated         before update on public.product_reviews           for each row execute function public.set_updated_at();
create trigger sourcing_updated        before update on public.sourcing_requests         for each row execute function public.set_updated_at();

-- 11. Automatic behaviour (triggers)

-- 11a. Create a profile when someone signs up. The sign-up form sends
--      display_name and signup_type ('BUYER' | 'PRODUCER' | 'BUSINESS')
--      in options.data. Everyone starts as a BUYER until verified.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_name text := left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), 'New member'), 100);
  v_type text := upper(coalesce(new.raw_user_meta_data ->> 'signup_type', 'BUYER'));
begin
  if v_type not in ('BUYER', 'PRODUCER', 'BUSINESS') then
    v_type := 'BUYER';
  end if;
  insert into public.profiles (id, display_name, signup_type, contact_email)
  values (new.id, v_name, v_type::public.account_role, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 11b. Users can edit their own profile, but can never change their own
--      role, verification status or active flag. Only admins can.
create or replace function public.protect_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if public.is_website_user() then
    new.id                  := old.id;
    new.platform_role       := old.platform_role;
    new.verification_status := old.verification_status;
    new.is_active           := old.is_active;
    new.created_at          := old.created_at;
  end if;
  return new;
end;
$$;
create trigger profiles_protect before update on public.profiles
  for each row execute function public.protect_profile();

-- 11c. Submitting an application marks the profile as PENDING (unless the
--      person is already verified). Applicants can only fix and resubmit;
--      they can never approve themselves.
create or replace function public.on_application_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('golocal.trusted', 'on', true);
  update public.profiles
     set verification_status = 'PENDING'
   where id = new.applicant_id
     and verification_status <> 'VERIFIED';
  perform set_config('golocal.trusted', 'off', true);
  return new;
end;
$$;
create trigger applications_after_insert after insert on public.verification_applications
  for each row execute function public.on_application_insert();

create or replace function public.protect_application()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if public.is_website_user() then
    if tg_op = 'INSERT' then
      new.status      := 'PENDING';
      new.admin_note  := null;
      new.reviewed_by := null;
      new.reviewed_at := null;
    else
      new.applicant_id := old.applicant_id;
      new.admin_note   := old.admin_note;
      new.reviewed_by  := old.reviewed_by;
      new.reviewed_at  := old.reviewed_at;
      new.submitted_at := old.submitted_at;
      -- Editing an application that needed more info sends it back to the queue.
      new.status := 'PENDING';
    end if;
  end if;
  return new;
end;
$$;
create trigger applications_protect before insert or update on public.verification_applications
  for each row execute function public.protect_application();

-- 11d. Products: sellers cannot publish a product an admin has hidden,
--      cannot hide/unhide, and cannot give themselves a boost.
create or replace function public.protect_product()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if public.is_website_user() then
    if tg_op = 'INSERT' then
      new.boosted_until   := null;
      new.moderation_note := null;
      if new.status not in ('DRAFT', 'PUBLISHED') then
        new.status := 'DRAFT';
      end if;
    else
      new.owner_id        := old.owner_id;
      new.boosted_until   := old.boosted_until;
      new.moderation_note := old.moderation_note;
      new.created_at      := old.created_at;
      if old.status = 'HIDDEN' or new.status = 'HIDDEN' then
        new.status := old.status;
      end if;
    end if;
  end if;

  if new.status = 'PUBLISHED' and (tg_op = 'INSERT' or old.status <> 'PUBLISHED') then
    new.published_at := now();
  end if;
  return new;
end;
$$;
create trigger products_protect before insert or update on public.products
  for each row execute function public.protect_product();

-- 11e. Reviews: reviewers cannot un-hide a review an admin hid.
create or replace function public.protect_review()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if public.is_website_user() then
    if tg_op = 'INSERT' then
      new.is_hidden := false;
    else
      new.is_hidden   := old.is_hidden;
      new.product_id  := old.product_id;
      new.reviewer_id := old.reviewer_id;
      new.created_at  := old.created_at;
    end if;
  end if;
  return new;
end;
$$;
create trigger reviews_protect before insert or update on public.product_reviews
  for each row execute function public.protect_review();

-- 11f. Sourcing requests: the business cannot un-hide a hidden request.
create or replace function public.protect_sourcing_request()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if public.is_website_user() then
    if tg_op = 'INSERT' then
      new.moderation_note := null;
      if new.status = 'HIDDEN' then new.status := 'OPEN'; end if;
    else
      new.business_id     := old.business_id;
      new.moderation_note := old.moderation_note;
      new.created_at      := old.created_at;
      if old.status = 'HIDDEN' or new.status = 'HIDDEN' then
        new.status := old.status;
      end if;
    end if;
  end if;
  return new;
end;
$$;
create trigger sourcing_protect before insert or update on public.sourcing_requests
  for each row execute function public.protect_sourcing_request();

-- 11g. Boost requests always start as PENDING when a seller sends them.
create or replace function public.protect_boost()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if public.is_website_user() then
    new.status      := 'PENDING';
    new.starts_at   := null;
    new.ends_at     := null;
    new.admin_note  := null;
    new.reviewed_by := null;
    new.reviewed_at := null;
  end if;
  return new;
end;
$$;
create trigger boosts_protect before insert on public.product_boosts
  for each row execute function public.protect_boost();

-- 11h. Reports always start OPEN. A review with 3 or more open reports is
--      hidden automatically until an admin looks at it.
create or replace function public.protect_report()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if public.is_website_user() then
    new.status      := 'OPEN';
    new.admin_note  := null;
    new.resolved_by := null;
    new.resolved_at := null;
  end if;
  return new;
end;
$$;
create trigger reports_protect before insert on public.content_reports
  for each row execute function public.protect_report();

create or replace function public.auto_hide_reported_review()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.target_type = 'REVIEW' and (
       select count(*) from public.content_reports
        where target_type = 'REVIEW' and target_id = new.target_id and status = 'OPEN'
     ) >= 3 then
    perform set_config('golocal.trusted', 'on', true);
    update public.product_reviews set is_hidden = true where id = new.target_id;
    perform set_config('golocal.trusted', 'off', true);
  end if;
  return new;
end;
$$;
create trigger reports_auto_hide after insert on public.content_reports
  for each row execute function public.auto_hide_reported_review();

-- 12. Admin actions (called from the admin panel with supabase.rpc(...))

-- Approve / reject / ask for more info on a verification application.
create or replace function public.review_application(
  p_application_id uuid,
  p_decision public.application_status,
  p_note text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_app public.verification_applications;
begin
  if not public.is_admin() then
    raise exception 'Only admins can review applications';
  end if;
  if p_decision not in ('APPROVED', 'REJECTED', 'NEEDS_MORE_INFO') then
    raise exception 'Decision must be APPROVED, REJECTED or NEEDS_MORE_INFO';
  end if;

  select * into v_app from public.verification_applications where id = p_application_id for update;
  if not found then
    raise exception 'Application not found';
  end if;

  update public.verification_applications
     set status = p_decision, admin_note = p_note,
         reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_application_id;

  if p_decision = 'APPROVED' then
    update public.profiles
       set platform_role       = v_app.requested_role,
           verification_status = 'VERIFIED',
           business_name       = coalesce(business_name, v_app.business_or_farm_name),
           region_id           = coalesce(region_id, v_app.region_id),
           contact_phone       = coalesce(contact_phone, v_app.phone_number)
     where id = v_app.applicant_id;
  elsif p_decision = 'REJECTED' then
    update public.profiles
       set verification_status = 'REJECTED'
     where id = v_app.applicant_id and verification_status <> 'VERIFIED';
  end if;
end;
$$;

-- Approve or reject a boost payment. Approving starts the boost now.
create or replace function public.review_boost(
  p_boost_id uuid,
  p_approve boolean,
  p_note text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_boost public.product_boosts;
  v_start timestamptz;
begin
  if not public.is_admin() then
    raise exception 'Only admins can review boosts';
  end if;

  select * into v_boost from public.product_boosts where id = p_boost_id for update;
  if not found or v_boost.status <> 'PENDING' then
    raise exception 'Boost not found or already reviewed';
  end if;

  if p_approve then
    -- If the product is already boosted, the new boost starts when the old one ends.
    select greatest(now(), coalesce(boosted_until, now())) into v_start
      from public.products where id = v_boost.product_id;

    update public.product_boosts
       set status = 'APPROVED', admin_note = p_note, reviewed_by = auth.uid(), reviewed_at = now(),
           starts_at = v_start, ends_at = v_start + make_interval(days => v_boost.duration_days)
     where id = p_boost_id;

    update public.products
       set boosted_until = v_start + make_interval(days => v_boost.duration_days)
     where id = v_boost.product_id;
  else
    update public.product_boosts
       set status = 'REJECTED', admin_note = p_note, reviewed_by = auth.uid(), reviewed_at = now()
     where id = p_boost_id;
  end if;
end;
$$;

-- Suspend or restore a seller. Suspended sellers' products disappear from the site.
create or replace function public.set_account_active(p_user_id uuid, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can suspend accounts';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Admins cannot suspend themselves';
  end if;
  update public.profiles
     set is_active = p_active,
         verification_status = case
           when not p_active and verification_status = 'VERIFIED' then 'SUSPENDED'::public.verification_status
           when p_active and verification_status = 'SUSPENDED' then 'VERIFIED'::public.verification_status
           else verification_status end
   where id = p_user_id;
end;
$$;

-- 13. Read-only views for the website (respect the security rules)
create view public.product_rating_summary with (security_invoker = true) as
select product_id,
       round(avg(rating)::numeric, 1) as average_rating,
       count(*)::integer               as review_count
  from public.product_reviews
 where not is_hidden
 group by product_id;

create view public.seller_rating_summary with (security_invoker = true) as
select p.owner_id                        as seller_id,
       round(avg(r.rating)::numeric, 1)  as average_rating,
       count(*)::integer                 as review_count
  from public.product_reviews r
  join public.products p on p.id = r.product_id
 where not r.is_hidden
 group by p.owner_id;

-- One row per visible product with everything a product card needs.
-- Boosted products come first; use: .from('product_cards').select('*')
create view public.product_cards with (security_invoker = true) as
select p.id, p.name, p.name_km, p.price_min, p.price_max, p.currency, p.unit,
       p.min_order_qty, p.stock_status, p.status, p.published_at,
       p.category_id, c.name_en as category_name, c.name_km as category_name_km, c.slug as category_slug,
       p.region_id,   r.name_en as region_name,   r.name_km as region_name_km,
       p.owner_id     as seller_id,
       coalesce(s.business_name, s.display_name) as seller_name,
       s.avatar_path  as seller_avatar_path,
       (s.verification_status = 'VERIFIED')      as seller_verified,
       (p.boosted_until is not null and p.boosted_until > now()) as is_boosted,
       img.storage_path as cover_image_path,
       coalesce(pr.average_rating, 0)            as average_rating,
       coalesce(pr.review_count, 0)              as review_count
  from public.products p
  join public.categories c on c.id = p.category_id
  join public.regions    r on r.id = p.region_id
  join public.profiles   s on s.id = p.owner_id
  left join lateral (
       select i.storage_path from public.product_images i
        where i.product_id = p.id
        order by i.is_cover desc, i.display_order, i.created_at
        limit 1) img on true
  left join public.product_rating_summary pr on pr.product_id = p.id;

-- 14. Row Level Security: who can read and change what
alter table public.regions                   enable row level security;
alter table public.categories                enable row level security;
alter table public.profiles                  enable row level security;
alter table public.seller_photos             enable row level security;
alter table public.verification_applications enable row level security;
alter table public.verification_evidence     enable row level security;
alter table public.products                  enable row level security;
alter table public.product_images            enable row level security;
alter table public.product_reviews           enable row level security;
alter table public.sourcing_requests         enable row level security;
alter table public.product_boosts            enable row level security;
alter table public.content_reports           enable row level security;

-- Regions & categories: everyone reads, admins edit.
create policy "Anyone can read regions"    on public.regions    for select using (true);
create policy "Admins manage regions"      on public.regions    for all using (public.is_admin()) with check (public.is_admin());
create policy "Anyone can read categories" on public.categories for select using (true);
create policy "Admins manage categories"   on public.categories for all using (public.is_admin()) with check (public.is_admin());

-- Profiles: public pages. Owners edit their own; admins edit anyone.
create policy "Anyone can read active profiles" on public.profiles for select
  using (is_active or id = auth.uid() or public.is_admin());
create policy "Users update their own profile" on public.profiles for update
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- Seller photo gallery.
create policy "Anyone can read seller photos" on public.seller_photos for select using (true);
create policy "Verified sellers add their photos" on public.seller_photos for insert
  with check (seller_id = auth.uid() and public.is_verified_as('PRODUCER', 'BUSINESS'));
create policy "Sellers remove their photos" on public.seller_photos for delete
  using (seller_id = auth.uid() or public.is_admin());

-- Verification applications: private to the applicant and admins.
create policy "Applicants and admins read applications" on public.verification_applications for select
  using (applicant_id = auth.uid() or public.is_admin());
create policy "Signed-in users apply" on public.verification_applications for insert
  with check (applicant_id = auth.uid());
create policy "Applicants fix pending applications" on public.verification_applications for update
  using (applicant_id = auth.uid() and status in ('PENDING', 'NEEDS_MORE_INFO'))
  with check (applicant_id = auth.uid());

create policy "Applicants and admins read evidence" on public.verification_evidence for select
  using (public.is_admin() or exists (
    select 1 from public.verification_applications a
     where a.id = application_id and a.applicant_id = auth.uid()));
create policy "Applicants attach evidence" on public.verification_evidence for insert
  with check (exists (
    select 1 from public.verification_applications a
     where a.id = application_id and a.applicant_id = auth.uid()
       and a.status in ('PENDING', 'NEEDS_MORE_INFO')));
create policy "Applicants remove evidence while pending" on public.verification_evidence for delete
  using (exists (
    select 1 from public.verification_applications a
     where a.id = application_id and a.applicant_id = auth.uid()
       and a.status in ('PENDING', 'NEEDS_MORE_INFO')));

-- Products: the public sees published products of active sellers.
create policy "Read published products" on public.products for select
  using (
    (status = 'PUBLISHED' and exists (select 1 from public.profiles s where s.id = owner_id and s.is_active))
    or owner_id = auth.uid()
    or public.is_admin());
create policy "Verified sellers create products" on public.products for insert
  with check (owner_id = auth.uid() and public.is_verified_as('PRODUCER', 'BUSINESS'));
create policy "Sellers edit their products" on public.products for update
  using ((owner_id = auth.uid() and public.is_verified_as('PRODUCER', 'BUSINESS')) or public.is_admin())
  with check ((owner_id = auth.uid() and public.is_verified_as('PRODUCER', 'BUSINESS')) or public.is_admin());
create policy "Sellers delete their products" on public.products for delete
  using (owner_id = auth.uid() or public.is_admin());

create policy "Read images of visible products" on public.product_images for select
  using (exists (select 1 from public.products p where p.id = product_id));
create policy "Sellers add images to their products" on public.product_images for insert
  with check (exists (select 1 from public.products p where p.id = product_id and p.owner_id = auth.uid())
              and public.is_verified_as('PRODUCER', 'BUSINESS'));
create policy "Sellers edit images of their products" on public.product_images for update
  using (exists (select 1 from public.products p where p.id = product_id and p.owner_id = auth.uid()));
create policy "Sellers delete images of their products" on public.product_images for delete
  using (exists (select 1 from public.products p where p.id = product_id and (p.owner_id = auth.uid() or public.is_admin())));

-- Reviews: anyone reads visible reviews; signed-in users review products
-- that are published and not their own; admins can hide.
create policy "Read visible reviews" on public.product_reviews for select
  using (not is_hidden or reviewer_id = auth.uid() or public.is_admin());
create policy "Signed-in users write reviews" on public.product_reviews for insert
  with check (
    reviewer_id = auth.uid()
    and exists (select 1 from public.products p
                 where p.id = product_id and p.status = 'PUBLISHED' and p.owner_id <> auth.uid()));
create policy "Reviewers edit their reviews" on public.product_reviews for update
  using (reviewer_id = auth.uid() or public.is_admin())
  with check (reviewer_id = auth.uid() or public.is_admin());
create policy "Reviewers delete their reviews" on public.product_reviews for delete
  using (reviewer_id = auth.uid() or public.is_admin());

-- Sourcing requests: open requests are public; verified businesses post.
create policy "Read open sourcing requests" on public.sourcing_requests for select
  using (
    (status = 'OPEN' and exists (select 1 from public.profiles s where s.id = business_id and s.is_active))
    or business_id = auth.uid()
    or public.is_admin());
create policy "Verified businesses post requests" on public.sourcing_requests for insert
  with check (business_id = auth.uid() and public.is_verified_as('BUSINESS'));
create policy "Businesses edit their requests" on public.sourcing_requests for update
  using ((business_id = auth.uid() and public.is_verified_as('BUSINESS')) or public.is_admin())
  with check ((business_id = auth.uid() and public.is_verified_as('BUSINESS')) or public.is_admin());
create policy "Businesses delete their requests" on public.sourcing_requests for delete
  using (business_id = auth.uid() or public.is_admin());

-- Boosts: sellers request boosts for their own published products; admins
-- approve through review_boost().
create policy "Sellers and admins read boosts" on public.product_boosts for select
  using (seller_id = auth.uid() or public.is_admin());
create policy "Sellers request boosts" on public.product_boosts for insert
  with check (
    seller_id = auth.uid()
    and public.is_verified_as('PRODUCER', 'BUSINESS')
    and exists (select 1 from public.products p
                 where p.id = product_id and p.owner_id = auth.uid() and p.status = 'PUBLISHED'));

-- Reports: any signed-in user can report; admins read and resolve.
create policy "Reporters and admins read reports" on public.content_reports for select
  using (reporter_id = auth.uid() or public.is_admin());
create policy "Signed-in users report content" on public.content_reports for insert
  with check (reporter_id = auth.uid());
create policy "Admins resolve reports" on public.content_reports for update
  using (public.is_admin()) with check (public.is_admin());

-- Table permissions (RLS above still decides which rows).
grant usage on schema public to anon, authenticated;
grant select on public.regions, public.categories, public.profiles, public.seller_photos,
                public.products, public.product_images, public.product_reviews,
                public.sourcing_requests, public.product_rating_summary,
                public.seller_rating_summary, public.product_cards
  to anon, authenticated;
grant insert, update, delete on public.regions, public.categories, public.seller_photos,
                public.products, public.product_images, public.product_reviews,
                public.sourcing_requests, public.verification_evidence
  to authenticated;
grant update on public.profiles to authenticated;
grant select, insert, update on public.verification_applications to authenticated;
grant select on public.verification_evidence to authenticated;
grant select, insert on public.product_boosts to authenticated;
grant select, insert, update on public.content_reports to authenticated;

revoke execute on function public.review_application(uuid, public.application_status, text) from public, anon;
revoke execute on function public.review_boost(uuid, boolean, text) from public, anon;
revoke execute on function public.set_account_active(uuid, boolean) from public, anon;
grant  execute on function public.review_application(uuid, public.application_status, text) to authenticated;
grant  execute on function public.review_boost(uuid, boolean, text) to authenticated;
grant  execute on function public.set_account_active(uuid, boolean) to authenticated;

-- 15. File storage buckets and rules
--     Every file path must start with the uploader's user id, e.g.
--     "<user id>/products/<product id>/photo1.jpg"
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('public-images',         'public-images',         true,  5242880,  array['image/jpeg', 'image/png', 'image/webp']),
  ('verification-evidence', 'verification-evidence', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('payment-proofs',        'payment-proofs',        false, 5242880,  array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- public-images: product photos, avatars, farm photos, request photos.
create policy "Anyone can view public images" on storage.objects for select
  using (bucket_id = 'public-images');
create policy "Users upload to their own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'public-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Users replace their own images" on storage.objects for update to authenticated
  using (bucket_id = 'public-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Users delete their own images" on storage.objects for delete to authenticated
  using (bucket_id = 'public-images' and (storage.foldername(name))[1] = auth.uid()::text);

-- verification-evidence and payment-proofs: private. Owner uploads and
-- views their own files; admins view everything (via signed URLs).
create policy "Owners upload private files" on storage.objects for insert to authenticated
  with check (bucket_id in ('verification-evidence', 'payment-proofs')
              and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Owners and admins view private files" on storage.objects for select to authenticated
  using (bucket_id in ('verification-evidence', 'payment-proofs')
         and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
create policy "Owners delete private files" on storage.objects for delete to authenticated
  using (bucket_id in ('verification-evidence', 'payment-proofs')
         and (storage.foldername(name))[1] = auth.uid()::text);

commit;

-- AFTER RUNNING: make yourself the admin (see the setup guide).
--   update public.profiles set platform_role = 'ADMIN', verification_status = 'VERIFIED'
--   where id = (select id from auth.users where email = 'YOUR-EMAIL@example.com');
