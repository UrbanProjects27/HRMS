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
  const attendanceId = String(body.attendanceId ?? "");
  const decision = String(body.decision ?? "").toLowerCase();
  if (!attendanceId || !["approved", "rejected"].includes(decision)) return json({ error: "A valid attendance record and decision are required" }, 400);

  const [{ data: profile }, { data: callerEmployee }, { data: attendance, error: attendanceError }] = await Promise.all([
    admin.from("profiles").select("role").eq("id", identity.user.id).single(),
    admin.from("employees").select("id").eq("profile_id", identity.user.id).maybeSingle(),
    admin.from("attendance").select("id,employee_id,approval_status,is_regularization,working_hours").eq("id", attendanceId).maybeSingle(),
  ]);
  if (attendanceError || !attendance) return json({ error: attendanceError?.message ?? "Attendance record was not found" }, 404);
  if (!attendance.is_regularization) return json({ error: "Direct check-in and check-out attendance does not require approval" }, 400);
  const { data: targetEmployee } = await admin.from("employees").select("reporting_manager_id").eq("id", attendance.employee_id).single();
  const isAdmin = profile?.role === "admin";
  const isAssignedManager = Boolean(callerEmployee?.id && targetEmployee?.reporting_manager_id === callerEmployee.id);
  if (!isAdmin && !isAssignedManager) return json({ error: "Only the assigned reporting manager can review this attendance" }, 403);

  const hours = Number(attendance.working_hours ?? 0);
  const attendanceStatus = hours > 8 ? "present" : hours >= 4 ? "half_day" : "absent";
  const { error: updateError } = await admin.from("attendance").update({ approval_status: decision, approved_by: identity.user.id, ...(decision === "approved" ? { attendance_status: attendanceStatus } : {}) }).eq("id", attendanceId);
  if (updateError) return json({ error: updateError.message }, 400);
  return json({ ok: true, decision });
});
