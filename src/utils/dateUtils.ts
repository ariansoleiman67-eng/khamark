import type { Timestamp } from '../types';

type AnyTimestamp = Timestamp | Date | { seconds: number } | number | string | null | undefined;

/**
 * Safely format a Firestore timestamp to a readable date string
 */
export const formatFirestoreDate = (
  timestamp: AnyTimestamp, 
  locale: string = 'en-US', 
  options?: Intl.DateTimeFormatOptions
): string => {
  try {
    let date: Date;

    // Handle different timestamp formats
    if (!timestamp) {
      return 'Invalid date';
    }

    // If it's already a Date object
    if (timestamp instanceof Date) {
      date = timestamp;
    }
    // If it's a Firestore Timestamp
    else if ((timestamp as any)?.toDate && typeof (timestamp as any).toDate === 'function') {
      date = (timestamp as Timestamp).toDate();
    }
    // If it's a timestamp object with seconds property
    else if ((timestamp as any)?.seconds) {
      date = new Date((timestamp as any).seconds * 1000);
    }
    // If it's a regular timestamp number
    else if (typeof timestamp === 'number') {
      date = new Date(timestamp);
    }
    // If it's a string
    else if (typeof timestamp === 'string') {
      date = new Date(timestamp);
    }
    else {
      console.warn('Unknown timestamp format:', timestamp);
      return 'Invalid date';
    }

    // Check if the date is valid
    if (isNaN(date.getTime())) {
      console.warn('Invalid date created from timestamp:', timestamp);
      return 'Invalid date';
    }

    const defaultOptions: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      ...options,
    };

    return date.toLocaleDateString(locale, defaultOptions);
  } catch (error) {
    console.error('Error formatting date:', error, 'Timestamp:', timestamp);
    return 'Invalid date';
  }
};

/**
 * Format date and time
 */
export const formatFirestoreDateTime = (
  timestamp: AnyTimestamp, 
  locale: string = 'en-US'
): string => {
  return formatFirestoreDate(timestamp, locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * Format date in a short format
 */
export const formatFirestoreDateShort = (
  timestamp: AnyTimestamp, 
  locale: string = 'en-US'
): string => {
  return formatFirestoreDate(timestamp, locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

/**
 * Get relative time (e.g., "2 days ago")
 */
export const getRelativeTime = (timestamp: AnyTimestamp, locale: string = 'en-US'): string => {
  try {
    let date: Date;

    if (!timestamp) {
      return 'Unknown time';
    }

    // Handle different timestamp formats (same as above)
    if (timestamp instanceof Date) {
      date = timestamp;
    } else if ((timestamp as any)?.toDate && typeof (timestamp as any).toDate === 'function') {
      date = (timestamp as Timestamp).toDate();
    } else if ((timestamp as any)?.seconds) {
      date = new Date((timestamp as any).seconds * 1000);
    } else if (typeof timestamp === 'number') {
      date = new Date(timestamp);
    } else if (typeof timestamp === 'string') {
      date = new Date(timestamp);
    } else {
      return 'Unknown time';
    }

    if (isNaN(date.getTime())) {
      return 'Unknown time';
    }

    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    const diffInHours = Math.floor(diffInMinutes / 60);
    const diffInDays = Math.floor(diffInHours / 24);

    if (diffInSeconds < 60) {
      return 'Just now';
    } else if (diffInMinutes < 60) {
      return `${diffInMinutes} ${diffInMinutes === 1 ? 'minute' : 'minutes'} ago`;
    } else if (diffInHours < 24) {
      return `${diffInHours} ${diffInHours === 1 ? 'hour' : 'hours'} ago`;
    } else if (diffInDays < 7) {
      return `${diffInDays} ${diffInDays === 1 ? 'day' : 'days'} ago`;
    } else {
      return formatFirestoreDateShort(timestamp, locale);
    }
  } catch (error) {
    console.error('Error calculating relative time:', error);
    return 'Unknown time';
  }
};

/**
 * Check if a timestamp is today
 */
export const isToday = (timestamp: AnyTimestamp): boolean => {
  try {
    let date: Date;

    if (timestamp instanceof Date) {
      date = timestamp;
    } else if ((timestamp as any)?.toDate) {
      date = (timestamp as Timestamp).toDate();
    } else if ((timestamp as any)?.seconds) {
      date = new Date((timestamp as any).seconds * 1000);
    } else {
      return false;
    }

    const today = new Date();
    return date.toDateString() === today.toDateString();
  } catch {
    return false;
  }
};

/**
 * Format delivery date estimate
 */
export const formatDeliveryEstimate = (timestamp: AnyTimestamp, locale: string = 'en-US'): string => {
  try {
    const date = formatFirestoreDate(timestamp, locale, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
    return date;
  } catch {
    return 'Date to be confirmed';
  }
};