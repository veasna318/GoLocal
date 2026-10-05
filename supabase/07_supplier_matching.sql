-- Supplier matching (FR-6.2)
-- Scores published products against one sourcing request and returns the
-- best ones. Run this once in the Supabase SQL editor.
--
-- The function is security invoker, so the ordinary row level security
-- still applies and it can never return a draft or hidden product.
-- Reasons come back as short codes, not sentences, so the website can
-- show them in English or Khmer.

begin;

create or replace function public.match_suppliers(
  p_request_id uuid,
  p_limit int default 6
)
returns table (match_score int, reasons text[], card jsonb)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with req as (
    select * from public.sourcing_requests where id = p_request_id
  ),
  -- Every published product, with the few numbers the scoring needs.
  candidate as (
    select
      pc,
      p.category_id = r.category_id and r.category_id is not null as same_category,
      -- word_similarity finds the best matching run of words rather than
      -- comparing whole strings, so a short product name still scores well
      -- inside a long request title. Both directions and both languages.
      greatest(
        word_similarity(p.name, r.title),
        word_similarity(r.title, p.name),
        word_similarity(coalesce(nullif(p.name_km, ''), p.name), r.title),
        word_similarity(r.title, coalesce(nullif(p.name_km, ''), p.name))
      ) as name_score,
      -- Only counts when the buyer actually named provinces. If any province
      -- will do, this tells the buyer nothing, so it is not a reason.
      cardinality(r.preferred_region_ids) > 0
        and p.region_id = any (r.preferred_region_ids) as in_province,
      -- Likewise, only when the buyer said how much they want.
      r.quantity_max is not null
        and (p.min_order_qty is null or p.min_order_qty <= r.quantity_max) as quantity_fits,
      -- Compare prices in whichever currency the buyer wrote the budget in.
      case when r.currency = 'KHR' then p.price_khr_min else p.price_usd_min end as price_low,
      case when r.currency = 'KHR' then p.price_khr_max else p.price_usd_max end as price_high,
      r.budget_min as budget_low,
      r.budget_max as budget_high,
      r.certification_required is not null
        and p.certification is not null as has_certification
    from req r
    join public.products p
      on p.status = 'PUBLISHED'
     and p.owner_id <> r.business_id     -- never suggest the buyer their own goods
    join public.product_cards pc on pc.id = p.id
  ),
  -- Turn the signals into one score and a list of reason codes.
  graded as (
    select
      pc,
      same_category,
      name_score,
      (case when same_category then 40 else 0 end
        + round(30 * coalesce(name_score, 0))
        + case when in_province then 15 else 0 end
        + case when quantity_fits then 10 else 0 end
        + case when budget_fits then 10 else 0 end
        + case when has_certification then 5 else 0 end)::int as score,
      array_remove(array[
        case when same_category    then 'category'      end,
        case when name_score > 0.2 then 'name'          end,
        case when in_province      then 'province'      end,
        case when quantity_fits    then 'quantity'      end,
        case when budget_fits      then 'budget'        end,
        case when has_certification then 'certification' end
      ], null) as reasons
    from (
      select
        c.*,
        -- Only when the buyer set a budget and the product shows a price.
        coalesce(c.budget_low, c.budget_high) is not null
          and coalesce(c.price_low, c.price_high) is not null
          and (c.budget_high is null or c.price_low is null or c.price_low <= c.budget_high)
          and (c.budget_low is null or c.price_high is null or c.price_high >= c.budget_low)
          as budget_fits
      from candidate c
    ) c
  )
  select score, reasons, to_jsonb(pc)
    from graded
   -- A real supplier for this request sells the right kind of thing. Being
   -- in the right province is not on its own a reason to suggest someone.
   where (same_category or name_score > 0.15)
     and score >= 10
   order by score desc, (pc).average_rating desc nulls last, (pc).review_count desc
   limit greatest(1, least(p_limit, 24));
$$;

revoke execute on function public.match_suppliers(uuid, int) from public;
grant execute on function public.match_suppliers(uuid, int) to anon, authenticated;

commit;
