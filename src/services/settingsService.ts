import { supabase } from './supabase';
import { BusinessInfo, OperatingHours } from '../types';

class SettingsService {
  private readonly BUSINESS_INFO_DOC = 'business_info';

  async getBusinessInfo(): Promise<BusinessInfo | null> {
    try {
      const { data, error } = await supabase.from('global_settings').select('data').eq('id', this.BUSINESS_INFO_DOC).single();
      if (error || !data) return null;
      return data.data as BusinessInfo;
    } catch (error) {
      console.error('Error fetching business info:', error);
      throw error;
    }
  }

  async updateBusinessInfo(info: Partial<BusinessInfo>): Promise<void> {
    try {
      const { data: existingData } = await supabase.from('global_settings').select('data').eq('id', this.BUSINESS_INFO_DOC).single();
      const newData = { ...(existingData?.data || {}), ...info, updatedAt: new Date().toISOString() };
      
      const { error } = await supabase.from('global_settings').upsert({
        id: this.BUSINESS_INFO_DOC,
        data: newData,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });
      
      if (error) throw error;
    } catch (error) {
      console.error('Error updating business info:', error);
      throw error;
    }
  }

  private readonly OPERATING_HOURS_DOC = 'operating_hours';

  async getOperatingHours(): Promise<OperatingHours | null> {
    try {
      const { data, error } = await supabase.from('global_settings').select('data').eq('id', this.OPERATING_HOURS_DOC).single();
      if (error || !data) return null;
      return data.data as OperatingHours;
    } catch (error) {
      console.error('Error fetching operating hours:', error);
      throw error;
    }
  }

  async updateOperatingHours(hours: Partial<OperatingHours>): Promise<void> {
    try {
      const { data: existingData } = await supabase.from('global_settings').select('data').eq('id', this.OPERATING_HOURS_DOC).single();
      const newData = { ...(existingData?.data || {}), ...hours, updatedAt: new Date().toISOString() };
      
      const { error } = await supabase.from('global_settings').upsert({
        id: this.OPERATING_HOURS_DOC,
        data: newData,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });
      
      if (error) throw error;
    } catch (error) {
      console.error('Error updating operating hours:', error);
      throw error;
    }
  }
}

export default new SettingsService();
