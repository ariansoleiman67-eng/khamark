import { supabase } from './supabase';

export async function safeCallFunction(
  functionName: string,
  requestData: any = {}
): Promise<{ data: any }> {
  try {
    const { data, error } = await supabase.functions.invoke(functionName, {
      body: { data: requestData }
    });

    if (error) {
      // Read the SERVER'S reason before rethrowing.
      //
      // supabase-js hardcodes FunctionsHttpError's message to the constant
      // "Edge Function returned a non-2xx status code" — identical for 400, 403,
      // 404 and 500 — and the actual reason sits unread in the response body. The
      // shop hit a 403 from verifyAdminActionPassword and saw only that constant,
      // which is why the real cause took a full investigation to find instead of
      // being legible from the alert on screen.
      let reason: string | null = null;
      try {
        const detail = await (error as { context?: { json?: () => Promise<any> } })?.context?.json?.();
        const raw = detail?.error || detail?.message;
        if (typeof raw === 'string' && raw.trim()) reason = raw.trim();
      } catch {
        // Body absent, already consumed, or not JSON. Keep the original error
        // rather than replacing a poor message with no message.
      }

      if (reason) {
        const enriched = new Error(reason);
        enriched.name = error.name;
        throw enriched;
      }
      throw error;
    }

    return { data };
  } catch (error: any) {
    if (error.message?.includes('Failed to fetch') || error.message?.includes('Network request failed')) {
      throw new Error('Network error. Please check your connection.');
    }
    throw error;
  }
}
