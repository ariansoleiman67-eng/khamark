// =============================================================================
// Supabase Edge Function: verifyAdminActionPassword
// =============================================================================
// Gate for the three back-office actions that change another account:
//   assign_vip_role         — set users.role to 'vip' or 'customer'
//   toggle_user_block       — set users.is_blocked
//   unlock_wholesale_settings — no write; unlocks a screen
//
// SECURITY SHAPE, and why it is not just a password check:
//
// This function runs on the SERVICE ROLE key, so every write it makes bypasses
// RLS. The only credential the app itself carries is the anon key, and that ships
// inside the binary — anyone who installs the app has it. So the action password
// alone cannot be the barrier: it defaults to '1990' and is shared by the whole
// shop. The caller's own session is checked FIRST, and must belong to an admin.
//
// Request (via safeCallFunction): { data: { password, action, targetUserId?, newRole?, isBlocked? } }
// Response: 200 { success, actionResult } | 4xx { error }
//
// HISTORY worth knowing before editing:
//
// The build previously live on this project was not this file — it came from the
// HAryad fork, and it carried an extra gate: the target had to have an order
// whose `orders.tenant_id` equalled the caller's id. That is correct for HAryad
// and impossible here. Asankary writes customer orders with
// `tenant_id: cartItems[0]?.tenantId || null` (OrderService.ts:188) and `CartItem`
// has no `tenantId` field, so the column is NULL on every customer order. The
// count was therefore always zero and every "Make VIP" returned
// 403 "This customer has no orders with your store" — which the app rendered as a
// meaningless generic error, because supabase-js hardcodes its message.
//
// That gate is deliberately NOT reproduced. It is not dropped to make the error
// go away: it cannot be satisfied by any row this project creates. If Asankary
// ever needs real per-store customer scoping, it needs a customer-to-tenant link
// (a column on `users`, or a `tenant_customers` table) — not an orders count.
//
// SETUP:
//   supabase secrets set ADMIN_ACTION_PASSWORD="..."   # optional; DB value wins
//   supabase functions deploy verifyAdminActionPassword
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req: Request) => {
  const json = (p: unknown, status = 200) =>
    new Response(JSON.stringify(p), { status, headers: { 'Content-Type': 'application/json' } });

  try {
    const body = await req.json().catch(() => ({}));
    const payload = body?.data ?? body ?? {};
    const { password, action, targetUserId, newRole, isBlocked } = payload;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // -- 1. WHO IS CALLING ----------------------------------------------------
    // Before anything else, and before the password is even read. A service-role
    // endpoint reachable with only the anon key is world-writable.
    const authHeader = req.headers.get('Authorization') || '';
    const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!jwt) return json({ error: 'Authentication required' }, 401);

    const { data: authData, error: authErr } = await supabase.auth.getUser(jwt);
    const caller = authData?.user;
    if (authErr || !caller) return json({ error: 'Authentication required' }, 401);

    // The anon key is itself a valid JWT. Reject it explicitly rather than
    // relying on getUser failing, so the check cannot be weakened by a library
    // change.
    const { data: callerRow } = await supabase
      .from('users')
      .select('id, is_admin, role, is_partner')
      .eq('id', caller.id)
      .maybeSingle();

    const callerIsStaff =
      callerRow?.is_admin === true ||
      callerRow?.role === 'admin' ||
      callerRow?.is_partner === true;
    if (!callerIsStaff) return json({ error: 'Not authorized' }, 403);

    // -- 2. THE ACTION PASSWORD ----------------------------------------------
    // A second factor, not the first. Shared across the shop and defaulting to
    // '1990', so it is only meaningful behind the caller check above.
    if (!password || !action) return json({ error: 'Missing required fields' }, 400);

    const { data: sec } = await supabase
      .from('global_settings')
      .select('data')
      .eq('id', 'security')
      .maybeSingle();
    const validPassword =
      sec?.data?.adminActionPassword || Deno.env.get('ADMIN_ACTION_PASSWORD') || '1990';
    if (String(password) !== String(validPassword)) {
      return json({ error: 'Invalid authorization password' }, 403);
    }

    // -- 3. THE TARGET --------------------------------------------------------
    // An admin may change customers, never other staff. Without this, any admin
    // could demote or block every other admin, including the owner.
    const guardTarget = async () => {
      if (!targetUserId) return json({ error: 'Missing target' }, 400);
      if (targetUserId === caller.id) return json({ error: 'Cannot change your own account' }, 403);
      const { data: target } = await supabase
        .from('users')
        .select('id, is_admin, role, is_partner')
        .eq('id', targetUserId)
        .maybeSingle();
      if (!target) return json({ error: 'User not found' }, 404);
      if (target.is_admin === true || target.role === 'admin' || target.is_partner === true) {
        return json({ error: 'Not authorized for this user' }, 403);
      }
      return null;
    };

    let actionResult = 'Action authorized';

    if (action === 'assign_vip_role') {
      if (!['customer', 'vip'].includes(newRole)) return json({ error: 'Invalid role' }, 400);
      const rejected = await guardTarget();
      if (rejected) return rejected;
      const { error } = await supabase.from('users').update({ role: newRole }).eq('id', targetUserId);
      if (error) return json({ error: error.message }, 500);
      actionResult = `Role updated to ${newRole}`;
    } else if (action === 'toggle_user_block') {
      if (typeof isBlocked !== 'boolean') return json({ error: 'Missing isBlocked' }, 400);
      const rejected = await guardTarget();
      if (rejected) return rejected;
      const { error } = await supabase
        .from('users')
        .update({ is_blocked: isBlocked })
        .eq('id', targetUserId);
      if (error) return json({ error: error.message }, 500);
      actionResult = isBlocked ? 'User blocked' : 'User unblocked';
    } else if (action === 'unlock_wholesale_settings') {
      // No write. The password gate is the whole point.
      actionResult = 'Wholesale settings unlocked';
    } else {
      return json({ error: 'Unknown action' }, 400);
    }

    return json({ success: true, actionResult }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: message }, 500);
  }
});
