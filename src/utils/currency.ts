// Currency formatting utilities for US Dollar (USD)

export const formatCurrencyUSD = (
  amount: number,
  options: {
    compact?: boolean;
    decimals?: boolean;
    symbol?: boolean;
  } = {}
): string => {
  const {
    compact = false,
    decimals = true,
    symbol = true,
  } = options;

  // Handle negative / non-finite numbers
  const safe = Number.isFinite(amount) ? amount : 0;
  const isNegative = safe < 0;
  const absAmount = Math.abs(safe);

  // Format with thousand separators
  const formatNumber = (num: number): string => {
    if (compact && num >= 1000000) {
      const millions = num / 1000000;
      return `${millions.toFixed(millions >= 10 ? 0 : 1)}M`;
    } else if (compact && num >= 1000) {
      const thousands = num / 1000;
      return `${thousands.toFixed(thousands >= 10 ? 0 : 1)}K`;
    }

    // Standard formatting with commas
    const parts = num.toFixed(decimals ? 2 : 0).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  };

  const formattedAmount = formatNumber(absAmount);
  const prefix = isNegative ? '-' : '';
  const symbolText = symbol ? '$' : '';

  return `${prefix}${symbolText}${formattedAmount}`;
};

// Locale-aware currency formatting
export const formatCurrencyLocalized = (
  amount: number,
  locale: string = 'en',
  options: {
    compact?: boolean;
    decimals?: boolean;
  } = {}
): string => {
  const {
    compact = false,
    decimals = true,
  } = options;

  // Handle negative numbers
  const isNegative = amount < 0;
  const absAmount = Math.abs(amount);

  // Locale-specific formatting
  const localeMap: { [key: string]: string } = {
    'ar': 'ar-US',
    'ku': 'en-US',
    'en': 'en-US',
  };
  
  const targetLocale = localeMap[locale] || 'en-US';
  
  try {
    if (compact) {
      if (absAmount >= 1000000) {
        const millions = absAmount / 1000000;
        return `${isNegative ? '-' : ''}$${millions.toFixed(millions >= 10 ? 0 : 1)}M`;
      } else if (absAmount >= 1000) {
        const thousands = absAmount / 1000;
        return `${isNegative ? '-' : ''}$${thousands.toFixed(thousands >= 10 ? 0 : 1)}K`;
      }
    }
    
    // Use Intl.NumberFormat for proper localization
    const formatter = new Intl.NumberFormat(targetLocale, {
      style: 'decimal',
      minimumFractionDigits: decimals ? 2 : 0,
      maximumFractionDigits: decimals ? 2 : 0,
    });
    
    const formattedNumber = formatter.format(absAmount);
    return `${isNegative ? '-' : ''}$${formattedNumber}`;
  } catch (error) {
    // Fallback to basic formatting if locale is not supported
    return formatCurrencyUSD(amount, { compact, decimals, symbol: true });
  }
};

// Date formatting utilities
export const roundIQD = (amountIQD: number): number => {
  const ROUNDING_STEP = 250;
  return Math.round(amountIQD / ROUNDING_STEP) * ROUNDING_STEP;
};

export const convertUSDToIQD = (amountUSD: number, exchangeRate: number = 1500): number => {
  if (!Number.isFinite(amountUSD) || !amountUSD) return 0;
  const rawIQD = amountUSD * exchangeRate;
  return roundIQD(rawIQD);
};

export const formatCurrencyIQD = (
  amount: number,
  options: {
    compact?: boolean;
    symbol?: boolean;
    symbolText?: string;
  } = {}
): string => {
  const { compact = false, symbol = true, symbolText = 'IQD ' } = options;

  const safe = Number.isFinite(amount) ? amount : 0;
  const isNegative = safe < 0;
  const absAmount = Math.abs(safe);

  const formatNumber = (num: number): string => {
    if (compact && num >= 1000000) {
      const millions = num / 1000000;
      return `${millions.toFixed(millions >= 10 ? 0 : 1)}M`;
    } else if (compact && num >= 1000) {
      const thousands = num / 1000;
      return `${thousands.toFixed(thousands >= 10 ? 0 : 1)}K`;
    }

    const parts = num.toFixed(0).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  };

  const formattedAmount = formatNumber(absAmount);
  const prefix = isNegative ? '-' : '';
  const displaySymbol = symbol ? symbolText : '';

  return `${prefix}${displaySymbol}${formattedAmount}`;
};

export const formatPrice = (
  amountUSD: number,
  currency: 'USD' | 'IQD' = 'USD',
  exchangeRateIQD: number = 1500,
  options: any = {}
): string => {
  if (currency === 'IQD') {
    const amountIQD = convertUSDToIQD(amountUSD, exchangeRateIQD);
    return formatCurrencyIQD(amountIQD, options);
  }
  return formatCurrencyUSD(amountUSD, options);
};

// Date formatting utilities
export const formatDate = (date: Date | string | any, locale: string = 'en-US'): string => {
  if (!date) return '';
  
  let dateObj: Date;
  
  if (typeof date === 'string') {
    dateObj = new Date(date);
  } else if (date.seconds) {
    // Firebase Timestamp
    dateObj = new Date(date.seconds * 1000);
  } else if (date instanceof Date) {
    dateObj = date;
  } else {
    return '';
  }

  if (isNaN(dateObj.getTime())) {
    return '';
  }

  // Use locale-specific formatting
  const localeMap: { [key: string]: string } = {
    'ar': 'ar-IQ',
    'ku': 'ckb-IQ', // Kurdish (Sorani) - Iraq
    'en': 'en-US',
  };
  
  const targetLocale = localeMap[locale] || locale;
  
  return dateObj.toLocaleDateString(targetLocale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

export const formatDateRelative = (date: Date | string | any): string => {
  if (!date) return '';
  
  let dateObj: Date;
  
  if (typeof date === 'string') {
    dateObj = new Date(date);
  } else if (date.seconds) {
    // Firebase Timestamp
    dateObj = new Date(date.seconds * 1000);
  } else if (date instanceof Date) {
    dateObj = date;
  } else {
    return '';
  }

  if (isNaN(dateObj.getTime())) {
    return '';
  }

  const now = new Date();
  const diffInMs = now.getTime() - dateObj.getTime();
  const diffInHours = diffInMs / (1000 * 60 * 60);
  const diffInDays = diffInMs / (1000 * 60 * 60 * 24);

  if (diffInHours < 1) {
    const minutes = Math.floor(diffInMs / (1000 * 60));
    return `${minutes} min${minutes !== 1 ? 's' : ''} ago`;
  } else if (diffInHours < 24) {
    const hours = Math.floor(diffInHours);
    return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  } else if (diffInDays < 7) {
    const days = Math.floor(diffInDays);
    return `${days} day${days !== 1 ? 's' : ''} ago`;
  } else if (diffInDays < 30) {
    const weeks = Math.floor(diffInDays / 7);
    return `${weeks} week${weeks !== 1 ? 's' : ''} ago`;
  } else if (diffInDays < 365) {
    const months = Math.floor(diffInDays / 30);
    return `${months} month${months !== 1 ? 's' : ''} ago`;
  } else {
    const years = Math.floor(diffInDays / 365);
    return `${years} year${years !== 1 ? 's' : ''} ago`;
  }
};

export const formatDateTime = (date: Date | string | any, locale: string = 'en-US'): string => {
  if (!date) return '';
  
  let dateObj: Date;
  
  if (typeof date === 'string') {
    dateObj = new Date(date);
  } else if (date.seconds) {
    // Firebase Timestamp
    dateObj = new Date(date.seconds * 1000);
  } else if (date instanceof Date) {
    dateObj = date;
  } else {
    return '';
  }

  if (isNaN(dateObj.getTime())) {
    return '';
  }

  // Use locale-specific formatting
  const localeMap: { [key: string]: string } = {
    'ar': 'ar-IQ',
    'ku': 'ckb-IQ', // Kurdish (Sorani) - Iraq
    'en': 'en-US',
  };
  
  const targetLocale = localeMap[locale] || locale;

  return dateObj.toLocaleString(targetLocale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// Phone number formatting for Iraqi numbers
export const formatPhoneIQ = (phone: string): string => {
  if (!phone) return '';
  
  // Remove all non-digits
  const cleaned = phone.replace(/\D/g, '');
  
  // Handle different Iraqi phone formats
  if (cleaned.startsWith('964')) {
    // International format: +964 7XX XXX XXXX
    const number = cleaned.slice(3);
    if (number.length === 10) {
      return `+964 ${number.slice(0, 3)} ${number.slice(3, 6)} ${number.slice(6)}`;
    }
  } else if (cleaned.startsWith('07')) {
    // Local format: 07XX XXX XXXX
    if (cleaned.length === 11) {
      return `${cleaned.slice(0, 4)} ${cleaned.slice(4, 7)} ${cleaned.slice(7)}`;
    }
  }
  
  return phone; // Return original if no format matches
};

// Percentage formatting
export const formatPercentage = (value: number, decimals: number = 1): string => {
  if (!Number.isFinite(value)) return '';
  return `${value.toFixed(decimals)}%`;
};

// Weight formatting (for product specifications)
export const formatWeight = (weightKg: number): string => {
  if (weightKg < 1) {
    return `${(weightKg * 1000).toFixed(0)}g`;
  } else {
    return `${weightKg.toFixed(1)}kg`;
  }
};

// Dimensions formatting
export const formatDimensions = (dimensions?: {
  length: number;
  width: number;
  height: number;
} | null): string => {
  if (!dimensions) return '';
  const { length, width, height } = dimensions;
  return `${length} × ${width} × ${height} cm`;
};

// Distance formatting (for delivery estimates)
export const formatDistance = (distanceKm: number): string => {
  if (distanceKm < 1) {
    return `${(distanceKm * 1000).toFixed(0)}m`;
  } else {
    return `${distanceKm.toFixed(1)}km`;
  }
};


// Create an alias for backward compatibility
export const formatCurrency = (amount: number, currency: 'USD' | 'IQD' = 'USD'): string => {
  return formatPrice(amount, currency);
};

// Localized relative date formatting with i18n support
export const formatDateRelativeLocalized = (
  date: Date | string | any,
  t: (key: string, options?: any) => string
): string => {
  if (!date) return '';
  
  let dateObj: Date;
  
  if (typeof date === 'string') {
    dateObj = new Date(date);
  } else if (date.seconds) {
    // Firebase Timestamp
    dateObj = new Date(date.seconds * 1000);
  } else if (date instanceof Date) {
    dateObj = date;
  } else {
    return '';
  }

  if (isNaN(dateObj.getTime())) {
    return '';
  }

  const now = new Date();
  const diffInMs = now.getTime() - dateObj.getTime();
  const diffInHours = diffInMs / (1000 * 60 * 60);
  const diffInDays = diffInMs / (1000 * 60 * 60 * 24);

  if (diffInHours < 1) {
    const minutes = Math.floor(diffInMs / (1000 * 60));
    return minutes <= 1 ? t('date.justNow') : t('date.minutesAgo', { count: minutes });
  } else if (diffInHours < 24) {
    const hours = Math.floor(diffInHours);
    return t('date.hoursAgo', { count: hours });
  } else if (diffInDays < 7) {
    if (diffInDays < 1) {
      return t('date.today');
    } else if (diffInDays < 2) {
      return t('date.yesterday');
    } else {
      const days = Math.floor(diffInDays);
      return t('date.daysAgo', { count: days });
    }
  } else if (diffInDays < 30) {
    const weeks = Math.floor(diffInDays / 7);
    return t('date.weeksAgo', { count: weeks });
  } else if (diffInDays < 365) {
    const months = Math.floor(diffInDays / 30);
    return t('date.monthsAgo', { count: months });
  } else {
    const years = Math.floor(diffInDays / 365);
    return t('date.yearsAgo', { count: years });
  }
};

export default {
  formatCurrencyUSD,
  formatCurrencyLocalized,
  formatCurrency,
  formatDate,
  formatDateRelative,
  formatDateRelativeLocalized,
  formatDateTime,
  formatPhoneIQ,
  formatPercentage,
  formatWeight,
  formatDimensions,
  formatDistance,
  roundIQD,
  convertUSDToIQD,
  formatCurrencyIQD,
  formatPrice,
};
