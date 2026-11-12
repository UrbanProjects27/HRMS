import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = request.headers.get("Authorization");
  if (!url || !anonKey || !serviceKey || !authorization) return json({ error: "Unauthorized" }, 401);

  const caller = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: identity, error: identityError } = await caller.auth.getUser();
  if (identityError || !identity.user) return json({ error: "Unauthorized" }, 401);

  const body = await request.json();
  const leaveRequestId = String(body.leaveRequestId ?? "");
  const decision = String(body.decision ?? "").toLowerCase();
  if (!leaveRequestId || !["approved", "rejected"].includes(decision)) return json({ error: "A valid leave request and decision are required" }, 400);

  const [{ data: profile }, { data: callerEmployee }, { data: leaveRequest, error: requestError }] = await Promise.all([
    admin.from("profiles").select("role").eq("id", identity.user.id).single(),
    admin.from("employees").select("id").eq("profile_id", identity.user.id).maybeSingle(),
    admin.from("leave_requests").select("id,employee_id,leave_type_id,days,status").eq("id", leaveRequestId).maybeSingle(),
  ]);
  if (requestError || !leaveRequest) return json({ error: requestError?.message ?? "Leave request was not found" }, 404);
  if (leaveRequest.status !== "pending") return json({ error: "This leave request has already been reviewed" }, 409);

  const { data: targetEmployee } = await admin.from("employees").select("reporting_manager_id").eq("id", leaveRequest.employee_id).single();
  const isAdmin = profile?.role === "admin";
  const isAssignedManager = Boolean(callerEmployee?.id && targetEmployee?.reporting_manager_id === callerEmployee.id);
  if (!isAdmin && !isAssignedManager) return json({ error: "Only the assigned reporting manager can review this leave request" }, 403);

  const { error: updateError } = await admin.from("leave_requests").update({ status: decision, reviewed_by: identity.user.id }).eq("id", leaveRequestId).eq("status", "pending");
  if (updateError) return json({ error: updateError.message }, 400);

  if (decision === "approved") {
    const year = new Date().getUTCFullYear();
    const { data: balance, error: balanceError } = await admin.from("leave_balances").select("id,used").eq("employee_id", leaveRequest.employee_id).eq("leave_type_id", leaveRequest.leave_type_id).eq("balance_year", year).maybeSingle();
    if (balanceError) return json({ error: balanceError.message }, 400);
    if (balance) {
      const { error: usedError } = await admin.from("leave_balances").update({ used: Number(balance.used) + Number(leaveRequest.days), updated_by: identity.user.id }).eq("id", balance.id);
      if (usedError) return json({ error: usedError.message }, 400);
    }
  }

  return json({ ok: true, decision });
});
