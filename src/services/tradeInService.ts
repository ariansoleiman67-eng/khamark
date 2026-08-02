// Trade-in requests. RLS (supabase/migrations/20260801120000_trade_in_requests.sql) is the
// real gatekeeper: a customer can only insert a 'submitted' row with null offer fields, and
// can only move their own row to accepted/declined/cancelled from submitted/quoted. This
// service does not re-check any of that — it just shapes the calls so RLS accepts them.
import { supabase } from './supabase';
import { TRADE_IN_QUESTIONS_VERSION } from '../constants/tradeInQuestions';
import { APP_CONFIG } from '../constants/config';
import { TradeInRequest, TradeInStatus } from '../types';

// Map a Supabase `trade_in_requests` row (snake_case) to the camelCase domain type.
const mapRow = (r: any): TradeInRequest => ({
  id: r.id,
  tenantId: r.tenant_id,
  userId: r.user_id ?? undefined,
  contactName: r.contact_name,
  contactPhone: r.contact_phone,
  deviceBrand: r.device_brand,
  deviceModel: r.device_model,
  storage: r.storage ?? undefined,
  questionsVersion: r.questions_version ?? 1,
  answers: r.answers || {},
  photos: r.photos || [],
  customerNote: r.customer_note ?? undefined,
  status: r.status,
  offerUSD: r.offer_usd != null ? Number(r.offer_usd) : undefined,
  offerNote: r.offer_note ?? undefined,
  offerType: r.offer_type ?? undefined,
  reviewedBy: r.reviewed_by ?? undefined,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  quotedAt: r.quoted_at ?? undefined,
});

export interface CreateTradeInInput {
  tenantId: string;
  userId: string;
  contactName: string;
  contactPhone: string;
  deviceBrand: string;
  deviceModel: string;
  storage?: string;
  answers: Record<string, string>;
  photos: string[];
  customerNote?: string;
}

// Which shop a customer's trade-in goes to.
//
// useTenant() only resolves for admins (TenantContext.tsx:97 nulls it for anyone
// who is not isAdmin), so the customer side has no tenant id at all. This app runs
// a single live shop, so the tenant is discoverable: take the configured id when
// one is set, otherwise look up the only active tenant. Returning null when the
// answer is ambiguous is deliberate — guessing which shop receives a phone someone
// wants to sell is worse than telling them we cannot take the request right now.
//
// Selects owner_id, not id: tenants.id is an independently generated uuid
// (`default gen_random_uuid()`) with nothing in the schema — no FK, trigger, or
// generated column — tying it to the owning admin. Every tenant_id column in this
// schema, trade_in_requests included, is a foreign key to users(id), and RLS
// compares it to auth.uid() (the admin's USER id, i.e. tenants.owner_id). Selecting
// `id` here would silently write a tenant_id no admin's RLS policy ever matches —
// the request would insert fine and then never appear in any inbox.
// storeProfileService.getMyTenantId() has to look up a tenant row BY owner_id for
// exactly this reason: the two columns are not interchangeable.
//
// No caching: the query is one indexed row read, run once per screen open. A
// cached value would keep routing submissions to a tenant after it's deactivated
// or after a second one goes active, with nothing to ever invalidate it.
export const resolveShopTenantId = async (): Promise<string | null> => {
  if (APP_CONFIG.DEFAULT_TENANT_ID) return APP_CONFIG.DEFAULT_TENANT_ID;

  const { data, error } = await supabase
    .from('tenants')
    .select('owner_id')
    .eq('is_active', true)
    .not('owner_id', 'is', null)
    .limit(2);
  if (error) return null;
  // Exactly one, or we cannot tell which shop the customer means.
  if ((data || []).length !== 1) return null;

  return data![0].owner_id;
};

export const tradeInService = {
  async createRequest(input: CreateTradeInInput): Promise<TradeInRequest> {
    const { data, error } = await supabase
      .from('trade_in_requests')
      .insert({
        tenant_id: input.tenantId,
        user_id: input.userId,
        contact_name: input.contactName,
        contact_phone: input.contactPhone,
        device_brand: input.deviceBrand,
        device_model: input.deviceModel,
        storage: input.storage?.trim() || null,
        questions_version: TRADE_IN_QUESTIONS_VERSION,
        answers: input.answers,
        photos: input.photos,
        customer_note: input.customerNote?.trim() || null,
      })
      .select()
      .single();
    if (error) throw error;
    return mapRow(data);
  },

  async getMyRequests(userId: string): Promise<TradeInRequest[]> {
    const { data, error } = await supabase
      .from('trade_in_requests')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(mapRow);
  },

  async getTenantRequests(tenantId: string, status?: TradeInStatus): Promise<TradeInRequest[]> {
    let q = supabase
      .from('trade_in_requests')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw error;
    return (data || []).map(mapRow);
  },

  /**
   * Conditional on status still being 'submitted', so two admins quoting the same
   * request at once cannot silently overwrite each other. Returns false when the
   * request was already quoted by someone else.
   */
  async sendQuote(
    id: string,
    offerUsd: number,
    offerNote: string,
    reviewedBy: string
  ): Promise<boolean> {
    const { data, error } = await supabase
      .from('trade_in_requests')
      .update({
        offer_usd: offerUsd,
        offer_note: offerNote.trim() || null,
        offer_type: 'cash',
        status: 'quoted',
        reviewed_by: reviewedBy,
        quoted_at: new Date().toISOString(),
      })
      .eq('id', id)
      // Belt and braces alongside RLS. The owner admin IS the tenant in this schema,
      // so reviewedBy is the tenant id — scoping the write here means a bug in a
      // caller cannot reach another shop's row even if a policy were ever loosened.
      // brandService.deleteBrand carries the same defence for the same reason.
      .eq('tenant_id', reviewedBy)
      .eq('status', 'submitted')
      .select('id');
    if (error) throw error;
    return (data || []).length > 0;
  },

  /**
   * Returns false when the update matched no row.
   *
   * trade_in_update_own's USING clause is evaluated against the OLD row, so a
   * customer accepting a request the admin has already moved past 'quoted' is
   * filtered out silently — zero rows changed, and `error` is null. Returning void
   * would show that customer a successful "Accepted" for something that never
   * happened.
   */
  async setStatus(id: string, status: TradeInStatus): Promise<boolean> {
    const { data, error } = await supabase
      .from('trade_in_requests')
      .update({ status })
      .eq('id', id)
      .select('id');
    if (error) throw error;
    return (data || []).length > 0;
  },
};
