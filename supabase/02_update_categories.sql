-- Adds the Personal Care & Beauty and Automotive Products categories
-- and puts all categories in the same order as the Figma design.
-- Run once in Supabase: SQL Editor, New query, paste, Run.

insert into public.categories (name_en, name_km, slug) values
  ('Personal Care & Beauty', 'ថែរក្សាខ្លួន និងសម្រស់', 'personal-care-beauty'),
  ('Automotive Products', 'ផលិតផលយានយន្ត', 'automotive-products')
on conflict (slug) do nothing;

update public.categories c
   set display_order = o.position
  from (values
    ('fruits-vegetables', 1), ('dairy-eggs', 2), ('snacks', 3), ('beverages', 4),
    ('bread-bakery', 5), ('spices-seasonings', 6), ('household-essentials', 7),
    ('personal-care-beauty', 8), ('textiles-fabrics', 9), ('arts-crafts', 10),
    ('raw-materials', 11), ('industrial-goods', 12), ('automotive-products', 13)
  ) as o(slug, position)
 where c.slug = o.slug;

select display_order, name_en, slug from public.categories order by display_order;
