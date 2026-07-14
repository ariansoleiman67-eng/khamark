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
