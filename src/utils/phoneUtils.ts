/**
 * Comprehensive phone validation and formatting for React Native
 * Supports ALL countries worldwide with emoji flags
 * No external dependencies - works with Metro bundler
 */

export type CountryCode = 
  // Middle East
  | 'IQ' | 'SY' | 'TR' | 'JO' | 'LB' | 'IR' | 'AE' | 'SA' | 'EG' | 'KW' 
  | 'QA' | 'BH' | 'OM' | 'YE' | 'PS' | 'IL'
  // South Asia
  | 'PK' | 'AF' | 'IN' | 'BD' | 'LK' | 'NP' | 'MM' | 'BT' | 'MV'
  // Europe
  | 'DE' | 'GB' | 'US' | 'CA' | 'FR' | 'IT' | 'NL' | 'SE' | 'AU' | 'RU' 
  | 'CN' | 'JP' | 'KR' | 'BR' | 'MX' | 'ES' | 'PH' | 'ID' | 'MY' | 'TH' 
  | 'VN' | 'NG' | 'ZA' | 'PL' | 'UA' | 'BE' | 'CH' | 'AT' | 'GR' | 'PT' 
  | 'NO' | 'DK' | 'FI' | 'IE' | 'NZ' | 'SG' | 'HK' | 'TW' | 'CZ' | 'RO' 
  | 'HU' | 'SK' | 'BG' | 'RS' | 'HR' | 'SI' | 'BA' | 'AL' | 'MK' | 'ME' 
  | 'XK' | 'IS' | 'LU' | 'MT' | 'CY' | 'GE' | 'AM' | 'AZ' | 'EE' | 'LV'
  | 'LT' | 'BY' | 'MD' | 'MC' | 'AD' | 'SM' | 'VA' | 'LI'
  // Americas
  | 'AR' | 'CO' | 'CL' | 'PE' | 'VE' | 'CU' | 'DO' | 'PR' | 'GT' | 'EC'
  | 'BO' | 'PY' | 'UY' | 'CR' | 'PA' | 'HN' | 'SV' | 'NI' | 'HT' | 'JM'
  | 'TT' | 'BB' | 'BS' | 'BZ' | 'GY' | 'SR'
  // Africa
  | 'MA' | 'DZ' | 'TN' | 'LY' | 'SD' | 'ET' | 'KE' | 'GH' | 'TZ' | 'UG'
  | 'CM' | 'CI' | 'SN' | 'AO' | 'MZ' | 'ZW' | 'ZM' | 'MW' | 'RW' | 'BF'
  | 'ML' | 'NE' | 'TD' | 'MG' | 'MU' | 'BJ' | 'TG' | 'SL' | 'LR' | 'CF'
  | 'CG' | 'CD' | 'GA' | 'GQ' | 'DJ' | 'ER' | 'SO' | 'SS' | 'BW' | 'NA'
  | 'SZ' | 'LS' | 'CV' | 'KM' | 'SC' | 'GM' | 'GN' | 'GW' | 'MR'
  // Asia Pacific
  | 'KH' | 'LA' | 'BN' | 'TL' | 'MN' | 'KZ' | 'UZ' | 'TM' | 'TJ' | 'KG'
  | 'PG' | 'FJ' | 'SB' | 'VU' | 'WS' | 'TO' | 'FM' | 'PW' | 'MH' | 'KI'
  | 'NR' | 'TV' | 'NC' | 'PF';

export interface CountryInfo {
  code: CountryCode;
  dialCode: string;
  name: string;
  flag: string;
  minLength: number;
  maxLength: number;
}

// Comprehensive country list with phone info and flags
const countries: Record<CountryCode, CountryInfo> = {
  // Middle East
  IQ: { code: 'IQ', dialCode: '+964', name: 'Iraq', flag: '🇮🇶', minLength: 10, maxLength: 10 },
  SY: { code: 'SY', dialCode: '+963', name: 'Syria', flag: '🇸🇾', minLength: 9, maxLength: 9 },
  TR: { code: 'TR', dialCode: '+90', name: 'Turkey', flag: '🇹🇷', minLength: 10, maxLength: 10 },
  JO: { code: 'JO', dialCode: '+962', name: 'Jordan', flag: '🇯🇴', minLength: 9, maxLength: 9 },
  LB: { code: 'LB', dialCode: '+961', name: 'Lebanon', flag: '🇱🇧', minLength: 7, maxLength: 8 },
  IR: { code: 'IR', dialCode: '+98', name: 'Iran', flag: '🇮🇷', minLength: 10, maxLength: 10 },
  AE: { code: 'AE', dialCode: '+971', name: 'United Arab Emirates', flag: '🇦🇪', minLength: 9, maxLength: 9 },
  SA: { code: 'SA', dialCode: '+966', name: 'Saudi Arabia', flag: '🇸🇦', minLength: 9, maxLength: 9 },
  EG: { code: 'EG', dialCode: '+20', name: 'Egypt', flag: '🇪🇬', minLength: 10, maxLength: 10 },
  KW: { code: 'KW', dialCode: '+965', name: 'Kuwait', flag: '🇰🇼', minLength: 8, maxLength: 8 },
  QA: { code: 'QA', dialCode: '+974', name: 'Qatar', flag: '🇶🇦', minLength: 8, maxLength: 8 },
  BH: { code: 'BH', dialCode: '+973', name: 'Bahrain', flag: '🇧🇭', minLength: 8, maxLength: 8 },
  OM: { code: 'OM', dialCode: '+968', name: 'Oman', flag: '🇴🇲', minLength: 8, maxLength: 8 },
  YE: { code: 'YE', dialCode: '+967', name: 'Yemen', flag: '🇾🇪', minLength: 9, maxLength: 9 },
  PS: { code: 'PS', dialCode: '+970', name: 'Palestine', flag: '🇵🇸', minLength: 9, maxLength: 9 },
  IL: { code: 'IL', dialCode: '+972', name: 'Israel', flag: '🇮🇱', minLength: 9, maxLength: 9 },
  
  // South Asia
  PK: { code: 'PK', dialCode: '+92', name: 'Pakistan', flag: '🇵🇰', minLength: 10, maxLength: 10 },
  AF: { code: 'AF', dialCode: '+93', name: 'Afghanistan', flag: '🇦🇫', minLength: 9, maxLength: 9 },
  IN: { code: 'IN', dialCode: '+91', name: 'India', flag: '🇮🇳', minLength: 10, maxLength: 10 },
  BD: { code: 'BD', dialCode: '+880', name: 'Bangladesh', flag: '🇧🇩', minLength: 10, maxLength: 10 },
  LK: { code: 'LK', dialCode: '+94', name: 'Sri Lanka', flag: '🇱🇰', minLength: 9, maxLength: 9 },
  NP: { code: 'NP', dialCode: '+977', name: 'Nepal', flag: '🇳🇵', minLength: 10, maxLength: 10 },
  MM: { code: 'MM', dialCode: '+95', name: 'Myanmar', flag: '🇲🇲', minLength: 8, maxLength: 10 },
  BT: { code: 'BT', dialCode: '+975', name: 'Bhutan', flag: '🇧🇹', minLength: 8, maxLength: 8 },
  MV: { code: 'MV', dialCode: '+960', name: 'Maldives', flag: '🇲🇻', minLength: 7, maxLength: 7 },
  
  // Europe - Western
  DE: { code: 'DE', dialCode: '+49', name: 'Germany', flag: '🇩🇪', minLength: 10, maxLength: 11 },
  GB: { code: 'GB', dialCode: '+44', name: 'United Kingdom', flag: '🇬🇧', minLength: 10, maxLength: 10 },
  FR: { code: 'FR', dialCode: '+33', name: 'France', flag: '🇫🇷', minLength: 9, maxLength: 9 },
  IT: { code: 'IT', dialCode: '+39', name: 'Italy', flag: '🇮🇹', minLength: 9, maxLength: 10 },
  NL: { code: 'NL', dialCode: '+31', name: 'Netherlands', flag: '🇳🇱', minLength: 9, maxLength: 9 },
  SE: { code: 'SE', dialCode: '+46', name: 'Sweden', flag: '🇸🇪', minLength: 9, maxLength: 9 },
  ES: { code: 'ES', dialCode: '+34', name: 'Spain', flag: '🇪🇸', minLength: 9, maxLength: 9 },
  BE: { code: 'BE', dialCode: '+32', name: 'Belgium', flag: '🇧🇪', minLength: 9, maxLength: 9 },
  CH: { code: 'CH', dialCode: '+41', name: 'Switzerland', flag: '🇨🇭', minLength: 9, maxLength: 9 },
  AT: { code: 'AT', dialCode: '+43', name: 'Austria', flag: '🇦🇹', minLength: 10, maxLength: 11 },
  PT: { code: 'PT', dialCode: '+351', name: 'Portugal', flag: '🇵🇹', minLength: 9, maxLength: 9 },
  IE: { code: 'IE', dialCode: '+353', name: 'Ireland', flag: '🇮🇪', minLength: 9, maxLength: 9 },
  LU: { code: 'LU', dialCode: '+352', name: 'Luxembourg', flag: '🇱🇺', minLength: 9, maxLength: 9 },
  MC: { code: 'MC', dialCode: '+377', name: 'Monaco', flag: '🇲🇨', minLength: 8, maxLength: 9 },
  AD: { code: 'AD', dialCode: '+376', name: 'Andorra', flag: '🇦🇩', minLength: 6, maxLength: 9 },
  SM: { code: 'SM', dialCode: '+378', name: 'San Marino', flag: '🇸🇲', minLength: 6, maxLength: 10 },
  VA: { code: 'VA', dialCode: '+379', name: 'Vatican City', flag: '🇻🇦', minLength: 6, maxLength: 10 },
  LI: { code: 'LI', dialCode: '+423', name: 'Liechtenstein', flag: '🇱🇮', minLength: 7, maxLength: 9 },
  
  // Europe - Nordic
  NO: { code: 'NO', dialCode: '+47', name: 'Norway', flag: '🇳🇴', minLength: 8, maxLength: 8 },
  DK: { code: 'DK', dialCode: '+45', name: 'Denmark', flag: '🇩🇰', minLength: 8, maxLength: 8 },
  FI: { code: 'FI', dialCode: '+358', name: 'Finland', flag: '🇫🇮', minLength: 9, maxLength: 10 },
  IS: { code: 'IS', dialCode: '+354', name: 'Iceland', flag: '🇮🇸', minLength: 7, maxLength: 7 },
  
  // Europe - Central & Eastern
  PL: { code: 'PL', dialCode: '+48', name: 'Poland', flag: '🇵🇱', minLength: 9, maxLength: 9 },
  UA: { code: 'UA', dialCode: '+380', name: 'Ukraine', flag: '🇺🇦', minLength: 9, maxLength: 9 },
  CZ: { code: 'CZ', dialCode: '+420', name: 'Czech Republic', flag: '🇨🇿', minLength: 9, maxLength: 9 },
  RO: { code: 'RO', dialCode: '+40', name: 'Romania', flag: '🇷🇴', minLength: 9, maxLength: 9 },
  HU: { code: 'HU', dialCode: '+36', name: 'Hungary', flag: '🇭🇺', minLength: 9, maxLength: 9 },
  SK: { code: 'SK', dialCode: '+421', name: 'Slovakia', flag: '🇸🇰', minLength: 9, maxLength: 9 },
  BG: { code: 'BG', dialCode: '+359', name: 'Bulgaria', flag: '🇧🇬', minLength: 9, maxLength: 9 },
  RU: { code: 'RU', dialCode: '+7', name: 'Russia', flag: '🇷🇺', minLength: 10, maxLength: 10 },
  BY: { code: 'BY', dialCode: '+375', name: 'Belarus', flag: '🇧🇾', minLength: 9, maxLength: 9 },
  MD: { code: 'MD', dialCode: '+373', name: 'Moldova', flag: '🇲🇩', minLength: 8, maxLength: 8 },
  EE: { code: 'EE', dialCode: '+372', name: 'Estonia', flag: '🇪🇪', minLength: 7, maxLength: 8 },
  LV: { code: 'LV', dialCode: '+371', name: 'Latvia', flag: '🇱🇻', minLength: 8, maxLength: 8 },
  LT: { code: 'LT', dialCode: '+370', name: 'Lithuania', flag: '🇱🇹', minLength: 8, maxLength: 8 },
  
  // Europe - Southern & Balkans
  GR: { code: 'GR', dialCode: '+30', name: 'Greece', flag: '🇬🇷', minLength: 10, maxLength: 10 },
  RS: { code: 'RS', dialCode: '+381', name: 'Serbia', flag: '🇷🇸', minLength: 9, maxLength: 9 },
  HR: { code: 'HR', dialCode: '+385', name: 'Croatia', flag: '🇭🇷', minLength: 9, maxLength: 9 },
  SI: { code: 'SI', dialCode: '+386', name: 'Slovenia', flag: '🇸🇮', minLength: 8, maxLength: 8 },
  BA: { code: 'BA', dialCode: '+387', name: 'Bosnia and Herzegovina', flag: '🇧🇦', minLength: 8, maxLength: 8 },
  AL: { code: 'AL', dialCode: '+355', name: 'Albania', flag: '🇦🇱', minLength: 9, maxLength: 9 },
  MK: { code: 'MK', dialCode: '+389', name: 'North Macedonia', flag: '🇲🇰', minLength: 8, maxLength: 8 },
  ME: { code: 'ME', dialCode: '+382', name: 'Montenegro', flag: '🇲🇪', minLength: 8, maxLength: 8 },
  XK: { code: 'XK', dialCode: '+383', name: 'Kosovo', flag: '🇽🇰', minLength: 8, maxLength: 8 },
  MT: { code: 'MT', dialCode: '+356', name: 'Malta', flag: '🇲🇹', minLength: 8, maxLength: 8 },
  CY: { code: 'CY', dialCode: '+357', name: 'Cyprus', flag: '🇨🇾', minLength: 8, maxLength: 8 },
  
  // Caucasus & Central Asia
  GE: { code: 'GE', dialCode: '+995', name: 'Georgia', flag: '🇬🇪', minLength: 9, maxLength: 9 },
  AM: { code: 'AM', dialCode: '+374', name: 'Armenia', flag: '🇦🇲', minLength: 8, maxLength: 8 },
  AZ: { code: 'AZ', dialCode: '+994', name: 'Azerbaijan', flag: '🇦🇿', minLength: 9, maxLength: 9 },
  KZ: { code: 'KZ', dialCode: '+7', name: 'Kazakhstan', flag: '🇰🇿', minLength: 10, maxLength: 10 },
  UZ: { code: 'UZ', dialCode: '+998', name: 'Uzbekistan', flag: '🇺🇿', minLength: 9, maxLength: 9 },
  TM: { code: 'TM', dialCode: '+993', name: 'Turkmenistan', flag: '🇹🇲', minLength: 8, maxLength: 8 },
  TJ: { code: 'TJ', dialCode: '+992', name: 'Tajikistan', flag: '🇹🇯', minLength: 9, maxLength: 9 },
  KG: { code: 'KG', dialCode: '+996', name: 'Kyrgyzstan', flag: '🇰🇬', minLength: 9, maxLength: 9 },
  MN: { code: 'MN', dialCode: '+976', name: 'Mongolia', flag: '🇲🇳', minLength: 8, maxLength: 8 },
  
  // Americas - North
  US: { code: 'US', dialCode: '+1', name: 'United States', flag: '🇺🇸', minLength: 10, maxLength: 10 },
  CA: { code: 'CA', dialCode: '+1', name: 'Canada', flag: '🇨🇦', minLength: 10, maxLength: 10 },
  MX: { code: 'MX', dialCode: '+52', name: 'Mexico', flag: '🇲🇽', minLength: 10, maxLength: 10 },
  
  // Americas - Central & Caribbean
  GT: { code: 'GT', dialCode: '+502', name: 'Guatemala', flag: '🇬🇹', minLength: 8, maxLength: 8 },
  CU: { code: 'CU', dialCode: '+53', name: 'Cuba', flag: '🇨🇺', minLength: 8, maxLength: 8 },
  DO: { code: 'DO', dialCode: '+1', name: 'Dominican Republic', flag: '🇩🇴', minLength: 10, maxLength: 10 },
  PR: { code: 'PR', dialCode: '+1', name: 'Puerto Rico', flag: '🇵🇷', minLength: 10, maxLength: 10 },
  HT: { code: 'HT', dialCode: '+509', name: 'Haiti', flag: '🇭🇹', minLength: 8, maxLength: 8 },
  HN: { code: 'HN', dialCode: '+504', name: 'Honduras', flag: '🇭🇳', minLength: 8, maxLength: 8 },
  SV: { code: 'SV', dialCode: '+503', name: 'El Salvador', flag: '🇸🇻', minLength: 8, maxLength: 8 },
  NI: { code: 'NI', dialCode: '+505', name: 'Nicaragua', flag: '🇳🇮', minLength: 8, maxLength: 8 },
  CR: { code: 'CR', dialCode: '+506', name: 'Costa Rica', flag: '🇨🇷', minLength: 8, maxLength: 8 },
  PA: { code: 'PA', dialCode: '+507', name: 'Panama', flag: '🇵🇦', minLength: 8, maxLength: 8 },
  JM: { code: 'JM', dialCode: '+1', name: 'Jamaica', flag: '🇯🇲', minLength: 10, maxLength: 10 },
  TT: { code: 'TT', dialCode: '+1', name: 'Trinidad and Tobago', flag: '🇹🇹', minLength: 10, maxLength: 10 },
  BB: { code: 'BB', dialCode: '+1', name: 'Barbados', flag: '🇧🇧', minLength: 10, maxLength: 10 },
  BS: { code: 'BS', dialCode: '+1', name: 'Bahamas', flag: '🇧🇸', minLength: 10, maxLength: 10 },
  BZ: { code: 'BZ', dialCode: '+501', name: 'Belize', flag: '🇧🇿', minLength: 7, maxLength: 7 },
  
  // Americas - South
  BR: { code: 'BR', dialCode: '+55', name: 'Brazil', flag: '🇧🇷', minLength: 10, maxLength: 11 },
  AR: { code: 'AR', dialCode: '+54', name: 'Argentina', flag: '🇦🇷', minLength: 10, maxLength: 11 },
  CO: { code: 'CO', dialCode: '+57', name: 'Colombia', flag: '🇨🇴', minLength: 10, maxLength: 10 },
  CL: { code: 'CL', dialCode: '+56', name: 'Chile', flag: '🇨🇱', minLength: 9, maxLength: 9 },
  PE: { code: 'PE', dialCode: '+51', name: 'Peru', flag: '🇵🇪', minLength: 9, maxLength: 9 },
  VE: { code: 'VE', dialCode: '+58', name: 'Venezuela', flag: '🇻🇪', minLength: 10, maxLength: 10 },
  EC: { code: 'EC', dialCode: '+593', name: 'Ecuador', flag: '🇪🇨', minLength: 9, maxLength: 9 },
  BO: { code: 'BO', dialCode: '+591', name: 'Bolivia', flag: '🇧🇴', minLength: 8, maxLength: 8 },
  PY: { code: 'PY', dialCode: '+595', name: 'Paraguay', flag: '🇵🇾', minLength: 9, maxLength: 9 },
  UY: { code: 'UY', dialCode: '+598', name: 'Uruguay', flag: '🇺🇾', minLength: 8, maxLength: 8 },
  GY: { code: 'GY', dialCode: '+592', name: 'Guyana', flag: '🇬🇾', minLength: 7, maxLength: 7 },
  SR: { code: 'SR', dialCode: '+597', name: 'Suriname', flag: '🇸🇷', minLength: 7, maxLength: 7 },
  
  // Asia Pacific - East
  CN: { code: 'CN', dialCode: '+86', name: 'China', flag: '🇨🇳', minLength: 11, maxLength: 11 },
  JP: { code: 'JP', dialCode: '+81', name: 'Japan', flag: '🇯🇵', minLength: 10, maxLength: 10 },
  KR: { code: 'KR', dialCode: '+82', name: 'South Korea', flag: '🇰🇷', minLength: 10, maxLength: 11 },
  HK: { code: 'HK', dialCode: '+852', name: 'Hong Kong', flag: '🇭🇰', minLength: 8, maxLength: 8 },
  TW: { code: 'TW', dialCode: '+886', name: 'Taiwan', flag: '🇹🇼', minLength: 9, maxLength: 9 },
  
  // Asia Pacific - Southeast
  PH: { code: 'PH', dialCode: '+63', name: 'Philippines', flag: '🇵🇭', minLength: 10, maxLength: 10 },
  ID: { code: 'ID', dialCode: '+62', name: 'Indonesia', flag: '🇮🇩', minLength: 10, maxLength: 12 },
  MY: { code: 'MY', dialCode: '+60', name: 'Malaysia', flag: '🇲🇾', minLength: 9, maxLength: 10 },
  TH: { code: 'TH', dialCode: '+66', name: 'Thailand', flag: '🇹🇭', minLength: 9, maxLength: 9 },
  VN: { code: 'VN', dialCode: '+84', name: 'Vietnam', flag: '🇻🇳', minLength: 9, maxLength: 10 },
  SG: { code: 'SG', dialCode: '+65', name: 'Singapore', flag: '🇸🇬', minLength: 8, maxLength: 8 },
  KH: { code: 'KH', dialCode: '+855', name: 'Cambodia', flag: '🇰🇭', minLength: 8, maxLength: 9 },
  LA: { code: 'LA', dialCode: '+856', name: 'Laos', flag: '🇱🇦', minLength: 8, maxLength: 10 },
  BN: { code: 'BN', dialCode: '+673', name: 'Brunei', flag: '🇧🇳', minLength: 7, maxLength: 7 },
  TL: { code: 'TL', dialCode: '+670', name: 'Timor-Leste', flag: '🇹🇱', minLength: 7, maxLength: 8 },
  
  // Oceania
  AU: { code: 'AU', dialCode: '+61', name: 'Australia', flag: '🇦🇺', minLength: 9, maxLength: 9 },
  NZ: { code: 'NZ', dialCode: '+64', name: 'New Zealand', flag: '🇳🇿', minLength: 9, maxLength: 10 },
  PG: { code: 'PG', dialCode: '+675', name: 'Papua New Guinea', flag: '🇵🇬', minLength: 8, maxLength: 8 },
  FJ: { code: 'FJ', dialCode: '+679', name: 'Fiji', flag: '🇫🇯', minLength: 7, maxLength: 7 },
  SB: { code: 'SB', dialCode: '+677', name: 'Solomon Islands', flag: '🇸🇧', minLength: 7, maxLength: 7 },
  VU: { code: 'VU', dialCode: '+678', name: 'Vanuatu', flag: '🇻🇺', minLength: 7, maxLength: 7 },
  WS: { code: 'WS', dialCode: '+685', name: 'Samoa', flag: '🇼🇸', minLength: 7, maxLength: 7 },
  TO: { code: 'TO', dialCode: '+676', name: 'Tonga', flag: '🇹🇴', minLength: 5, maxLength: 7 },
  FM: { code: 'FM', dialCode: '+691', name: 'Micronesia', flag: '🇫🇲', minLength: 7, maxLength: 7 },
  PW: { code: 'PW', dialCode: '+680', name: 'Palau', flag: '🇵🇼', minLength: 7, maxLength: 7 },
  MH: { code: 'MH', dialCode: '+692', name: 'Marshall Islands', flag: '🇲🇭', minLength: 7, maxLength: 7 },
  KI: { code: 'KI', dialCode: '+686', name: 'Kiribati', flag: '🇰🇮', minLength: 5, maxLength: 8 },
  NR: { code: 'NR', dialCode: '+674', name: 'Nauru', flag: '🇳🇷', minLength: 7, maxLength: 7 },
  TV: { code: 'TV', dialCode: '+688', name: 'Tuvalu', flag: '🇹🇻', minLength: 5, maxLength: 6 },
  NC: { code: 'NC', dialCode: '+687', name: 'New Caledonia', flag: '🇳🇨', minLength: 6, maxLength: 6 },
  PF: { code: 'PF', dialCode: '+689', name: 'French Polynesia', flag: '🇵🇫', minLength: 6, maxLength: 6 },
  
  // Africa - North
  MA: { code: 'MA', dialCode: '+212', name: 'Morocco', flag: '🇲🇦', minLength: 9, maxLength: 9 },
  DZ: { code: 'DZ', dialCode: '+213', name: 'Algeria', flag: '🇩🇿', minLength: 9, maxLength: 9 },
  TN: { code: 'TN', dialCode: '+216', name: 'Tunisia', flag: '🇹🇳', minLength: 8, maxLength: 8 },
  LY: { code: 'LY', dialCode: '+218', name: 'Libya', flag: '🇱🇾', minLength: 9, maxLength: 9 },
  SD: { code: 'SD', dialCode: '+249', name: 'Sudan', flag: '🇸🇩', minLength: 9, maxLength: 9 },
  SS: { code: 'SS', dialCode: '+211', name: 'South Sudan', flag: '🇸🇸', minLength: 9, maxLength: 9 },
  
  // Africa - West
  NG: { code: 'NG', dialCode: '+234', name: 'Nigeria', flag: '🇳🇬', minLength: 10, maxLength: 10 },
  GH: { code: 'GH', dialCode: '+233', name: 'Ghana', flag: '🇬🇭', minLength: 9, maxLength: 9 },
  CI: { code: 'CI', dialCode: '+225', name: "Côte d'Ivoire", flag: '🇨🇮', minLength: 10, maxLength: 10 },
  SN: { code: 'SN', dialCode: '+221', name: 'Senegal', flag: '🇸🇳', minLength: 9, maxLength: 9 },
  CM: { code: 'CM', dialCode: '+237', name: 'Cameroon', flag: '🇨🇲', minLength: 9, maxLength: 9 },
  BF: { code: 'BF', dialCode: '+226', name: 'Burkina Faso', flag: '🇧🇫', minLength: 8, maxLength: 8 },
  ML: { code: 'ML', dialCode: '+223', name: 'Mali', flag: '🇲🇱', minLength: 8, maxLength: 8 },
  NE: { code: 'NE', dialCode: '+227', name: 'Niger', flag: '🇳🇪', minLength: 8, maxLength: 8 },
  BJ: { code: 'BJ', dialCode: '+229', name: 'Benin', flag: '🇧🇯', minLength: 8, maxLength: 8 },
  TG: { code: 'TG', dialCode: '+228', name: 'Togo', flag: '🇹🇬', minLength: 8, maxLength: 8 },
  SL: { code: 'SL', dialCode: '+232', name: 'Sierra Leone', flag: '🇸🇱', minLength: 8, maxLength: 8 },
  LR: { code: 'LR', dialCode: '+231', name: 'Liberia', flag: '🇱🇷', minLength: 7, maxLength: 8 },
  GM: { code: 'GM', dialCode: '+220', name: 'Gambia', flag: '🇬🇲', minLength: 7, maxLength: 7 },
  GN: { code: 'GN', dialCode: '+224', name: 'Guinea', flag: '🇬🇳', minLength: 9, maxLength: 9 },
  GW: { code: 'GW', dialCode: '+245', name: 'Guinea-Bissau', flag: '🇬🇼', minLength: 7, maxLength: 7 },
  MR: { code: 'MR', dialCode: '+222', name: 'Mauritania', flag: '🇲🇷', minLength: 8, maxLength: 8 },
  CV: { code: 'CV', dialCode: '+238', name: 'Cape Verde', flag: '🇨🇻', minLength: 7, maxLength: 7 },
  
  // Africa - East
  ET: { code: 'ET', dialCode: '+251', name: 'Ethiopia', flag: '🇪🇹', minLength: 9, maxLength: 9 },
  KE: { code: 'KE', dialCode: '+254', name: 'Kenya', flag: '🇰🇪', minLength: 9, maxLength: 9 },
  TZ: { code: 'TZ', dialCode: '+255', name: 'Tanzania', flag: '🇹🇿', minLength: 9, maxLength: 9 },
  UG: { code: 'UG', dialCode: '+256', name: 'Uganda', flag: '🇺🇬', minLength: 9, maxLength: 9 },
  RW: { code: 'RW', dialCode: '+250', name: 'Rwanda', flag: '🇷🇼', minLength: 9, maxLength: 9 },
  DJ: { code: 'DJ', dialCode: '+253', name: 'Djibouti', flag: '🇩🇯', minLength: 8, maxLength: 8 },
  ER: { code: 'ER', dialCode: '+291', name: 'Eritrea', flag: '🇪🇷', minLength: 7, maxLength: 7 },
  SO: { code: 'SO', dialCode: '+252', name: 'Somalia', flag: '🇸🇴', minLength: 8, maxLength: 9 },
  SC: { code: 'SC', dialCode: '+248', name: 'Seychelles', flag: '🇸🇨', minLength: 7, maxLength: 7 },
  KM: { code: 'KM', dialCode: '+269', name: 'Comoros', flag: '🇰🇲', minLength: 7, maxLength: 7 },
  MU: { code: 'MU', dialCode: '+230', name: 'Mauritius', flag: '🇲🇺', minLength: 8, maxLength: 8 },
  MG: { code: 'MG', dialCode: '+261', name: 'Madagascar', flag: '🇲🇬', minLength: 9, maxLength: 10 },
  
  // Africa - Central
  CD: { code: 'CD', dialCode: '+243', name: 'DR Congo', flag: '🇨🇩', minLength: 9, maxLength: 9 },
  CG: { code: 'CG', dialCode: '+242', name: 'Congo', flag: '🇨🇬', minLength: 9, maxLength: 9 },
  AO: { code: 'AO', dialCode: '+244', name: 'Angola', flag: '🇦🇴', minLength: 9, maxLength: 9 },
  TD: { code: 'TD', dialCode: '+235', name: 'Chad', flag: '🇹🇩', minLength: 8, maxLength: 8 },
  CF: { code: 'CF', dialCode: '+236', name: 'Central African Republic', flag: '🇨🇫', minLength: 8, maxLength: 8 },
  GA: { code: 'GA', dialCode: '+241', name: 'Gabon', flag: '🇬🇦', minLength: 7, maxLength: 8 },
  GQ: { code: 'GQ', dialCode: '+240', name: 'Equatorial Guinea', flag: '🇬🇶', minLength: 9, maxLength: 9 },
  
  // Africa - South
  ZA: { code: 'ZA', dialCode: '+27', name: 'South Africa', flag: '🇿🇦', minLength: 9, maxLength: 9 },
  ZW: { code: 'ZW', dialCode: '+263', name: 'Zimbabwe', flag: '🇿🇼', minLength: 9, maxLength: 9 },
  ZM: { code: 'ZM', dialCode: '+260', name: 'Zambia', flag: '🇿🇲', minLength: 9, maxLength: 9 },
  MZ: { code: 'MZ', dialCode: '+258', name: 'Mozambique', flag: '🇲🇿', minLength: 9, maxLength: 9 },
  MW: { code: 'MW', dialCode: '+265', name: 'Malawi', flag: '🇲🇼', minLength: 9, maxLength: 9 },
  BW: { code: 'BW', dialCode: '+267', name: 'Botswana', flag: '🇧🇼', minLength: 8, maxLength: 8 },
  NA: { code: 'NA', dialCode: '+264', name: 'Namibia', flag: '🇳🇦', minLength: 9, maxLength: 9 },
  SZ: { code: 'SZ', dialCode: '+268', name: 'Eswatini', flag: '🇸🇿', minLength: 8, maxLength: 8 },
  LS: { code: 'LS', dialCode: '+266', name: 'Lesotho', flag: '🇱🇸', minLength: 8, maxLength: 8 },
};

/**
 * True when the user actually typed a leading "+".
 *
 * MUST be computed from the raw input, before non-digits are stripped — that is the
 * only signal distinguishing "this is an international number" from "these digits
 * happen to begin with a country's dial code".
 */
const startsWithPlus = (phone: string): boolean => (phone || '').trim().startsWith('+');

/**
 * Iraqi/European local numbers are written with a trunk "0" that is dropped in E.164.
 * Users routinely type it after the country code too ("+964 0750 ..."), so strip it
 * before length-checking or re-emitting.
 */
const stripTrunkZero = (local: string): string => (local.startsWith('0') ? local.slice(1) : local);

interface DialCodeMatch {
  country: CountryInfo;
  /** Subscriber digits, trunk zero removed. */
  local: string;
  /** Whether `local` fits the country's exact [minLength, maxLength]. */
  fits: boolean;
}

/**
 * Resolve a digits-only number against the dial-code table.
 *
 * A dial code is only accepted when the user explicitly typed "+", OR when the
 * remaining digits fit that country's length range exactly. Short dial codes (+7
 * Russia/Kazakhstan, +1 NANP) are prefixes of ordinary local subscriber numbers, so
 * matching on prefix alone binds an Iraqi mobile typed the natural way
 * ("750 215 3223" → cleaned "7502153223") to Russia and then formats and validates
 * it against Russian rules.
 *
 * Note the length test is deliberately exact rather than the ±2 tolerance the old
 * validatePhone used: with a ±2 window, Russia (10-10) still accepts the 9 digits
 * left after consuming "7", which is precisely the mismatch being fixed. The
 * tolerance is retained only for the default-country fallback, where there is no
 * ambiguity about which country's rules apply.
 *
 * Every function that walks the table by dial-code prefix goes through here, so
 * formatPhone and validatePhone cannot drift apart — that drift is how the original
 * bug survived a partial fix.
 */
const matchDialCode = (cleaned: string, hasPlus: boolean): DialCodeMatch | undefined => {
  for (const country of Object.values(countries)) {
    const dialCodeDigits = country.dialCode.replace('+', '');
    if (!cleaned.startsWith(dialCodeDigits)) continue;

    const local = stripTrunkZero(cleaned.slice(dialCodeDigits.length));
    const fits = local.length >= country.minLength && local.length <= country.maxLength;

    if (hasPlus || fits) return { country, local, fits };
  }
  return undefined;
};

/**
 * Format phone number to international format (E.164)
 * Example: "0780 123 4567" → "+9647801234567"
 */
export const formatPhone = (phone: string, defaultCountry: CountryCode = 'IQ'): string => {
  try {
    const hasPlus = startsWithPlus(phone);
    // Remove all non-digit characters
    const cleaned = phone.replace(/\D/g, '');

    // Check if it starts with a country code
    const match = matchDialCode(cleaned, hasPlus);
    if (match) {
      return `${match.country.dialCode}${match.local}`;
    }

    // If starts with 0, assume it's local number
    if (cleaned.startsWith('0')) {
      const localNumber = cleaned.slice(1);
      return `${countries[defaultCountry].dialCode}${localNumber}`;
    }

    // If no country code, add default
    return `${countries[defaultCountry].dialCode}${cleaned}`;
  } catch (error) {
    throw new Error('Invalid phone format');
  }
};

/**
 * Validate phone number - more lenient validation
 */
export const validatePhone = (phone: string, defaultCountry: CountryCode = 'IQ'): boolean => {
  try {
    const hasPlus = startsWithPlus(phone);
    const cleaned = phone.replace(/\D/g, '');

    // Basic length check - at least 7 digits for any phone
    if (cleaned.length < 7) return false;

    // Check if starts with a known country code
    const match = matchDialCode(cleaned, hasPlus);
    if (match) return match.fits;

    // For local numbers, use default country validation
    const defaultInfo = countries[defaultCountry];
    const localNumber = stripTrunkZero(cleaned);
    return localNumber.length >= defaultInfo.minLength - 2 && localNumber.length <= defaultInfo.maxLength + 2;
  } catch {
    return false;
  }
};

/**
 * Format phone number for display
 * Example: "+9647801234567" → "+964 780 123 4567"
 */
export const displayPhone = (phone: string): string => {
  try {
    const hasPlus = startsWithPlus(phone);
    const cleaned = phone.replace(/\D/g, '');

    // Find matching country
    const match = matchDialCode(cleaned, hasPlus);
    if (match) {
      // Generic formatting: group by 3s
      const formatted = match.local.replace(/(\d{3})(?=\d)/g, '$1 ').trim();
      return `${match.country.dialCode} ${formatted}`;
    }

    // Default formatting
    return phone;
  } catch {
    return phone;
  }
};

/**
 * Get country code from phone number
 * Example: "+9647801234567" → "IQ"
 */
export const getCountryFromPhone = (phone: string): CountryCode | undefined => {
  try {
    const hasPlus = startsWithPlus(phone);
    const cleaned = phone.replace(/\D/g, '');

    return matchDialCode(cleaned, hasPlus)?.country.code;
  } catch {
    return undefined;
  }
};

/**
 * Get all supported countries sorted by name
 */
export const SUPPORTED_COUNTRIES: CountryCode[] = Object.keys(countries).sort((a, b) => 
  countries[a as CountryCode].name.localeCompare(countries[b as CountryCode].name)
) as CountryCode[];

/**
 * Default country code
 */
export const DEFAULT_COUNTRY: CountryCode = 'US';

/**
 * Get placeholder phone number for a country (example local format)
 */
const countryPlaceholders: Partial<Record<CountryCode, string>> = {
  US: '201 555 0123',
  CA: '204 555 0123',
  GB: '7911 123456',
  IQ: '750 123 4567',
  TR: '532 123 4567',
  AE: '50 123 4567',
  SA: '51 234 5678',
  EG: '100 123 4567',
  JO: '79 123 4567',
  LB: '71 123 456',
  SY: '93 123 4567',
  IR: '912 345 6789',
  KW: '5000 1234',
  QA: '3312 3456',
  BH: '3600 1234',
  OM: '9212 3456',
  DE: '151 2345 6789',
  FR: '6 12 34 56 78',
  IT: '312 345 6789',
  IN: '98765 43210',
  PK: '301 234 5678',
  BR: '11 91234 5678',
  MX: '55 1234 5678',
  AU: '412 345 678',
  CN: '131 2345 6789',
  JP: '90 1234 5678',
  KR: '10 1234 5678',
  NG: '802 123 4567',
  ZA: '71 123 4567',
};

export const getPlaceholderForCountry = (code: CountryCode): string => {
  return countryPlaceholders[code] || '123 456 789';
};

/**
 * Get country info
 */
export const getCountryInfo = (code: CountryCode): CountryInfo => {
  return countries[code];
};

/**
 * Get all countries as array (for pickers)
 */
export const getAllCountries = (): CountryInfo[] => {
  return Object.values(countries).sort((a, b) => a.name.localeCompare(b.name));
};

/**
 * Get country flag emoji
 */
export const getCountryFlag = (code: CountryCode): string => {
  return countries[code]?.flag || '🏳️';
};

/**
 * Get countries grouped by region
 */
export const getCountriesByRegion = (): Record<string, CountryInfo[]> => {
  const regions: Record<string, CountryCode[]> = {
    'Middle East': ['IQ', 'SY', 'TR', 'JO', 'LB', 'IR', 'AE', 'SA', 'EG', 'KW', 'QA', 'BH', 'OM', 'YE', 'PS', 'IL'],
    'South Asia': ['PK', 'AF', 'IN', 'BD', 'LK', 'NP', 'MM', 'BT', 'MV'],
    'Europe': ['DE', 'GB', 'FR', 'IT', 'NL', 'SE', 'ES', 'BE', 'CH', 'AT', 'PT', 'IE', 'NO', 'DK', 'FI', 'IS', 'GR', 'PL', 'UA', 'CZ', 'RO', 'HU', 'SK', 'BG', 'RS', 'HR', 'SI', 'BA', 'AL', 'MK', 'ME', 'XK', 'MT', 'CY', 'RU', 'BY', 'MD', 'EE', 'LV', 'LT', 'LU', 'MC', 'AD', 'SM', 'VA', 'LI'],
    'Americas': ['US', 'CA', 'MX', 'BR', 'AR', 'CO', 'CL', 'PE', 'VE', 'EC', 'GT', 'CU', 'DO', 'PR', 'HT', 'HN', 'SV', 'NI', 'CR', 'PA', 'JM', 'TT', 'BB', 'BS', 'BZ', 'BO', 'PY', 'UY', 'GY', 'SR'],
    'East Asia': ['CN', 'JP', 'KR', 'HK', 'TW', 'MN'],
    'Southeast Asia': ['PH', 'ID', 'MY', 'TH', 'VN', 'SG', 'KH', 'LA', 'BN', 'TL'],
    'Central Asia': ['GE', 'AM', 'AZ', 'KZ', 'UZ', 'TM', 'TJ', 'KG'],
    'Oceania': ['AU', 'NZ', 'PG', 'FJ', 'SB', 'VU', 'WS', 'TO', 'FM', 'PW', 'MH', 'KI', 'NR', 'TV', 'NC', 'PF'],
    'Africa': ['NG', 'ZA', 'MA', 'DZ', 'TN', 'LY', 'SD', 'ET', 'KE', 'GH', 'TZ', 'UG', 'CM', 'CI', 'SN', 'AO', 'MZ', 'ZW', 'ZM', 'MW', 'RW', 'BF', 'ML', 'NE', 'TD', 'MG', 'MU', 'BJ', 'TG', 'SL', 'LR', 'CF', 'CG', 'CD', 'GA', 'GQ', 'DJ', 'ER', 'SO', 'SS', 'BW', 'NA', 'SZ', 'LS', 'CV', 'KM', 'SC', 'GM', 'GN', 'GW', 'MR'],
  };
  
  const result: Record<string, CountryInfo[]> = {};
  
  for (const [region, codes] of Object.entries(regions)) {
    result[region] = codes
      .filter(code => countries[code])
      .map(code => countries[code])
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  
  return result;
};
