-- Restore product availability status lost during Firestore->Supabase migration.
-- Run in Supabase SQL editor (project krquvafnjuoxdcvzjjtg).

ALTER TABLE parts ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'available';

-- on_the_way: 46 parts
UPDATE parts SET status = 'on_the_way' WHERE part_number IN (
  '20589452',
  '3964833',
  '20440375',
  '21170510',
  '22327063',
  '21171975',
  '21351717',
  '22372592',
  '3986315',
  'WG9100760100-4',
  '3198859',
  'WG9100760100',
  '4213650822',
  '20569224',
  '22117441',
  '22629276',
  '21911586',
  '22945731',
  '9115019202',
  '1878005493',
  '22860373',
  '1828004832',
  '20775027',
  '20701803',
  '22327072',
  '22719325',
  '22943668',
  '6684875',
  '7420774360',
  '9125129252',
  '11465C',
  '1300090100',
  '21430905',
  '21067551',
  '82355055',
  '1878054009',
  '20752918',
  '1300190100',
  '20562627',
  '20259191',
  '22902431',
  '21634021',
  '1629614',
  '20522122',
  '21116881',
  '22860391'
);

-- coming_soon: 5 parts
UPDATE parts SET status = 'coming_soon' WHERE part_number IN (
  '20260101',
  '21715161',
  '21379051',
  '21201221',
  '22821828'
);

