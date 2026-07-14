/**
 * QiCard Payment Service
 * 
 * Client-side service for initiating and managing QiCard payments.
 * Communicates with Supabase Edge Functions which handle the actual
 * QiCard API calls (credentials stay server-side).
 */

import { supabase } from './supabase';

export interface QiCardPaymentResult {
  paymentId: string;
  requestId: string;
  formUrl: string;
  status: string;
  amount: number;
  currency: string;
}

export interface QiCardStatusResult {
  paymentId: string;
  requestId: string;
  status: 'SUCCESS' | 'FAILED' | 'CREATED' | 'AUTHENTICATION_FAILED';
  canceled: boolean;
  amount: number;
  currency: string;
  creationDate: string;
}

export class QiCardPaymentService {
  /**
   * Initiate a QiCard payment for an existing order.
   * Calls the create-qicard-payment Edge Function which creates the payment
   * in the QiCard gateway and returns the formUrl for the WebView.
   */
  static async initiatePayment(
    orderId: string,
    amountIQD: number,
    customerInfo?: {
      firstName?: string;
      lastName?: string;
      phone?: string;
      email?: string;
      accountId?: string;
    },
    tokenOptions?: {
      needPaymentToken?: boolean;
      paymentToken?: string;
      accountId?: string;
    },
    locale?: string,
  ): Promise<QiCardPaymentResult> {
    try {
      const { data, error } = await supabase.functions.invoke('create-qicard-payment', {
        body: {
          orderId,
          amountIQD,
          customerInfo: customerInfo || undefined,
          ...(tokenOptions || {}),
          locale,
        },
      });

      if (error) {
        console.error('QiCard initiatePayment error:', error);
        throw new Error(error.message || 'Failed to create payment');
      }

      // If tokenOptions.paymentToken is provided, QiCard may instantly return SUCCESS
      // without needing authentication/formUrl!
      // So we should not throw error if formUrl is missing in that specific case.
      if (!data?.formUrl && !data?.paymentId && !tokenOptions?.paymentToken) {
        throw new Error(data?.error || 'Invalid payment response');
      }

      return data as QiCardPaymentResult;
    } catch (err: any) {
      if (err.message?.includes('Failed to fetch') || err.message?.includes('Network request failed')) {
        throw new Error('Network error. Please check your connection and try again.');
      }
      throw err;
    }
  }

  /**
   * Check the current status of a QiCard payment.
   * Calls the check-qicard-status Edge Function which queries the QiCard API
   * and also syncs the status back to our order in Supabase.
   */
  static async checkStatus(paymentId: string): Promise<QiCardStatusResult> {
    try {
      const { data, error } = await supabase.functions.invoke('check-qicard-status', {
        body: { paymentId },
      });

      if (error) {
        console.error('QiCard checkStatus error:', error);
        throw new Error(error.message || 'Failed to check payment status');
      }

      if (!data?.status) {
        throw new Error(data?.error || 'Invalid status response');
      }

      return data as QiCardStatusResult;
    } catch (err: any) {
      if (err.message?.includes('Failed to fetch') || err.message?.includes('Network request failed')) {
        throw new Error('Network error. Please check your connection.');
      }
      throw err;
    }
  }

  /**
   * Poll for payment status with exponential backoff.
   * Keeps checking until status is SUCCESS, FAILED, or timeout.
   * 
   * @param paymentId - The QiCard payment ID
   * @param maxAttempts - Maximum number of polling attempts (default: 10)
   * @param initialDelayMs - Initial delay between polls (default: 2000ms)
   * @returns The final payment status
   */
  static async pollForCompletion(
    paymentId: string,
    maxAttempts = 10,
    initialDelayMs = 2000
  ): Promise<QiCardStatusResult> {
    let attempt = 0;
    let delay = initialDelayMs;

    while (attempt < maxAttempts) {
      attempt++;

      try {
        const result = await this.checkStatus(paymentId);

        // Terminal states — stop polling. A user-canceled payment is terminal
        // too (QiCard reports it via the `canceled` flag while status stays
        // CREATED), so surface it immediately instead of spinning to timeout.
        if (
          result.status === 'SUCCESS' ||
          result.status === 'FAILED' ||
          result.status === 'AUTHENTICATION_FAILED' ||
          result.canceled === true
        ) {
          return result;
        }

        // Non-terminal (CREATED) — wait and retry
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, delay));
          delay = Math.min(delay * 1.5, 8000); // Cap at 8s
        }
      } catch (err) {
        // On network error, keep trying
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, delay));
          delay = Math.min(delay * 1.5, 8000);
        } else {
          throw err;
        }
      }
    }

    // Timeout — return last known status
    throw new Error('Payment status check timed out. Please check your order status later.');
  }

  /**
   * Convert USD amount to IQD using the provided exchange rate.
   */
  static convertToIQD(amountUSD: number, exchangeRate: number): number {
    return Math.round(amountUSD * exchangeRate);
  }
}
