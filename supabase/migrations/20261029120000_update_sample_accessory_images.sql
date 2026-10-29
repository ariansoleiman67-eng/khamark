-- Migration: 20261029120000_update_sample_accessory_images.sql
-- Description: Replace unrelated landscape seed photos with verified accessory images for Momax and Samsung products.
-- Note: Review this file carefully before executing on production.
-- Preserves original references in rollback block at the bottom.

-- 1. Momax Pinpop Lite Find My Tracker (Model BR10)
-- Old image: https://picsum.photos/seed/asankary-p1/600/600
-- Source: Authorized Momax distributor (Global Iraq / Ayn Al Fahad)
UPDATE parts
SET image_urls = ARRAY['https://globaliraq.iq/cdn/shop/files/1_aecebb33-11bd-4154-ba57-11aa81aa946f.jpg?v=1779613983']
WHERE id = '14ba1f5a-b0cf-420f-8f47-9b6bb82b6780';

-- 2. Samsung 65W Super Fast Power Adapter Trio (Model EP-T6530)
-- Old image: https://picsum.photos/seed/asankary-p4/600/600
-- Source: Official Samsung Manufacturer Gallery
UPDATE parts
SET image_urls = ARRAY['https://images.samsung.com/is/image/samsung/p6pim/levant_ar/ep-t6530nbegww/gallery/levant-ar-65w-power-adapter-trio-ep-t6530-ep-t6530nbegww-532744544?$1164_776_PNG$']
WHERE id = 'c9871ff9-8e51-4da6-b115-845868d7d043';

-- 3. Samsung Smart Tag2 (Model EI-T5600)
-- Old image: https://picsum.photos/seed/asankary-p5/600/600
-- Source: Official Samsung Manufacturer Gallery
UPDATE parts
SET image_urls = ARRAY['https://images.samsung.com/is/image/samsung/p6pim/levant_ar/ei-t5600bbegww/gallery/levant-ar-galaxy-smarttag2-ei-t5600-ei-t5600bbegww-538513169?$1164_776_PNG$']
WHERE id = '60136aa2-e7a6-453b-b97a-43dfbe168d69';

-- 4. Samsung 25W Travel Charger (Model EP-TA800)
-- Old image: https://picsum.photos/seed/asankary-p6/600/600
-- Source: Official Samsung Manufacturer Gallery
UPDATE parts
SET image_urls = ARRAY['https://images.samsung.com/is/image/samsung/p6pim/levant_ar/ep-ta800xbegww/gallery/levant-ar-wall-charger-for-super-fast-charging-25w-405723-ep-ta800xbegww-525295236?$1164_776_PNG$']
WHERE id = '11a03340-af46-4fb1-8100-b261b0d18df1';

/*
-- ============================================================================
-- ROLLBACK SCRIPT (Run this if you ever need to revert to previous image URLs)
-- ============================================================================

UPDATE parts
SET image_urls = ARRAY['https://picsum.photos/seed/asankary-p1/600/600']
WHERE id = '14ba1f5a-b0cf-420f-8f47-9b6bb82b6780';

UPDATE parts
SET image_urls = ARRAY['https://picsum.photos/seed/asankary-p4/600/600']
WHERE id = 'c9871ff9-8e51-4da6-b115-845868d7d043';

UPDATE parts
SET image_urls = ARRAY['https://picsum.photos/seed/asankary-p5/600/600']
WHERE id = '60136aa2-e7a6-453b-b97a-43dfbe168d69';

UPDATE parts
SET image_urls = ARRAY['https://picsum.photos/seed/asankary-p6/600/600']
WHERE id = '11a03340-af46-4fb1-8100-b261b0d18df1';
*/

