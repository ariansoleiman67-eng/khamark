-- ============================================================================
-- ASANKARY — starter catalog seed (run once in the Supabase SQL Editor).
-- Re-runnable: it deletes its own seed rows (part_number like 'SEED-%' / brands
-- + categories it created) then re-inserts. Delete this data later once the
-- admin adds real inventory. Images use picsum placeholders.
-- ============================================================================

-- ── clean previous seed ──────────────────────────────────────────────────
delete from public.parts      where part_number like 'SEED-%';
delete from public.brands      where name in ('Momax','Samsung','Anker','Mcdodo','Belkin','tomtoc','Havit','Realme','Apple');
delete from public.categories  where name in ('Trackers','Power Banks','Chargers','Security','Phones','Cables','Bags','Accessories','Smartwatches');

-- ── brands ───────────────────────────────────────────────────────────────
insert into public.brands (name, is_active, sort_order) values
  ('Momax',true,0), ('Samsung',true,1), ('Anker',true,2), ('Mcdodo',true,3),
  ('Belkin',true,4), ('tomtoc',true,5), ('Havit',true,6), ('Realme',true,7), ('Apple',true,8);

-- ── categories ───────────────────────────────────────────────────────────
insert into public.categories (name, is_active, sort_order) values
  ('Trackers',true,0), ('Power Banks',true,1), ('Chargers',true,2), ('Security',true,3),
  ('Phones',true,4), ('Cables',true,5), ('Bags',true,6), ('Accessories',true,7), ('Smartwatches',true,8);

-- ── products ─────────────────────────────────────────────────────────────
-- helper image: https://picsum.photos/seed/<slug>/600/600
insert into public.parts
  (name, part_number, category, price_usd, compare_at_price_usd, stock_qty, status, brand, is_featured, is_active, image_urls)
values
  ('Momax Pinpop Lite Find My Tracker','SEED-P1','Trackers',9.50,13.50,42,'available','Momax',true,true,  '["https://picsum.photos/seed/asankary-p1/600/600"]'::jsonb),
  ('Momax Q.Mag X1 Qi2 Magnetic Power Bank 10000mAh','SEED-P2','Power Banks',47.00,null,15,'available','Momax',false,true, '["https://picsum.photos/seed/asankary-p2/600/600"]'::jsonb),
  ('Momax Padlock Fingerprint Smart Lock','SEED-P3','Security',35.00,null,18,'available','Momax',false,true, '["https://picsum.photos/seed/asankary-p3/600/600"]'::jsonb),
  ('Samsung 65W Super Fast Power Adapter','SEED-P4','Chargers',32.00,45.00,60,'available','Samsung',true,true, '["https://picsum.photos/seed/asankary-p4/600/600"]'::jsonb),
  ('Samsung Smart Tag2','SEED-P5','Trackers',22.00,null,33,'available','Samsung',false,true, '["https://picsum.photos/seed/asankary-p5/600/600"]'::jsonb),
  ('Samsung 25W Travel Charger','SEED-P6','Chargers',18.00,null,40,'available','Samsung',false,true, '["https://picsum.photos/seed/asankary-p6/600/600"]'::jsonb),
  ('Samsung S26 Ultra 256GB','SEED-P7','Phones',1150.00,1399.00,12,'available','Samsung',true,true, '["https://picsum.photos/seed/asankary-p7/600/600"]'::jsonb),
  ('Anker PowerCore 20000mAh PD','SEED-P9','Power Banks',45.00,60.00,27,'available','Anker',true,true, '["https://picsum.photos/seed/asankary-p9/600/600"]'::jsonb),
  ('Anker Nano 3 30W USB-C Charger','SEED-P10','Chargers',26.00,null,40,'available','Anker',false,true, '["https://picsum.photos/seed/asankary-p10/600/600"]'::jsonb),
  ('Mcdodo 100W USB-C to USB-C Cable','SEED-P11','Cables',12.00,null,80,'available','Mcdodo',false,true, '["https://picsum.photos/seed/asankary-p11/600/600"]'::jsonb),
  ('Belkin BoostCharge Pro 3-in-1','SEED-P12','Chargers',39.00,null,15,'available','Belkin',false,true, '["https://picsum.photos/seed/asankary-p12/600/600"]'::jsonb),
  ('tomtoc Laptop Sleeve 14"','SEED-P13','Bags',34.00,44.00,22,'available','tomtoc',true,true, '["https://picsum.photos/seed/asankary-p13/600/600"]'::jsonb),
  ('Havit Wireless Keyboard & Mouse Combo','SEED-P15','Accessories',20.00,28.00,25,'available','Havit',false,true, '["https://picsum.photos/seed/asankary-p15/600/600"]'::jsonb),
  ('Realme Watch S2 Smart Watch','SEED-P17','Smartwatches',85.00,117.00,20,'available','Realme',false,true, '["https://picsum.photos/seed/asankary-p17/600/600"]'::jsonb),
  ('iPhone 17 Pro Max','SEED-P19','Phones',1199.00,1399.00,20,'available','Apple',true,true, '["https://picsum.photos/seed/asankary-p19/600/600"]'::jsonb);

-- give the iPhone colour + storage variants + a VIP price (matches the app demo)
update public.parts set
  vip_price_usd = 1049.00,
  storage_options = '[{"id":"s256","label":"256GB","priceDelta":0},{"id":"s512","label":"512GB","priceDelta":150},{"id":"s1tb","label":"1TB","priceDelta":350}]'::jsonb,
  color_variations = '[{"variationId":"c_orange","colorValue":"Cosmic Orange","colorHex":"#F5670A","stockQuantity":8},{"variationId":"c_white","colorValue":"Silver","colorHex":"#E6E7E9","stockQuantity":6},{"variationId":"c_black","colorValue":"Space Black","colorHex":"#1C1C1E","stockQuantity":4},{"variationId":"c_blue","colorValue":"Deep Blue","colorHex":"#2B4C8C","stockQuantity":2}]'::jsonb
where part_number = 'SEED-P19';

-- promo codes (matches the app's demo seeds)
delete from public.promo_codes where code in ('WELCOME10','SAVE5','VIP15');
insert into public.promo_codes (code, type, value, min_purchase, is_active, sort_order) values
  ('WELCOME10','percentage',10,null,true,0),
  ('SAVE5','fixed',5,30,true,1),
  ('VIP15','percentage',15,100,true,2);
