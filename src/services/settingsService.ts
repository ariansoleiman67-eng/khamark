import { supabase } from './supabase';
import { BusinessInfo, OperatingHours } from '../types';

export type OperatingHoursRead =
  | { status: 'configured'; hours: OperatingHours }
  | { status: 'unconfigured' }
  | { status: 'unavailable' };

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

  /**
   * Row id for a store's schedule.
   *
   * global_settings is keyed by a free-text id, so per-store hours need no schema
   * change — just a per-tenant row. Previously every store read and wrote the one
   * `operating_hours` row, so one shop saving "Friday closed" applied it to every
   * shop in the app.
   *
   * With no tenantId the legacy shared row is used, which is also what a read falls
   * back to when a store has not saved its own schedule yet — otherwise this change
   * would blank the hours of the shop already running on the shared row.
   */
  private hoursDocId(tenantId?: string | null): string {
    return tenantId ? `${this.OPERATING_HOURS_DOC}:${tenantId}` : this.OPERATING_HOURS_DOC;
  }

  async getOperatingHours(tenantId?: string | null): Promise<OperatingHours | null> {
    try {
      const { data, error } = await supabase.from('global_settings').select('data').eq('id', this.hoursDocId(tenantId)).single();
      // No row for this store yet: fall back to the legacy shared row so a shop that
      // configured its hours before per-store scoping keeps showing them.
      if (error && (error as any).code === 'PGRST116' && tenantId) {
        return await this.getOperatingHours(null);
      }
      // Only a genuine "no rows" (PGRST116) means hours were never configured. A transient
      // read failure returned as null is indistinguishable from that, so the editor falls back
      // to the Mon-Fri 09:00-18:00 defaults and Save then overwrites the real schedule with them.
      if (error) {
        if ((error as any).code === 'PGRST116') return null;
        throw error;
      }
      if (!data) return null;
      return data.data as OperatingHours;
    } catch (error) {
      console.error('Error fetching operating hours:', error);
      throw error;
    }
  }

  // Keyed by store: a single field served one tenant's schedule to another.
  private lastGoodHours = new Map<string, OperatingHours>();

  /**
   * Read helper for the customer-facing open/closed badge. It keeps "the shop never
   * configured hours" ('unconfigured') apart from "we could not read them"
   * ('unavailable'): collapsing the two makes a transient network/RLS failure look like
   * an unconfigured shop, and the badge then silently claims the generic 08:00-18:00
   * schedule instead of the owner's real one. Only successful reads are cached, so a
   * failure keeps serving the last schedule we actually saw rather than degrading.
   */
  async getOperatingHoursForDisplay(tenantId?: string | null): Promise<OperatingHoursRead> {
    const cacheKey = this.hoursDocId(tenantId);
    try {
      const hours = await this.getOperatingHours(tenantId);
      if (hours) {
        this.lastGoodHours.set(cacheKey, hours);
        return { status: 'configured', hours };
      }
      this.lastGoodHours.delete(cacheKey);
      return { status: 'unconfigured' };
    } catch {
      const cached = this.lastGoodHours.get(cacheKey);
      if (cached) return { status: 'configured', hours: cached };
      return { status: 'unavailable' };
    }
  }

  async updateOperatingHours(hours: Partial<OperatingHours>, tenantId?: string | null): Promise<void> {
    try {
      const docId = this.hoursDocId(tenantId);
      // Seed from the store's own row, or from the legacy shared row the first time
      // this store saves, so a partial update does not drop the untouched days.
      const { data: existingData } = await supabase.from('global_settings').select('data').eq('id', docId).single();
      const seed = existingData?.data
        || (tenantId ? (await supabase.from('global_settings').select('data').eq('id', this.OPERATING_HOURS_DOC).single()).data?.data : null)
        || {};
      const newData = { ...seed, ...hours, updatedAt: new Date().toISOString() };

      this.lastGoodHours.delete(docId);

      const { error } = await supabase.from('global_settings').upsert({
        id: docId,
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
