import type { Timestamp } from '../types';

type AnyTimestamp = Timestamp | Date;

/**
 * Converts a Firebase Timestamp to a JavaScript Date
 */
export const timestampToDate = (timestamp: AnyTimestamp): Date => {
  if (timestamp instanceof Date) {
    return timestamp;
  }
  
  if (timestamp && typeof (timestamp as any).toDate === 'function') {
    return (timestamp as Timestamp).toDate();
  }
  
  // Fallback for malformed data
  return new Date();
};

/**
 * Safely gets the time from a Timestamp or Date
 */
export const getTimeFromTimestamp = (timestamp: AnyTimestamp | string | number | null | undefined): number => {
  if (!timestamp) return 0;
  
  if (timestamp instanceof Date) {
    return timestamp.getTime();
  }
  
  if (typeof timestamp === 'number') {
    // Handle epoch seconds vs milliseconds
    return timestamp > 1e12 ? timestamp : timestamp * 1000;
  }
  
  if (typeof timestamp === 'string') {
    const parsed = Date.parse(timestamp);
    return isNaN(parsed) ? 0 : parsed;
  }
  
  if (typeof (timestamp as any).toDate === 'function') {
    return (timestamp as Timestamp).toDate().getTime();
  }
  
  // Handle Firestore Timestamp-like objects with _seconds
  if (typeof (timestamp as any)._seconds === 'number') {
    return (timestamp as any)._seconds * 1000;
  }
  
  return 0;
};
