-- Every product now carries its price in both currencies, so buyers can
-- switch the whole site between USD and KHR and the filter still works.
-- The seller types one pair, the form fills the other, and both are saved.
-- Rate used for the first fill: National Bank of Cambodia, 4057 KHR per USD.
-- Run once in Supabase: SQL Editor, New query, paste, Run.

alter table public.products
  add column if not exists price_usd_min numeric(12, 2) check (price_usd_min >= 0),
  add column if not exists price_usd_max numeric(12, 2) check (price_usd_max >= 0),
  add column if not exists price_khr_min numeric(12, 0) check (price_khr_min >= 0),
  add column if not exists price_khr_max numeric(12, 0) check (price_khr_max >= 0);

-- Fill the new columns from the prices sellers have already entered.
update public.products set
  price_usd_min = case when currency = 'USD' then price_min else round(price_min / 4057, 2) end,
  price_usd_max = case when currency = 'USD' then price_max else round(price_max / 4057, 2) end,
  price_khr_min = case when currency = 'KHR' then price_min else round(price_min * 4057) end,
  price_khr_max = case when currency = 'KHR' then price_max else round(price_max * 4057) end
where price_usd_min is null and price_khr_min is null;

create index if not exists products_price_usd_idx on public.products(price_usd_min);
create index if not exists products_price_khr_idx on public.products(price_khr_min);

-- The card view carries both pairs so the browse page can filter and sort
-- on whichever currency the visitor has chosen.
create or replace view public.product_cards with (security_invoker = true) as
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
       coalesce(pr.review_count, 0)              as review_count,
       p.certification,
       p.price_usd_min, p.price_usd_max, p.price_khr_min, p.price_khr_max
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

select 'products now hold both USD and KHR prices' as result;
