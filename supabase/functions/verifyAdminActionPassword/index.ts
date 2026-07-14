// =============================================================================
// Supabase Edge Function: verifyAdminActionPassword
// =============================================================================
// Gates sensitive admin actions (change a customer's role, block/unblock a user)
// behind the master "admin action password". Replaces the Firebase function.
//
// The password is read from global_settings(id='security').data.adminActionPassword,
// falling back to the ADMIN_ACTION_PASSWORD env, then '1990'.
//
// Deploy:  supabase functions deploy verifyAdminActionPassword --no-verify-jwt
//
// Request (via safeCallFunction): { data: { password, action, targetUserId?, newRole?, isBlocked? } }
//   action ∈ 'assign_vip_role' | 'toggle_user_block' | 'unlock_wholesale_settings'
// Response: { success, message, actionResult }  (4xx on bad password / args)
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req: Request) => {
  const json = (p: unknown, status = 200) =>
    new Response(JSON.stringify(p), { status, headers: { 'Content-Type': 'application/json' } });

  try {
    const body = await req.json().catch(() => ({}));
    const payload = body?.data ?? body ?? {};
    const { password, action, targetUserId, newRole, isBlocked } = payload;
    if (!password || !action) return json({ error: 'Missing required fields' }, 400);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Validate the admin action password.
    const { data: sec } = await supabase.from('global_settings').select('data').eq('id', 'security').maybeSingle();
    const validPassword = sec?.data?.adminActionPassword || Deno.env.get('ADMIN_ACTION_PASSWORD') || '1990';
    if (String(password) !== String(validPassword)) {
      return json({ error: 'Invalid authorization password' }, 403);
    }

    let actionResult = 'Action authorized';

    if (action === 'assign_vip_role') {
      if (!targetUserId || !['customer', 'vip'].includes(newRole)) return json({ error: 'Invalid role or target' }, 400);
      const { error } = await supabase.from('users').update({ role: newRole }).eq('id', targetUserId);
      if (error) return json({ error: error.message }, 500);
      actionResult = `Role updated to ${newRole}`;
    } else if (action === 'toggle_user_block') {
      if (!targetUserId || typeof isBlocked !== 'boolean') return json({ error: 'Missing target or isBlocked' }, 400);
      const { error } = await supabase.from('users').update({ is_blocked: isBlocked }).eq('id', targetUserId);
      if (error) return json({ error: error.message }, 500);
      actionResult = `User ${isBlocked ? 'blocked' : 'unblocked'}`;
    } else if (action === 'unlock_wholesale_settings') {
      actionResult = 'Settings unlocked';
    } else {
      return json({ error: 'Unknown secure action' }, 400);
    }

    return json({ success: true, message: 'Action authorized', actionResult });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
