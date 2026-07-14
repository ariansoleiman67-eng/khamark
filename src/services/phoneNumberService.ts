import { COUNTRIES, getCountryByCode, formatPhoneNumber, validatePhoneNumber } from '../constants/countries';

export interface PhoneNumberResult {
  isValid: boolean;
  formatted: string;
  countryCode?: string;
  localNumber: string;
  error?: string;
}

export class PhoneNumberService {
  /**
   * Format phone number based on country
   */
  static formatPhone(phone: string, countryCode: string): string {
    if (!phone || !countryCode) return phone;
    return formatPhoneNumber(phone, countryCode);
  }

  /**
   * Validate phone number based on country
   */
  static validatePhone(phone: string, countryCode: string): PhoneNumberResult {
    if (!phone) {
      return {
        isValid: false,
        formatted: '',
        localNumber: '',
        error: 'Phone number is required',
      };
    }

    if (!countryCode) {
      return {
        isValid: false,
        formatted: phone,
        localNumber: phone,
        error: 'Country code is required',
      };
    }

    const country = getCountryByCode(countryCode);
    if (!country) {
      return {
        isValid: false,
        formatted: phone,
        localNumber: phone,
        error: 'Invalid country code',
      };
    }

    // Remove all non-digits
    const cleaned = phone.replace(/\D/g, '');
    
    // Remove country code if present
    const phoneCodeDigits = country.phoneCode.replace(/\D/g, '');
    let localNumber = cleaned;
    
    if (cleaned.startsWith(phoneCodeDigits)) {
      localNumber = cleaned.slice(phoneCodeDigits.length);
    }

    const isValid = validatePhoneNumber(phone, countryCode);
    const formatted = isValid ? formatPhoneNumber(phone, countryCode) : phone;

    let error: string | undefined;
    if (!isValid) {
      switch (countryCode) {
        case 'IQ':
          error = `Invalid Iraqi phone number. Format: ${country.phoneMask} (must start with 7)`;
          break;
        case 'SY':
          error = `Invalid Syrian phone number. Format: ${country.phoneMask}`;
          break;
        case 'IR':
          error = `Invalid Iranian phone number. Format: ${country.phoneMask}`;
          break;
        case 'TR':
          error = `Invalid Turkish phone number. Format: ${country.phoneMask}`;
          break;
        default:
          error = `Invalid phone number format. Expected: ${country.phoneMask}`;
      }
    }

    return {
      isValid,
      formatted,
      countryCode,
      localNumber,
      error,
    };
  }

  /**
   * Get phone mask for country
   */
  static getPhoneMask(countryCode: string): string {
    const country = getCountryByCode(countryCode);
    return country?.phoneMask || '+XXX XXX XXX XXXX';
  }

  /**
   * Get phone code for country
   */
  static getPhoneCode(countryCode: string): string {
    const country = getCountryByCode(countryCode);
    return country?.phoneCode || '+1';
  }

  /**
   * Auto-detect country from phone number
   */
  static detectCountryFromPhone(phone: string): string | null {
    if (!phone) return null;

    const cleaned = phone.replace(/\D/g, '');
    
    for (const country of COUNTRIES) {
      const phoneCodeDigits = country.phoneCode.replace(/\D/g, '');
      if (cleaned.startsWith(phoneCodeDigits)) {
        return country.code;
      }
    }

    return null;
  }

  /**
   * Strip country code from phone number
   */
  static stripCountryCode(phone: string, countryCode?: string): string {
    if (!phone) return '';

    const cleaned = phone.replace(/\D/g, '');
    
    if (countryCode) {
      const country = getCountryByCode(countryCode);
      if (country) {
        const phoneCodeDigits = country.phoneCode.replace(/\D/g, '');
        if (cleaned.startsWith(phoneCodeDigits)) {
          return cleaned.slice(phoneCodeDigits.length);
        }
      }
    } else {
      // Try to detect and strip any known country code
      for (const country of COUNTRIES) {
        const phoneCodeDigits = country.phoneCode.replace(/\D/g, '');
        if (cleaned.startsWith(phoneCodeDigits)) {
          return cleaned.slice(phoneCodeDigits.length);
        }
      }
    }

    return cleaned;
  }

  /**
   * Add country code to phone number
   */
  static addCountryCode(phone: string, countryCode: string): string {
    if (!phone || !countryCode) return phone;

    const country = getCountryByCode(countryCode);
    if (!country) return phone;

    const cleaned = phone.replace(/\D/g, '');
    const phoneCodeDigits = country.phoneCode.replace(/\D/g, '');
    
    // Don't add if already has country code
    if (cleaned.startsWith(phoneCodeDigits)) {
      return phone;
    }

    return `${country.phoneCode}${cleaned}`;
  }

  /**
   * Get example phone number for country
   */
  static getExamplePhone(countryCode: string): string {
    const country = getCountryByCode(countryCode);
    if (!country) return '';

    switch (countryCode) {
      case 'IQ':
        return '+964 750 123 4567';
      case 'SY':
        return '+963 94 123 4567';
      case 'IR':
        return '+98 91 1234 5678';
      case 'TR':
        return '+90 532 123 45 67';
      default:
        return country.phoneMask.replace(/X/g, '1');
    }
  }
}

export default PhoneNumberService;