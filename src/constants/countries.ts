export interface Country {
  code: string;
  name: string;
  nameAr: string;
  nameKu: string;
  phoneCode: string;
  phoneMask: string;
  currency: string;
  cities: City[];
}

export interface City {
  code: string;
  name: string;
  nameAr: string;
  nameKu: string;
  isCapital?: boolean;
}

export const COUNTRIES: Country[] = [
  {
    code: 'IQ',
    name: 'Iraq',
    nameAr: 'العراق',
    nameKu: 'عێراق',
    phoneCode: '+964',
    phoneMask: '+964 XXX XXX XXXX',
    currency: 'USD',
    cities: [
      // Kurdistan Region - Erbil Governorate
      { code: 'ERB', name: 'Erbil', nameAr: 'أربيل', nameKu: 'هەولێر', isCapital: true },
      { code: 'SHA', name: 'Shaqlawa', nameAr: 'شقلاوة', nameKu: 'شەقڵاوە' },
      { code: 'KOY', name: 'Koya', nameAr: 'كويا', nameKu: 'کۆیە' },
      { code: 'SOR', name: 'Soran', nameAr: 'سوران', nameKu: 'سۆران' },
      { code: 'MRG', name: 'Mergasor', nameAr: 'ميركسور', nameKu: 'مێرگەسۆر' },
      { code: 'CHO', name: 'Choman', nameAr: 'جومان', nameKu: 'چۆمان' },
      { code: 'MKH', name: 'Makhmur', nameAr: 'مخمور', nameKu: 'مەخموور' },
      { code: 'SHM', name: 'Shaqlawa Mountains', nameAr: 'صلاح الدين', nameKu: 'سەلاحەددین' },
      { code: 'PKR', name: 'Pirmam', nameAr: 'بيرمام', nameKu: 'پیرمام' },
      { code: 'BNS', name: 'Bnaslawa', nameAr: 'بنصلاوة', nameKu: 'بنەسڵاوە' },
      // Kurdistan Region - Sulaymaniyah Governorate
      { code: 'SUL', name: 'Sulaymaniyah', nameAr: 'السليمانية', nameKu: 'سلێمانی' },
      { code: 'HAL', name: 'Halabja', nameAr: 'حلبجة', nameKu: 'هەڵەبجە' },
      { code: 'RAP', name: 'Rania', nameAr: 'رانية', nameKu: 'ڕانیە' },
      { code: 'KLR', name: 'Kalar', nameAr: 'كلار', nameKu: 'کەلار' },
      { code: 'CHM', name: 'Chamchamal', nameAr: 'جمجمال', nameKu: 'چەمچەماڵ' },
      { code: 'DRB', name: 'Darbandikhan', nameAr: 'دربنديخان', nameKu: 'دەربەندیخان' },
      { code: 'PNJ', name: 'Penjwin', nameAr: 'بينجوين', nameKu: 'پێنجوین' },
      { code: 'SHR', name: 'Sharbazher', nameAr: 'شاربازير', nameKu: 'شارباژێر' },
      { code: 'DOK', name: 'Dokan', nameAr: 'دوكان', nameKu: 'دووکان' },
      { code: 'SAY', name: 'Said Sadiq', nameAr: 'سيد صادق', nameKu: 'سەیدسادق' },
      { code: 'QDR', name: 'Qaradagh', nameAr: 'قرةداغ', nameKu: 'قەڕەداغ' },
      { code: 'TQN', name: 'Taq Taq', nameAr: 'طق طق', nameKu: 'تەقتەق' },
      { code: 'MWT', name: 'Mawat', nameAr: 'ماوت', nameKu: 'ماوەت' },
      { code: 'BZN', name: 'Bazian', nameAr: 'بازيان', nameKu: 'بازیان' },
      // Kurdistan Region - Duhok Governorate
      { code: 'DOH', name: 'Dohuk', nameAr: 'دهوك', nameKu: 'دهۆک' },
      { code: 'ZAK', name: 'Zakho', nameAr: 'زاخو', nameKu: 'زاخۆ' },
      { code: 'AKR', name: 'Akre', nameAr: 'عقرة', nameKu: 'عەقرێ' },
      { code: 'AMD', name: 'Amedi', nameAr: 'العمادية', nameKu: 'ئامێدی' },
      { code: 'SML', name: 'Semel', nameAr: 'سميل', nameKu: 'سێمێل' },
      { code: 'BRD', name: 'Bardarash', nameAr: 'برداراش', nameKu: 'بەردەڕەش' },
      { code: 'MNG', name: 'Mangesh', nameAr: 'مانكيش', nameKu: 'مانگێش' },
      { code: 'SHK', name: 'Shekhan', nameAr: 'شيخان', nameKu: 'شێخان' },
      // Kirkuk Governorate
      { code: 'KIR', name: 'Kirkuk', nameAr: 'كركوك', nameKu: 'کەرکووک' },
      { code: 'HWJ', name: 'Hawija', nameAr: 'الحويجة', nameKu: 'هەویجە' },
      { code: 'DBZ', name: 'Daquq', nameAr: 'داقوق', nameKu: 'داقووق' },
      { code: 'TUZ', name: 'Tuz Khurmatu', nameAr: 'طوز خورماتو', nameKu: 'توزخورماتوو' },
      { code: 'DBS', name: 'Dibis', nameAr: 'دبس', nameKu: 'دبس' },
      { code: 'KFR', name: 'Kifri', nameAr: 'كفري', nameKu: 'کفری' },
      // Nineveh Governorate
      { code: 'MOS', name: 'Mosul', nameAr: 'الموصل', nameKu: 'موسڵ' },
      { code: 'TLF', name: 'Tal Afar', nameAr: 'تلعفر', nameKu: 'تەلعفەر' },
      { code: 'SNJ', name: 'Sinjar', nameAr: 'سنجار', nameKu: 'شنگال' },
      { code: 'TLK', name: 'Tal Kayf', nameAr: 'تلكيف', nameKu: 'تەلکێف' },
      { code: 'HMD', name: 'Hamdaniya', nameAr: 'الحمدانية', nameKu: 'حەمدانیە' },
      // Saladin Governorate
      { code: 'TIK', name: 'Tikrit', nameAr: 'تكريت', nameKu: 'تکریت' },
      { code: 'SAM', name: 'Samarra', nameAr: 'سامراء', nameKu: 'سامەڕا' },
      { code: 'BJI', name: 'Baiji', nameAr: 'بيجي', nameKu: 'بەیجی' },
      { code: 'BLD', name: 'Balad', nameAr: 'بلد', nameKu: 'بەلەد' },
      // Central & Southern Iraq
      { code: 'BGD', name: 'Baghdad', nameAr: 'بغداد', nameKu: 'بەغداد' },
      { code: 'BAS', name: 'Basra', nameAr: 'البصرة', nameKu: 'بەسرە' },
      { code: 'NAJ', name: 'Najaf', nameAr: 'النجف', nameKu: 'نەجەف' },
      { code: 'KAR', name: 'Karbala', nameAr: 'كربلاء', nameKu: 'کەربەلا' },
      { code: 'HIL', name: 'Hillah', nameAr: 'الحلة', nameKu: 'حیللە' },
      { code: 'NAS', name: 'Nasiriyah', nameAr: 'الناصرية', nameKu: 'ناسریە' },
      { code: 'KUT', name: 'Kut', nameAr: 'الكوت', nameKu: 'کووت' },
      { code: 'AMA', name: 'Amarah', nameAr: 'العمارة', nameKu: 'عەمارە' },
      { code: 'DIW', name: 'Diwaniyah', nameAr: 'الديوانية', nameKu: 'دیوانیە' },
      { code: 'SMW', name: 'Samawah', nameAr: 'السماوة', nameKu: 'سماوە' },
      { code: 'FLJ', name: 'Fallujah', nameAr: 'الفلوجة', nameKu: 'فەللوجە' },
      { code: 'RMD', name: 'Ramadi', nameAr: 'الرمادي', nameKu: 'ڕەمادی' },
      { code: 'BAQ', name: 'Baqubah', nameAr: 'بعقوبة', nameKu: 'بەعقووبە' },
    ]
  },
  {
    code: 'SY',
    name: 'Syria',
    nameAr: 'سوريا',
    nameKu: 'سووریا',
    phoneCode: '+963',
    phoneMask: '+963 XX XXX XXXX',
    currency: 'USD',
    cities: [
      // Damascus & Surroundings
      { code: 'DAM', name: 'Damascus', nameAr: 'دمشق', nameKu: 'دیمەشق', isCapital: true },
      { code: 'RDM', name: 'Rif Dimashq', nameAr: 'ريف دمشق', nameKu: 'ڕیف دیمەشق' },
      { code: 'GHO', name: 'Eastern Ghouta', nameAr: 'الغوطة الشرقية', nameKu: 'غووتای ڕۆژهەڵات' },
      // Aleppo Governorate
      { code: 'ALE', name: 'Aleppo', nameAr: 'حلب', nameKu: 'حەلەب' },
      { code: 'AFR', name: 'Afrin', nameAr: 'عفرين', nameKu: 'عەفرین' },
      { code: 'MBJ', name: 'Manbij', nameAr: 'منبج', nameKu: 'مەنبج' },
      { code: 'AZZ', name: 'Azaz', nameAr: 'أعزاز', nameKu: 'ئەعزاز' },
      { code: 'ALB', name: 'Al-Bab', nameAr: 'الباب', nameKu: 'ئەلباب' },
      { code: 'JRB', name: 'Jarabulus', nameAr: 'جرابلس', nameKu: 'جەرابلوس' },
      { code: 'KOB', name: 'Kobani', nameAr: 'عين العرب', nameKu: 'کۆبانی' },
      { code: 'TAL', name: 'Tal Rifaat', nameAr: 'تل رفعت', nameKu: 'تەل ڕفعەت' },
      // Homs & Hama
      { code: 'HOM', name: 'Homs', nameAr: 'حمص', nameKu: 'حمس' },
      { code: 'PAL', name: 'Palmyra', nameAr: 'تدمر', nameKu: 'تەدمور' },
      { code: 'HAM', name: 'Hama', nameAr: 'حماة', nameKu: 'حەما' },
      // Coastal
      { code: 'LAT', name: 'Latakia', nameAr: 'اللاذقية', nameKu: 'لازقیە' },
      { code: 'TAR', name: 'Tartus', nameAr: 'طرطوس', nameKu: 'تەرتووس' },
      { code: 'BAN', name: 'Baniyas', nameAr: 'بانياس', nameKu: 'بانیاس' },
      { code: 'JBL', name: 'Jableh', nameAr: 'جبلة', nameKu: 'جەبلە' },
      // Eastern Syria
      { code: 'DEI', name: 'Deir ez-Zor', nameAr: 'دير الزور', nameKu: 'دێرەزۆر' },
      { code: 'MAY', name: 'Mayadin', nameAr: 'الميادين', nameKu: 'مەیادین' },
      { code: 'ABK', name: 'Abu Kamal', nameAr: 'أبو كمال', nameKu: 'ئەبوو کەماڵ' },
      { code: 'RAQ', name: 'Raqqa', nameAr: 'الرقة', nameKu: 'ڕەققە' },
      { code: 'TBQ', name: 'Tabqa', nameAr: 'الطبقة', nameKu: 'تەبقە' },
      // Northeast (Rojava)
      { code: 'HAS', name: 'Al-Hasakah', nameAr: 'الحسكة', nameKu: 'حەسەکە' },
      { code: 'QAM', name: 'Qamishli', nameAr: 'القامشلي', nameKu: 'قامیشلۆ' },
      { code: 'RML', name: 'Ras al-Ain', nameAr: 'رأس العين', nameKu: 'سەرێ کانیێ' },
      { code: 'DRK', name: 'Al-Darbasiyah', nameAr: 'الدرباسية', nameKu: 'دربەسیە' },
      { code: 'AMU', name: 'Amuda', nameAr: 'عامودا', nameKu: 'ئامودا' },
      { code: 'TWR', name: 'Tal Tamer', nameAr: 'تل تمر', nameKu: 'گرێ سپی' },
      { code: 'MLK', name: 'Al-Malikiyah', nameAr: 'المالكية', nameKu: 'دێرک' },
      // Southern Syria
      { code: 'IDL', name: 'Idlib', nameAr: 'إدلب', nameKu: 'ئیدلیب' },
      { code: 'JIS', name: 'Jisr al-Shughur', nameAr: 'جسر الشغور', nameKu: 'جسر ئەششوغور' },
      { code: 'DAR', name: 'Daraa', nameAr: 'درعا', nameKu: 'دەرعا' },
      { code: 'SWE', name: 'Sweida', nameAr: 'السويداء', nameKu: 'سوێدا' },
      { code: 'QUN', name: 'Quneitra', nameAr: 'القنيطرة', nameKu: 'قونەیترا' },
    ]
  },
  {
    code: 'IR',
    name: 'Iran',
    nameAr: 'إيران',
    nameKu: 'ئێران',
    phoneCode: '+98',
    phoneMask: '+98 XX XXXX XXXX',
    currency: 'USD',
    cities: [
      // Major Cities
      { code: 'TEH', name: 'Tehran', nameAr: 'طهران', nameKu: 'تاران', isCapital: true },
      { code: 'ISF', name: 'Isfahan', nameAr: 'أصفهان', nameKu: 'ئەسفەهان' },
      { code: 'MAS', name: 'Mashhad', nameAr: 'مشهد', nameKu: 'مەشهەد' },
      { code: 'SHI', name: 'Shiraz', nameAr: 'شيراز', nameKu: 'شیراز' },
      { code: 'TAB', name: 'Tabriz', nameAr: 'تبريز', nameKu: 'تەورێز' },
      { code: 'AHV', name: 'Ahvaz', nameAr: 'الأهواز', nameKu: 'ئەهواز' },
      { code: 'RAZ', name: 'Rasht', nameAr: 'رشت', nameKu: 'ڕەشت' },
      { code: 'KER2', name: 'Kerman', nameAr: 'كرمان', nameKu: 'کرمان' },
      { code: 'QOM', name: 'Qom', nameAr: 'قم', nameKu: 'قم' },
      { code: 'YZD', name: 'Yazd', nameAr: 'يزد', nameKu: 'یەزد' },
      // Kurdistan Province
      { code: 'SAN', name: 'Sanandaj', nameAr: 'سنندج', nameKu: 'سنە' },
      { code: 'BNH', name: 'Baneh', nameAr: 'بانه', nameKu: 'بانە' },
      { code: 'MRV', name: 'Marivan', nameAr: 'مريوان', nameKu: 'مەریوان' },
      { code: 'SQZ', name: 'Saqqez', nameAr: 'سقز', nameKu: 'سەقز' },
      { code: 'QRV', name: 'Qorveh', nameAr: 'قروه', nameKu: 'قوڕوە' },
      { code: 'BJR', name: 'Bijar', nameAr: 'بيجار', nameKu: 'بیجار' },
      { code: 'KMY', name: 'Kamyaran', nameAr: 'كامياران', nameKu: 'کامیاران' },
      { code: 'DVN', name: 'Divandarreh', nameAr: 'ديواندره', nameKu: 'دیواندەرە' },
      { code: 'DHG', name: 'Dehgolan', nameAr: 'دهگلان', nameKu: 'دەگەڵان' },
      // Kermanshah Province
      { code: 'KER', name: 'Kermanshah', nameAr: 'كرمانشاه', nameKu: 'کرماشان' },
      { code: 'PVH', name: 'Paveh', nameAr: 'پاوه', nameKu: 'پاوە' },
      { code: 'JSR', name: 'Javanrud', nameAr: 'جوانرود', nameKu: 'جوانڕوود' },
      { code: 'SRP', name: 'Sarpol-e Zahab', nameAr: 'سربل ذهاب', nameKu: 'سەرپۆڵ زەهاب' },
      { code: 'GLN', name: 'Gilan-e Gharb', nameAr: 'جيلان غرب', nameKu: 'گیلانغەرب' },
      { code: 'QSR', name: 'Qasr-e Shirin', nameAr: 'قصر شيرين', nameKu: 'قەسرشیرین' },
      { code: 'HRS', name: 'Harsin', nameAr: 'هرسين', nameKu: 'هەرسین' },
      { code: 'KNB', name: 'Kangavar', nameAr: 'كنگاور', nameKu: 'کەنگاوەر' },
      { code: 'SNQ', name: 'Sonqor', nameAr: 'سنقر', nameKu: 'سۆنقور' },
      // Ilam Province
      { code: 'ILA', name: 'Ilam', nameAr: 'إيلام', nameKu: 'ئیلام' },
      { code: 'DHL', name: 'Dehloran', nameAr: 'دهلران', nameKu: 'دەهلوڕان' },
      { code: 'MHN', name: 'Mehran', nameAr: 'مهران', nameKu: 'مەهران' },
      // West Azerbaijan Province
      { code: 'ORU', name: 'Urmia', nameAr: 'أورمية', nameKu: 'ورمێ' },
      { code: 'MAH', name: 'Mahabad', nameAr: 'مهاباد', nameKu: 'مەهاباد' },
      { code: 'BKN', name: 'Bukan', nameAr: 'بوكان', nameKu: 'بۆکان' },
      { code: 'PIR', name: 'Piranshahr', nameAr: 'بيرانشهر', nameKu: 'پیرانشار' },
      { code: 'SRD', name: 'Sardasht', nameAr: 'سردشت', nameKu: 'سەردەشت' },
      { code: 'OSH', name: 'Oshnavieh', nameAr: 'أشنويه', nameKu: 'ئۆشنەویە' },
      { code: 'NGD', name: 'Naqadeh', nameAr: 'نقده', nameKu: 'نەقەدە' },
      { code: 'MKU', name: 'Maku', nameAr: 'ماكو', nameKu: 'ماکوو' },
      { code: 'KHY', name: 'Khoy', nameAr: 'خوي', nameKu: 'خۆی' },
      { code: 'SAL', name: 'Salmas', nameAr: 'سلماس', nameKu: 'سەلماس' },
      { code: 'MYD', name: 'Miandoab', nameAr: 'ميانه دوآب', nameKu: 'میاندوئاو' },
      // East Azerbaijan & Other
      { code: 'ARD', name: 'Ardabil', nameAr: 'أردبيل', nameKu: 'ئەردەبیل' },
      { code: 'HAM2', name: 'Hamedan', nameAr: 'همدان', nameKu: 'هەمەدان' },
      { code: 'KHR', name: 'Khorramabad', nameAr: 'خرم آباد', nameKu: 'خوڕەماباد' },
      { code: 'BND', name: 'Bandar Abbas', nameAr: 'بندر عباس', nameKu: 'بەندەر عەبباس' },
      { code: 'ZAH', name: 'Zahedan', nameAr: 'زاهدان', nameKu: 'زاهدان' },
    ]
  },
  {
    code: 'TR',
    name: 'Turkey',
    nameAr: 'تركيا',
    nameKu: 'تورکیا',
    phoneCode: '+90',
    phoneMask: '+90 XXX XXX XX XX',
    currency: 'USD',
    cities: [
      { code: 'ANK', name: 'Ankara', nameAr: 'أنقرة', nameKu: 'ئەنقەرە', isCapital: true },
      { code: 'IST', name: 'Istanbul', nameAr: 'إسطنبول', nameKu: 'ئیستانبوڵ' },
      { code: 'IZM', name: 'Izmir', nameAr: 'إزميرة', nameKu: 'ئیزمیر' },
      { code: 'BUR', name: 'Bursa', nameAr: 'بورصة', nameKu: 'بووڕسا' },
      { code: 'ADA', name: 'Adana', nameAr: 'أضنة', nameKu: 'ئادەنا' },
      { code: 'GAZ', name: 'Gaziantep', nameAr: 'غازي عنتاب', nameKu: 'گازیعەنتاب' },
      { code: 'KON', name: 'Konya', nameAr: 'قونية', nameKu: 'قۆنیا' },
      { code: 'ANT', name: 'Antalya', nameAr: 'أنطاليا', nameKu: 'ئەنتالیا' },
      { code: 'DIY', name: 'Diyarbakir', nameAr: 'ديار بكر', nameKu: 'ئامەد' },
      { code: 'VAN', name: 'Van', nameAr: 'وان', nameKu: 'وان' },
      { code: 'ELA', name: 'Elazig', nameAr: 'إلازيغ', nameKu: 'ئەلازیغ' },
      { code: 'MAL', name: 'Malatya', nameAr: 'ملطية', nameKu: 'مەلەتیا' },
      { code: 'KAY', name: 'Kayseri', nameAr: 'قيصري', nameKu: 'قەیسەری' },
      { code: 'SAN2', name: 'Sanliurfa', nameAr: 'شانلي أورفا', nameKu: 'ڕیحا' },
      { code: 'MAR', name: 'Mardin', nameAr: 'ماردين', nameKu: 'مێردین' },
      { code: 'BAT', name: 'Batman', nameAr: 'باتمان', nameKu: 'بەتمان' },
      { code: 'SIR', name: 'Sirnak', nameAr: 'شرناق', nameKu: 'شرنەخ' },
      { code: 'HAK', name: 'Hakkari', nameAr: 'هكاري', nameKu: 'هەکاری' },
    ]
  },
  {
    code: 'AE',
    name: 'United Arab Emirates',
    nameAr: 'الإمارات',
    nameKu: 'ئیمارات',
    phoneCode: '+971',
    phoneMask: '+971 XX XXX XXXX',
    currency: 'USD',
    cities: [
      { code: 'DXB', name: 'Dubai', nameAr: 'دبي', nameKu: 'دوبەی' },
      { code: 'AUH', name: 'Abu Dhabi', nameAr: 'أبو ظبي', nameKu: 'ئەبووزەبی', isCapital: true },
      { code: 'SHJ', name: 'Sharjah', nameAr: 'الشارقة', nameKu: 'شارجە' },
      { code: 'AJM', name: 'Ajman', nameAr: 'عجمان', nameKu: 'عەجمان' },
      { code: 'RAK', name: 'Ras Al Khaimah', nameAr: 'رأس الخيمة', nameKu: 'ڕاس ئەلخەیمە' },
      { code: 'FUJ', name: 'Fujairah', nameAr: 'الفجيرة', nameKu: 'فوجەیرە' },
      { code: 'UAQ', name: 'Umm Al Quwain', nameAr: 'أم القيوين', nameKu: 'ئوم ئەلقوەین' },
    ]
  },
  {
    code: 'SA',
    name: 'Saudi Arabia',
    nameAr: 'السعودية',
    nameKu: 'سعوودیە',
    phoneCode: '+966',
    phoneMask: '+966 XX XXX XXXX',
    currency: 'USD',
    cities: [
      { code: 'RUH', name: 'Riyadh', nameAr: 'الرياض', nameKu: 'ڕیاز', isCapital: true },
      { code: 'JED', name: 'Jeddah', nameAr: 'جدة', nameKu: 'جیددە' },
      { code: 'MKK', name: 'Mecca', nameAr: 'مكة', nameKu: 'مەککە' },
      { code: 'MED', name: 'Medina', nameAr: 'المدينة', nameKu: 'مەدینە' },
      { code: 'DMM', name: 'Dammam', nameAr: 'الدمام', nameKu: 'دەممام' },
      { code: 'KHO', name: 'Khobar', nameAr: 'الخبر', nameKu: 'خوبەر' },
      { code: 'TAI', name: 'Taif', nameAr: 'الطائف', nameKu: 'تائیف' },
    ]
  },
  {
    code: 'JO',
    name: 'Jordan',
    nameAr: 'الأردن',
    nameKu: 'ئوردن',
    phoneCode: '+962',
    phoneMask: '+962 X XXXX XXXX',
    currency: 'USD',
    cities: [
      { code: 'AMM', name: 'Amman', nameAr: 'عمان', nameKu: 'عەممان', isCapital: true },
      { code: 'IRB', name: 'Irbid', nameAr: 'إربد', nameKu: 'ئیربید' },
      { code: 'ZAR', name: 'Zarqa', nameAr: 'الزرقاء', nameKu: 'زەرقا' },
      { code: 'AQA', name: 'Aqaba', nameAr: 'العقبة', nameKu: 'عەقەبە' },
      { code: 'MAD', name: 'Madaba', nameAr: 'مادبا', nameKu: 'مادەبا' },
    ]
  },
  {
    code: 'LB',
    name: 'Lebanon',
    nameAr: 'لبنان',
    nameKu: 'لوبنان',
    phoneCode: '+961',
    phoneMask: '+961 XX XXX XXX',
    currency: 'USD',
    cities: [
      { code: 'BEY', name: 'Beirut', nameAr: 'بيروت', nameKu: 'بەیرووت', isCapital: true },
      { code: 'TRI', name: 'Tripoli', nameAr: 'طرابلس', nameKu: 'تەرابلوس' },
      { code: 'SID', name: 'Sidon', nameAr: 'صيدا', nameKu: 'سەیدا' },
      { code: 'TYR', name: 'Tyre', nameAr: 'صور', nameKu: 'سوور' },
      { code: 'BAA', name: 'Baalbek', nameAr: 'بعلبك', nameKu: 'بەعلبەک' },
    ]
  },
  {
    code: 'EG',
    name: 'Egypt',
    nameAr: 'مصر',
    nameKu: 'میسر',
    phoneCode: '+20',
    phoneMask: '+20 XX XXXX XXXX',
    currency: 'USD',
    cities: [
      { code: 'CAI', name: 'Cairo', nameAr: 'القاهرة', nameKu: 'قاهیرە', isCapital: true },
      { code: 'ALX', name: 'Alexandria', nameAr: 'الإسكندرية', nameKu: 'ئەسکەندەریە' },
      { code: 'GIZ', name: 'Giza', nameAr: 'الجيزة', nameKu: 'گیزا' },
      { code: 'LUX', name: 'Luxor', nameAr: 'الأقصر', nameKu: 'لوکسۆر' },
      { code: 'ASW', name: 'Aswan', nameAr: 'أسوان', nameKu: 'ئەسوان' },
    ]
  },
  {
    code: 'KW',
    name: 'Kuwait',
    nameAr: 'الكويت',
    nameKu: 'کوەیت',
    phoneCode: '+965',
    phoneMask: '+965 XXXX XXXX',
    currency: 'USD',
    cities: [
      { code: 'KWC', name: 'Kuwait City', nameAr: 'الكويت', nameKu: 'کوەیت', isCapital: true },
      { code: 'HAW', name: 'Hawalli', nameAr: 'حولي', nameKu: 'حەوەللی' },
      { code: 'SAL', name: 'Salmiya', nameAr: 'السالمية', nameKu: 'سالمیە' },
      { code: 'FAR', name: 'Farwaniya', nameAr: 'الفروانية', nameKu: 'فەروانیە' },
    ]
  },
  {
    code: 'QA',
    name: 'Qatar',
    nameAr: 'قطر',
    nameKu: 'قەتەر',
    phoneCode: '+974',
    phoneMask: '+974 XXXX XXXX',
    currency: 'USD',
    cities: [
      { code: 'DOH', name: 'Doha', nameAr: 'الدوحة', nameKu: 'دەوحە', isCapital: true },
      { code: 'WAK', name: 'Al Wakrah', nameAr: 'الوكرة', nameKu: 'ئەلوەکڕە' },
      { code: 'KHO2', name: 'Al Khor', nameAr: 'الخور', nameKu: 'ئەلخۆر' },
    ]
  },
  {
    code: 'BH',
    name: 'Bahrain',
    nameAr: 'البحرين',
    nameKu: 'بەحرەین',
    phoneCode: '+973',
    phoneMask: '+973 XXXX XXXX',
    currency: 'USD',
    cities: [
      { code: 'MAN', name: 'Manama', nameAr: 'المنامة', nameKu: 'مەنامە', isCapital: true },
      { code: 'RIF', name: 'Riffa', nameAr: 'الرفاع', nameKu: 'ڕیففا' },
      { code: 'MUH', name: 'Muharraq', nameAr: 'المحرق', nameKu: 'موحەڕڕەق' },
    ]
  },
  {
    code: 'OM',
    name: 'Oman',
    nameAr: 'عمان',
    nameKu: 'عومان',
    phoneCode: '+968',
    phoneMask: '+968 XXXX XXXX',
    currency: 'USD',
    cities: [
      { code: 'MCT', name: 'Muscat', nameAr: 'مسقط', nameKu: 'موسکەت', isCapital: true },
      { code: 'SLL', name: 'Salalah', nameAr: 'صلالة', nameKu: 'سەلالە' },
      { code: 'SOH', name: 'Sohar', nameAr: 'صحار', nameKu: 'سوحار' },
    ]
  },
  {
    code: 'YE',
    name: 'Yemen',
    nameAr: 'اليمن',
    nameKu: 'یەمەن',
    phoneCode: '+967',
    phoneMask: '+967 XXX XXX XXX',
    currency: 'USD',
    cities: [
      { code: 'SAN', name: 'Sanaa', nameAr: 'صنعاء', nameKu: 'سەنعاء', isCapital: true },
      { code: 'ADE', name: 'Aden', nameAr: 'عدن', nameKu: 'عەدەن' },
      { code: 'TAI2', name: 'Taiz', nameAr: 'تعز', nameKu: 'تەعز' },
    ]
  },
  {
    code: 'PK',
    name: 'Pakistan',
    nameAr: 'باكستان',
    nameKu: 'پاکستان',
    phoneCode: '+92',
    phoneMask: '+92 XXX XXX XXXX',
    currency: 'USD',
    cities: [
      { code: 'ISB', name: 'Islamabad', nameAr: 'إسلام أباد', nameKu: 'ئیسلاماباد', isCapital: true },
      { code: 'KHI', name: 'Karachi', nameAr: 'كراتشي', nameKu: 'کەراچی' },
      { code: 'LHE', name: 'Lahore', nameAr: 'لاهور', nameKu: 'لاهۆر' },
      { code: 'PEW', name: 'Peshawar', nameAr: 'بيشاور', nameKu: 'پیشاوەر' },
      { code: 'QUE', name: 'Quetta', nameAr: 'كويتا', nameKu: 'کوەتا' },
    ]
  },
  {
    code: 'AF',
    name: 'Afghanistan',
    nameAr: 'أفغانستان',
    nameKu: 'ئەفغانستان',
    phoneCode: '+93',
    phoneMask: '+93 XX XXX XXXX',
    currency: 'USD',
    cities: [
      { code: 'KBL', name: 'Kabul', nameAr: 'كابول', nameKu: 'کابوڵ', isCapital: true },
      { code: 'KAN', name: 'Kandahar', nameAr: 'قندهار', nameKu: 'قەندەهار' },
      { code: 'HRT', name: 'Herat', nameAr: 'هرات', nameKu: 'هەرات' },
      { code: 'MZR', name: 'Mazar-i-Sharif', nameAr: 'مزار شريف', nameKu: 'مەزارشەریف' },
    ]
  },
  {
    code: 'IN',
    name: 'India',
    nameAr: 'الهند',
    nameKu: 'هیندستان',
    phoneCode: '+91',
    phoneMask: '+91 XXXXX XXXXX',
    currency: 'USD',
    cities: [
      { code: 'DEL', name: 'New Delhi', nameAr: 'نيودلهي', nameKu: 'نیودەلهی', isCapital: true },
      { code: 'BOM', name: 'Mumbai', nameAr: 'مومباي', nameKu: 'مومبای' },
      { code: 'BLR', name: 'Bangalore', nameAr: 'بنغالور', nameKu: 'بەنگالۆر' },
      { code: 'HYD', name: 'Hyderabad', nameAr: 'حيدر آباد', nameKu: 'حەیدەراباد' },
      { code: 'CHE', name: 'Chennai', nameAr: 'تشيناي', nameKu: 'چەننای' },
      { code: 'COL', name: 'Kolkata', nameAr: 'كولكاتا', nameKu: 'کۆلکاتا' },
    ]
  },
  {
    code: 'DE',
    name: 'Germany',
    nameAr: 'ألمانيا',
    nameKu: 'ئەڵمانیا',
    phoneCode: '+49',
    phoneMask: '+49 XXX XXXXXXXX',
    currency: 'EUR',
    cities: [
      { code: 'BER', name: 'Berlin', nameAr: 'برلين', nameKu: 'بەرلین', isCapital: true },
      { code: 'MUC', name: 'Munich', nameAr: 'ميونخ', nameKu: 'میونیخ' },
      { code: 'FRA', name: 'Frankfurt', nameAr: 'فرانكفورت', nameKu: 'فرانکفورت' },
      { code: 'HAM', name: 'Hamburg', nameAr: 'هامبورغ', nameKu: 'هامبورگ' },
      { code: 'CGN', name: 'Cologne', nameAr: 'كولونيا', nameKu: 'کۆلن' },
      { code: 'DUS', name: 'Dusseldorf', nameAr: 'دوسلدورف', nameKu: 'دوسڵدۆرف' },
    ]
  },
  {
    code: 'GB',
    name: 'United Kingdom',
    nameAr: 'المملكة المتحدة',
    nameKu: 'بریتانیا',
    phoneCode: '+44',
    phoneMask: '+44 XXXX XXXXXX',
    currency: 'GBP',
    cities: [
      { code: 'LON', name: 'London', nameAr: 'لندن', nameKu: 'لەندەن', isCapital: true },
      { code: 'MAN2', name: 'Manchester', nameAr: 'مانشستر', nameKu: 'مانچێستەر' },
      { code: 'BHM', name: 'Birmingham', nameAr: 'برمنغهام', nameKu: 'بیرمینگهام' },
      { code: 'GLA', name: 'Glasgow', nameAr: 'غلاسكو', nameKu: 'گلاسگۆ' },
      { code: 'LPL', name: 'Liverpool', nameAr: 'ليفربول', nameKu: 'لیڤەرپووڵ' },
      { code: 'EDI', name: 'Edinburgh', nameAr: 'أدنبرة', nameKu: 'ئەدینبورگ' },
    ]
  },
  {
    code: 'US',
    name: 'United States',
    nameAr: 'الولايات المتحدة',
    nameKu: 'ئەمەریکا',
    phoneCode: '+1',
    phoneMask: '+1 XXX XXX XXXX',
    currency: 'USD',
    cities: [
      { code: 'WDC', name: 'Washington DC', nameAr: 'واشنطن', nameKu: 'واشینگتۆن', isCapital: true },
      { code: 'NYC', name: 'New York', nameAr: 'نيويورك', nameKu: 'نیویۆرک' },
      { code: 'LAX', name: 'Los Angeles', nameAr: 'لوس أنجلوس', nameKu: 'لۆس ئەنجلۆس' },
      { code: 'CHI', name: 'Chicago', nameAr: 'شيكاغو', nameKu: 'شیکاگۆ' },
      { code: 'HOU', name: 'Houston', nameAr: 'هيوستن', nameKu: 'هیوستۆن' },
      { code: 'PHO', name: 'Phoenix', nameAr: 'فينيكس', nameKu: 'فینیکس' },
      { code: 'DAL', name: 'Dallas', nameAr: 'دالاس', nameKu: 'داڵاس' },
      { code: 'SFO', name: 'San Francisco', nameAr: 'سان فرانسيسكو', nameKu: 'سان فرانسیسکۆ' },
    ]
  },
  {
    code: 'CA',
    name: 'Canada',
    nameAr: 'كندا',
    nameKu: 'کەنەدا',
    phoneCode: '+1',
    phoneMask: '+1 XXX XXX XXXX',
    currency: 'CAD',
    cities: [
      { code: 'OTT', name: 'Ottawa', nameAr: 'أوتاوا', nameKu: 'ئۆتاوا', isCapital: true },
      { code: 'TOR', name: 'Toronto', nameAr: 'تورنتو', nameKu: 'تۆرۆنتۆ' },
      { code: 'VAN2', name: 'Vancouver', nameAr: 'فانكوفر', nameKu: 'ڤانکووڤەر' },
      { code: 'MTL', name: 'Montreal', nameAr: 'مونتريال', nameKu: 'مۆنترێال' },
      { code: 'CGY', name: 'Calgary', nameAr: 'كالغاري', nameKu: 'کالگاری' },
    ]
  },
  {
    code: 'FR',
    name: 'France',
    nameAr: 'فرنسا',
    nameKu: 'فەرەنسا',
    phoneCode: '+33',
    phoneMask: '+33 X XX XX XX XX',
    currency: 'EUR',
    cities: [
      { code: 'PAR', name: 'Paris', nameAr: 'باريس', nameKu: 'پاریس', isCapital: true },
      { code: 'LYS', name: 'Lyon', nameAr: 'ليون', nameKu: 'لیۆن' },
      { code: 'MRS', name: 'Marseille', nameAr: 'مارسيليا', nameKu: 'مارسێی' },
      { code: 'TLS', name: 'Toulouse', nameAr: 'تولوز', nameKu: 'تولووز' },
      { code: 'NCE', name: 'Nice', nameAr: 'نيس', nameKu: 'نیس' },
    ]
  },
  {
    code: 'IT',
    name: 'Italy',
    nameAr: 'إيطاليا',
    nameKu: 'ئیتالیا',
    phoneCode: '+39',
    phoneMask: '+39 XXX XXX XXXX',
    currency: 'EUR',
    cities: [
      { code: 'ROM', name: 'Rome', nameAr: 'روما', nameKu: 'ڕۆما', isCapital: true },
      { code: 'MIL', name: 'Milan', nameAr: 'ميلانو', nameKu: 'میلان' },
      { code: 'NAP', name: 'Naples', nameAr: 'نابولي', nameKu: 'ناپۆلی' },
      { code: 'FLR', name: 'Florence', nameAr: 'فلورنسا', nameKu: 'فلۆرێنس' },
      { code: 'VEN', name: 'Venice', nameAr: 'البندقية', nameKu: 'ڤێنیس' },
    ]
  },
  {
    code: 'NL',
    name: 'Netherlands',
    nameAr: 'هولندا',
    nameKu: 'هۆڵەندا',
    phoneCode: '+31',
    phoneMask: '+31 X XXXX XXXX',
    currency: 'EUR',
    cities: [
      { code: 'AMS', name: 'Amsterdam', nameAr: 'أمستردام', nameKu: 'ئەمستەردام', isCapital: true },
      { code: 'ROT', name: 'Rotterdam', nameAr: 'روتردام', nameKu: 'ڕۆتەردام' },
      { code: 'HAG', name: 'The Hague', nameAr: 'لاهاي', nameKu: 'لاهای' },
      { code: 'UTR', name: 'Utrecht', nameAr: 'أوتريخت', nameKu: 'ئوترێخت' },
    ]
  },
  {
    code: 'SE',
    name: 'Sweden',
    nameAr: 'السويد',
    nameKu: 'سوید',
    phoneCode: '+46',
    phoneMask: '+46 XX XXX XXXX',
    currency: 'SEK',
    cities: [
      { code: 'STO', name: 'Stockholm', nameAr: 'ستوكهولم', nameKu: 'ستۆکهۆڵم', isCapital: true },
      { code: 'GOT', name: 'Gothenburg', nameAr: 'غوتنبرغ', nameKu: 'گۆتبۆرگ' },
      { code: 'MAL2', name: 'Malmo', nameAr: 'مالمو', nameKu: 'مالمۆ' },
      { code: 'UPP', name: 'Uppsala', nameAr: 'أوبسالا', nameKu: 'ئوپسالا' },
    ]
  },
  {
    code: 'AU',
    name: 'Australia',
    nameAr: 'أستراليا',
    nameKu: 'ئوسترالیا',
    phoneCode: '+61',
    phoneMask: '+61 X XXXX XXXX',
    currency: 'AUD',
    cities: [
      { code: 'CAN', name: 'Canberra', nameAr: 'كانبرا', nameKu: 'کانبێرا', isCapital: true },
      { code: 'SYD', name: 'Sydney', nameAr: 'سيدني', nameKu: 'سیدنی' },
      { code: 'MEL', name: 'Melbourne', nameAr: 'ملبورن', nameKu: 'مەلبۆرن' },
      { code: 'BNE', name: 'Brisbane', nameAr: 'بريزبن', nameKu: 'بریزبان' },
      { code: 'PER', name: 'Perth', nameAr: 'بيرث', nameKu: 'پێرث' },
    ]
  },
  // Asia
  {
    code: 'CN',
    name: 'China',
    nameAr: 'الصين',
    nameKu: 'چین',
    phoneCode: '+86',
    phoneMask: '+86 XXX XXXX XXXX',
    currency: 'CNY',
    cities: [
      { code: 'BEI', name: 'Beijing', nameAr: 'بكين', nameKu: 'پەکین', isCapital: true },
      { code: 'SHA', name: 'Shanghai', nameAr: 'شنغهاي', nameKu: 'شانگهای' },
      { code: 'GUA', name: 'Guangzhou', nameAr: 'قوانغتشو', nameKu: 'گوانگژو' },
      { code: 'SHE', name: 'Shenzhen', nameAr: 'شنجن', nameKu: 'شنژەن' },
      { code: 'CHE', name: 'Chengdu', nameAr: 'تشنغدو', nameKu: 'چەنگدو' },
      { code: 'HAN', name: 'Hangzhou', nameAr: 'هانغتشو', nameKu: 'هانگژو' },
      { code: 'WUH', name: 'Wuhan', nameAr: 'ووهان', nameKu: 'ووهان' },
      { code: 'XIA', name: "Xi'an", nameAr: 'شيان', nameKu: 'شیان' },
    ]
  },
  {
    code: 'JP',
    name: 'Japan',
    nameAr: 'اليابان',
    nameKu: 'ژاپۆن',
    phoneCode: '+81',
    phoneMask: '+81 XX XXXX XXXX',
    currency: 'JPY',
    cities: [
      { code: 'TYO', name: 'Tokyo', nameAr: 'طوكيو', nameKu: 'تۆکیۆ', isCapital: true },
      { code: 'OSA', name: 'Osaka', nameAr: 'أوساكا', nameKu: 'ئۆساکا' },
      { code: 'KYO', name: 'Kyoto', nameAr: 'كيوتو', nameKu: 'کیۆتۆ' },
      { code: 'YOK', name: 'Yokohama', nameAr: 'يوكوهاما', nameKu: 'یۆکۆهاما' },
      { code: 'NAG', name: 'Nagoya', nameAr: 'ناغويا', nameKu: 'ناگۆیا' },
      { code: 'SAP', name: 'Sapporo', nameAr: 'سابورو', nameKu: 'ساپۆرۆ' },
    ]
  },
  {
    code: 'KR',
    name: 'South Korea',
    nameAr: 'كوريا الجنوبية',
    nameKu: 'کۆریای باشوور',
    phoneCode: '+82',
    phoneMask: '+82 XX XXXX XXXX',
    currency: 'KRW',
    cities: [
      { code: 'SEO', name: 'Seoul', nameAr: 'سيول', nameKu: 'سێئول', isCapital: true },
      { code: 'BUS', name: 'Busan', nameAr: 'بوسان', nameKu: 'بوسان' },
      { code: 'INC', name: 'Incheon', nameAr: 'إنتشون', nameKu: 'ئینچۆن' },
      { code: 'DAE', name: 'Daegu', nameAr: 'دايغو', nameKu: 'دایگو' },
    ]
  },
  {
    code: 'IN',
    name: 'India',
    nameAr: 'الهند',
    nameKu: 'هیندستان',
    phoneCode: '+91',
    phoneMask: '+91 XXXXX XXXXX',
    currency: 'INR',
    cities: [
      { code: 'DEL', name: 'New Delhi', nameAr: 'نيودلهي', nameKu: 'نیودێلهی', isCapital: true },
      { code: 'MUM', name: 'Mumbai', nameAr: 'مومباي', nameKu: 'مومبای' },
      { code: 'BAN', name: 'Bangalore', nameAr: 'بنغالور', nameKu: 'بەنگالۆر' },
      { code: 'CHN', name: 'Chennai', nameAr: 'تشيناي', nameKu: 'چینای' },
      { code: 'KOL', name: 'Kolkata', nameAr: 'كلكتا', nameKu: 'کولکاتا' },
      { code: 'HYD', name: 'Hyderabad', nameAr: 'حيدر أباد', nameKu: 'هایدەراباد' },
    ]
  },
  {
    code: 'BD',
    name: 'Bangladesh',
    nameAr: 'بنغلاديش',
    nameKu: 'بەنگلادێش',
    phoneCode: '+880',
    phoneMask: '+880 XXXX XXXXXX',
    currency: 'BDT',
    cities: [
      { code: 'DHA', name: 'Dhaka', nameAr: 'دكا', nameKu: 'داکا', isCapital: true },
      { code: 'CHI', name: 'Chittagong', nameAr: 'شيتاغونغ', nameKu: 'چیتاگۆنگ' },
      { code: 'KHU', name: 'Khulna', nameAr: 'خولنا', nameKu: 'خولنا' },
    ]
  },
  // Europe
  {
    code: 'RU',
    name: 'Russia',
    nameAr: 'روسيا',
    nameKu: 'ڕووسیا',
    phoneCode: '+7',
    phoneMask: '+7 XXX XXX XXXX',
    currency: 'RUB',
    cities: [
      { code: 'MOW', name: 'Moscow', nameAr: 'موسكو', nameKu: 'مۆسکۆ', isCapital: true },
      { code: 'LED', name: 'Saint Petersburg', nameAr: 'سانت بطرسبرغ', nameKu: 'سەنت پیتربورگ' },
      { code: 'NOV', name: 'Novosibirsk', nameAr: 'نوفوسيبيرسك', nameKu: 'نۆڤۆسیبیرسک' },
      { code: 'EKA', name: 'Yekaterinburg', nameAr: 'يكاترينبرغ', nameKu: 'یەکاتەرینبورگ' },
    ]
  },
  {
    code: 'PL',
    name: 'Poland',
    nameAr: 'بولندا',
    nameKu: 'پۆڵۆنیا',
    phoneCode: '+48',
    phoneMask: '+48 XXX XXX XXX',
    currency: 'PLN',
    cities: [
      { code: 'WAW', name: 'Warsaw', nameAr: 'وارسو', nameKu: 'وارشاو', isCapital: true },
      { code: 'KRK', name: 'Krakow', nameAr: 'كراكوف', nameKu: 'کراکۆف' },
      { code: 'WRO', name: 'Wroclaw', nameAr: 'فروتسواف', nameKu: 'ڤرۆتسواف' },
      { code: 'GDA', name: 'Gdansk', nameAr: 'غدانسك', nameKu: 'گدانسک' },
    ]
  },
  {
    code: 'ES',
    name: 'Spain',
    nameAr: 'إسبانيا',
    nameKu: 'ئیسپانیا',
    phoneCode: '+34',
    phoneMask: '+34 XXX XXX XXX',
    currency: 'EUR',
    cities: [
      { code: 'MAD', name: 'Madrid', nameAr: 'مدريد', nameKu: 'مەدرید', isCapital: true },
      { code: 'BCN', name: 'Barcelona', nameAr: 'برشلونة', nameKu: 'بەرشەلۆنا' },
      { code: 'VAL', name: 'Valencia', nameAr: 'فالنسيا', nameKu: 'ڤالنسیا' },
      { code: 'SEV', name: 'Seville', nameAr: 'إشبيلية', nameKu: 'سێڤیل' },
    ]
  },
  {
    code: 'PT',
    name: 'Portugal',
    nameAr: 'البرتغال',
    nameKu: 'پورتوگال',
    phoneCode: '+351',
    phoneMask: '+351 XXX XXX XXX',
    currency: 'EUR',
    cities: [
      { code: 'LIS', name: 'Lisbon', nameAr: 'لشبونة', nameKu: 'لیزبۆن', isCapital: true },
      { code: 'OPO', name: 'Porto', nameAr: 'بورتو', nameKu: 'پۆرتۆ' },
    ]
  },
  {
    code: 'GR',
    name: 'Greece',
    nameAr: 'اليونان',
    nameKu: 'یۆنان',
    phoneCode: '+30',
    phoneMask: '+30 XXX XXX XXXX',
    currency: 'EUR',
    cities: [
      { code: 'ATH', name: 'Athens', nameAr: 'أثينا', nameKu: 'ئەتێنا', isCapital: true },
      { code: 'SKG', name: 'Thessaloniki', nameAr: 'سالونيك', nameKu: 'تێسالۆنیکی' },
    ]
  },
  // Americas
  {
    code: 'BR',
    name: 'Brazil',
    nameAr: 'البرازيل',
    nameKu: 'بەڕازیل',
    phoneCode: '+55',
    phoneMask: '+55 XX XXXXX XXXX',
    currency: 'BRL',
    cities: [
      { code: 'BSB', name: 'Brasilia', nameAr: 'برازيليا', nameKu: 'بەڕازیلیا', isCapital: true },
      { code: 'SAO', name: 'São Paulo', nameAr: 'ساو باولو', nameKu: 'ساو پاولۆ' },
      { code: 'RIO', name: 'Rio de Janeiro', nameAr: 'ريو دي جانيرو', nameKu: 'ڕیۆ دی ژانێرۆ' },
      { code: 'BHZ', name: 'Belo Horizonte', nameAr: 'بيلو هوريزونتي', nameKu: 'بیلۆ هۆریزۆنتی' },
    ]
  },
  {
    code: 'MX',
    name: 'Mexico',
    nameAr: 'المكسيك',
    nameKu: 'مەکسیک',
    phoneCode: '+52',
    phoneMask: '+52 XX XXXX XXXX',
    currency: 'MXN',
    cities: [
      { code: 'MEX', name: 'Mexico City', nameAr: 'مدينة مكسيكو', nameKu: 'شاری مەکسیک', isCapital: true },
      { code: 'GDL', name: 'Guadalajara', nameAr: 'غوادالاخارا', nameKu: 'گوادالاخارا' },
      { code: 'MTY', name: 'Monterrey', nameAr: 'مونتيري', nameKu: 'مۆنتێڕی' },
      { code: 'CAN2', name: 'Cancun', nameAr: 'كانكون', nameKu: 'کانکوون' },
    ]
  },
  {
    code: 'AR',
    name: 'Argentina',
    nameAr: 'الأرجنتين',
    nameKu: 'ئەرجەنتین',
    phoneCode: '+54',
    phoneMask: '+54 XX XXXX XXXX',
    currency: 'ARS',
    cities: [
      { code: 'BUE', name: 'Buenos Aires', nameAr: 'بوينس آيرس', nameKu: 'بوینس ئایرس', isCapital: true },
      { code: 'COR', name: 'Cordoba', nameAr: 'قرطبة', nameKu: 'کوردوبا' },
      { code: 'ROS', name: 'Rosario', nameAr: 'روساريو', nameKu: 'ڕۆساریۆ' },
    ]
  },
  {
    code: 'CO',
    name: 'Colombia',
    nameAr: 'كولومبيا',
    nameKu: 'کۆلۆمبیا',
    phoneCode: '+57',
    phoneMask: '+57 XXX XXX XXXX',
    currency: 'COP',
    cities: [
      { code: 'BOG', name: 'Bogota', nameAr: 'بوغوتا', nameKu: 'بۆگۆتا', isCapital: true },
      { code: 'MED', name: 'Medellin', nameAr: 'ميديين', nameKu: 'مێدێیین' },
      { code: 'CAL', name: 'Cali', nameAr: 'كالي', nameKu: 'کالی' },
    ]
  },
  // Africa
  {
    code: 'EG',
    name: 'Egypt',
    nameAr: 'مصر',
    nameKu: 'میسر',
    phoneCode: '+20',
    phoneMask: '+20 XX XXXX XXXX',
    currency: 'EGP',
    cities: [
      { code: 'CAI', name: 'Cairo', nameAr: 'القاهرة', nameKu: 'قاهیرە', isCapital: true },
      { code: 'ALX', name: 'Alexandria', nameAr: 'الإسكندرية', nameKu: 'ئەسکەندەریە' },
      { code: 'GIZ', name: 'Giza', nameAr: 'الجيزة', nameKu: 'گیزا' },
      { code: 'LUX', name: 'Luxor', nameAr: 'الأقصر', nameKu: 'لوکسۆر' },
    ]
  },
  {
    code: 'MA',
    name: 'Morocco',
    nameAr: 'المغرب',
    nameKu: 'مەغریب',
    phoneCode: '+212',
    phoneMask: '+212 XXX XXX XXX',
    currency: 'MAD',
    cities: [
      { code: 'RAB', name: 'Rabat', nameAr: 'الرباط', nameKu: 'ڕەبات', isCapital: true },
      { code: 'CAS', name: 'Casablanca', nameAr: 'الدار البيضاء', nameKu: 'کازابلانکا' },
      { code: 'FES', name: 'Fes', nameAr: 'فاس', nameKu: 'فاس' },
      { code: 'MAR', name: 'Marrakech', nameAr: 'مراكش', nameKu: 'مەڕاکش' },
    ]
  },
  {
    code: 'ZA',
    name: 'South Africa',
    nameAr: 'جنوب أفريقيا',
    nameKu: 'ئەفریقای باشوور',
    phoneCode: '+27',
    phoneMask: '+27 XX XXX XXXX',
    currency: 'ZAR',
    cities: [
      { code: 'PRE', name: 'Pretoria', nameAr: 'بريتوريا', nameKu: 'پریتۆریا', isCapital: true },
      { code: 'JNB', name: 'Johannesburg', nameAr: 'جوهانسبرغ', nameKu: 'یۆهانسبورگ' },
      { code: 'CPT', name: 'Cape Town', nameAr: 'كيب تاون', nameKu: 'کەیپ تاون' },
      { code: 'DUR', name: 'Durban', nameAr: 'ديربان', nameKu: 'دوربان' },
    ]
  },
  {
    code: 'NG',
    name: 'Nigeria',
    nameAr: 'نيجيريا',
    nameKu: 'نایجیریا',
    phoneCode: '+234',
    phoneMask: '+234 XXX XXX XXXX',
    currency: 'NGN',
    cities: [
      { code: 'ABV', name: 'Abuja', nameAr: 'أبوجا', nameKu: 'ئەبووجا', isCapital: true },
      { code: 'LOS', name: 'Lagos', nameAr: 'لاغوس', nameKu: 'لاگۆس' },
      { code: 'KAN', name: 'Kano', nameAr: 'كانو', nameKu: 'کانۆ' },
    ]
  },
  // Southeast Asia
  {
    code: 'TH',
    name: 'Thailand',
    nameAr: 'تايلاند',
    nameKu: 'تایلەند',
    phoneCode: '+66',
    phoneMask: '+66 XX XXX XXXX',
    currency: 'THB',
    cities: [
      { code: 'BKK', name: 'Bangkok', nameAr: 'بانكوك', nameKu: 'بانگکۆک', isCapital: true },
      { code: 'CNX', name: 'Chiang Mai', nameAr: 'شيانغ ماي', nameKu: 'چیانگ مای' },
      { code: 'PKT', name: 'Phuket', nameAr: 'بوكيت', nameKu: 'پوکێت' },
    ]
  },
  {
    code: 'VN',
    name: 'Vietnam',
    nameAr: 'فيتنام',
    nameKu: 'ڤیەتنام',
    phoneCode: '+84',
    phoneMask: '+84 XXX XXX XXX',
    currency: 'VND',
    cities: [
      { code: 'HAN2', name: 'Hanoi', nameAr: 'هانوي', nameKu: 'هانۆی', isCapital: true },
      { code: 'SGN', name: 'Ho Chi Minh City', nameAr: 'هو تشي منه', nameKu: 'هۆ چی مین' },
      { code: 'DAD', name: 'Da Nang', nameAr: 'دا نانغ', nameKu: 'دانانگ' },
    ]
  },
  {
    code: 'MY',
    name: 'Malaysia',
    nameAr: 'ماليزيا',
    nameKu: 'مالیزیا',
    phoneCode: '+60',
    phoneMask: '+60 XX XXXX XXXX',
    currency: 'MYR',
    cities: [
      { code: 'KUL', name: 'Kuala Lumpur', nameAr: 'كوالالمبور', nameKu: 'کوالالەمپوور', isCapital: true },
      { code: 'PEN', name: 'Penang', nameAr: 'بينانغ', nameKu: 'پینانگ' },
      { code: 'JHB', name: 'Johor Bahru', nameAr: 'جوهر بهرو', nameKu: 'جۆهۆر باهرو' },
    ]
  },
  {
    code: 'ID',
    name: 'Indonesia',
    nameAr: 'إندونيسيا',
    nameKu: 'ئەندۆنیزیا',
    phoneCode: '+62',
    phoneMask: '+62 XXX XXXX XXXX',
    currency: 'IDR',
    cities: [
      { code: 'JKT', name: 'Jakarta', nameAr: 'جاكرتا', nameKu: 'جاکارتا', isCapital: true },
      { code: 'SBY', name: 'Surabaya', nameAr: 'سورابايا', nameKu: 'سورابایا' },
      { code: 'DPS', name: 'Bali', nameAr: 'بالي', nameKu: 'بالی' },
      { code: 'BDO', name: 'Bandung', nameAr: 'باندونغ', nameKu: 'باندونگ' },
    ]
  },
  {
    code: 'PH',
    name: 'Philippines',
    nameAr: 'الفلبين',
    nameKu: 'فیلیپین',
    phoneCode: '+63',
    phoneMask: '+63 XXX XXX XXXX',
    currency: 'PHP',
    cities: [
      { code: 'MNL', name: 'Manila', nameAr: 'مانيلا', nameKu: 'مانیلا', isCapital: true },
      { code: 'CEB', name: 'Cebu', nameAr: 'سيبو', nameKu: 'سەبوو' },
      { code: 'DVO', name: 'Davao', nameAr: 'دافاو', nameKu: 'داڤاو' },
    ]
  },
  {
    code: 'SG',
    name: 'Singapore',
    nameAr: 'سنغافورة',
    nameKu: 'سینگاپور',
    phoneCode: '+65',
    phoneMask: '+65 XXXX XXXX',
    currency: 'SGD',
    cities: [
      { code: 'SIN', name: 'Singapore', nameAr: 'سنغافورة', nameKu: 'سینگاپور', isCapital: true },
    ]
  },
];

// Helper functions
export const getCountryByCode = (codeOrName: string): Country | undefined => {
  if (!codeOrName) return undefined;
  const searchTerm = codeOrName.trim().toLowerCase();
  return COUNTRIES.find(country => 
    country.code.toLowerCase() === searchTerm ||
    country.name.toLowerCase() === searchTerm ||
    country.nameAr === codeOrName.trim() ||
    country.nameKu === codeOrName.trim()
  );
};

export const getCitiesByCountryCode = (countryCode: string): City[] => {
  const country = getCountryByCode(countryCode);
  return country?.cities || [];
};

/**
 * Normalizes Arabic, Persian, and Kurdish text for reliable searching and comparison.
 * Unifies distinct characters that look similar (like various Alifs, Yaas) and removes casing.
 */
export const normalizeForSearch = (text: string | undefined | null): string => {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[أإآاٱ]/g, 'ا') // Normalize Alif variants to bare Alif
    .replace(/[يىی]/g, 'ی') // Normalize Yaa and Alef Maksura to Farsi/Kurdish Yaa (since اربیل has ی)
    .replace(/[ةه]/g, 'ه')  // Normalize Ta-marbuta to Ha
    .replace(/[كک]/g, 'ک')  // Normalize Kaf vs Keheh
    .replace(/[ؤئ]/g, 'ء')  // Normalize Hamza (optional, but helpful)
    .replace(/\s+/g, ' ')   // Normalize spaces
    .trim();
};

export const getCityByCode = (countryCode: string, cityCodeOrName: string): City | undefined => {
  if (!cityCodeOrName) return undefined;
  const cities = getCitiesByCountryCode(countryCode);
  const searchTerm = cityCodeOrName.trim().toLowerCase();
  return cities.find(city => 
    city.code.toLowerCase() === searchTerm ||
    city.name.toLowerCase() === searchTerm ||
    city.nameAr === cityCodeOrName.trim() ||
    city.nameKu === cityCodeOrName.trim()
  );
};

export const getCountryByPhoneCode = (phoneCode: string): Country | undefined => {
  return COUNTRIES.find(country => country.phoneCode === phoneCode);
};

export const formatPhoneNumber = (phone: string, countryCode: string): string => {
  const country = getCountryByCode(countryCode);
  if (!country) return phone;

  // Remove all non-digits
  const cleaned = phone.replace(/\D/g, '');
  
  // Remove country code if present
  const phoneCodeDigits = country.phoneCode.replace(/\D/g, '');
  let localNumber = cleaned;
  
  if (cleaned.startsWith(phoneCodeDigits)) {
    localNumber = cleaned.slice(phoneCodeDigits.length);
  }

  // Format based on country
  switch (countryCode) {
    case 'IQ':
      // Iraq: +964 XXX XXX XXXX (10 digits after country code)
      if (localNumber.length === 10) {
        return `${country.phoneCode} ${localNumber.slice(0, 3)} ${localNumber.slice(3, 6)} ${localNumber.slice(6)}`;
      }
      break;
    case 'SY':
      // Syria: +963 XX XXX XXXX (9 digits after country code)
      if (localNumber.length === 9) {
        return `${country.phoneCode} ${localNumber.slice(0, 2)} ${localNumber.slice(2, 5)} ${localNumber.slice(5)}`;
      }
      break;
    case 'IR':
      // Iran: +98 XX XXXX XXXX (10 digits after country code)
      if (localNumber.length === 10) {
        return `${country.phoneCode} ${localNumber.slice(0, 2)} ${localNumber.slice(2, 6)} ${localNumber.slice(6)}`;
      }
      break;
    case 'TR':
      // Turkey: +90 XXX XXX XX XX (10 digits after country code)
      if (localNumber.length === 10) {
        return `${country.phoneCode} ${localNumber.slice(0, 3)} ${localNumber.slice(3, 6)} ${localNumber.slice(6, 8)} ${localNumber.slice(8)}`;
      }
      break;
  }

  // Fallback: just add country code
  return `${country.phoneCode} ${localNumber}`;
};

export const validatePhoneNumber = (phone: string, countryCode: string): boolean => {
  const country = getCountryByCode(countryCode);
  if (!country) return false;

  // Remove all non-digits
  const cleaned = phone.replace(/\D/g, '');
  
  // Remove country code if present
  const phoneCodeDigits = country.phoneCode.replace(/\D/g, '');
  let localNumber = cleaned;
  
  if (cleaned.startsWith(phoneCodeDigits)) {
    localNumber = cleaned.slice(phoneCodeDigits.length);
  }

  // Validate based on country
  switch (countryCode) {
    case 'IQ':
      return localNumber.length === 10 && localNumber.startsWith('7');
    case 'SY':
      return localNumber.length === 9;
    case 'IR':
      return localNumber.length === 10;
    case 'TR':
      return localNumber.length === 10;
    case 'LB':
      // Lebanon has both 7-digit (legacy mobile/landline) and 8-digit numbers.
      return localNumber.length === 7 || localNumber.length === 8;
    default: {
      // Any other listed country: validate against its mask's digit count
      // (number of X placeholders) instead of failing outright — otherwise every
      // selectable country without an explicit case above is always "invalid".
      const expected = (country.phoneMask.match(/X/g) || []).length;
      return expected > 0 && localNumber.length === expected;
    }
  }
};

export default {
  COUNTRIES,
  getCountryByCode,
  getCitiesByCountryCode,
  getCityByCode,
  getCountryByPhoneCode,
  formatPhoneNumber,
  validatePhoneNumber,
  normalizeForSearch,
};