-- Adds certification to the product card view so the browse page can filter on it.
-- Run once in Supabase: SQL Editor, New query, paste, Run.

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
       p.certification
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

select 'product_cards now includes certification' as result;
