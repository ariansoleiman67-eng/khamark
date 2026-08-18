import { supabase } from './supabase';

/**
 * WHICH RELATION THE BACK OFFICE READS PRODUCTS FROM.
 *
 * `parts.purchase_price` is the shop's cost. Migration
 * 20260819090000_parts_cost_server_side.sql revokes it from `authenticated` —
 * every signed-in account could read the margin on the whole catalogue — and
 * republishes it through `public.parts_admin`, a view that returns cost only to
 * the row's owner, a partner it is shared with, or a system admin.
 *
 * Once that revoke lands, `select('*')` on `parts` FAILS for the admin too,
 * because Postgres requires the privilege on every column `*` expands to. So the
 * back office's own reads move to the view.
 *
 * THE FALLBACK IS DELIBERATE. This app ships as an APK/IPA that can be running on
 * a phone for weeks before anyone applies a migration, and the back office must
 * not break in the window between a build going out and the SQL being run. So a
 * failure that looks like "the view is not there yet" falls back to `parts`,
 * which still works while the old grant is in place. When the migration IS
 * applied the fallback stops being reachable, because the view exists and the
 * fallback's own query would fail.
 */
const MISSING_RELATION = /does not exist|not find the table|schema cache|PGRST205/i;

let viewMissing = false;

export async function selectAdminParts<T = any>(
  columns: string,
  apply?: (query: any) => any,
): Promise<{ data: T[] | null; error: any }> {
  if (!viewMissing) {
    let q = supabase.from('parts_admin').select(columns);
    if (apply) q = apply(q);
    const res = await q;
    if (!res.error) return res as unknown as { data: T[] | null; error: any };
    if (!MISSING_RELATION.test(res.error?.message || '')) {
      return res as unknown as { data: T[] | null; error: any };
    }
    // Remembered, so one missing view does not cost every later read a round trip.
    viewMissing = true;
  }

  let q = supabase.from('parts').select(columns);
  if (apply) q = apply(q);
  return (await q) as unknown as { data: T[] | null; error: any };
}
