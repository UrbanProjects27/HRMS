import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const isoDateInIndia = (date = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
const shiftIsoDate = (date: string, days: number) => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

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
  const attendanceDate = String(body.attendanceDate ?? "");
  const checkInTime = String(body.checkIn ?? "");
  const checkOutTime = String(body.checkOut ?? "");
  const reason = String(body.reason ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(attendanceDate) || !/^\d{2}:\d{2}$/.test(checkInTime) || !/^\d{2}:\d{2}$/.test(checkOutTime) || reason.length < 5) {
    return json({ error: "Date, check-in, check-out and a reason of at least 5 characters are required" }, 400);
  }

  const [{ data: profile }, { data: callerEmployee }] = await Promise.all([
    admin.from("profiles").select("role").eq("id", identity.user.id).single(),
    admin.from("employees").select("id,reporting_manager_id").eq("profile_id", identity.user.id).maybeSingle(),
  ]);
  const isAdmin = profile?.role === "admin";
  const today = isoDateInIndia();
  if (attendanceDate > today) return json({ error: "Future attendance cannot be regularised" }, 400);
  if (!isAdmin) {
    const { data: policy } = await admin.from("hr_policies").select("settings").eq("policy_type", "attendance").maybeSingle();
    const settings=(policy?.settings??{}) as Record<string,unknown>;
    const maxBackdateDays=Math.max(1,Math.floor(Number(settings.attendance_regularization_days??60)));
    const earliest = shiftIsoDate(today, -maxBackdateDays);
    const latest = shiftIsoDate(today, -1);
    if (!callerEmployee || attendanceDate < earliest || attendanceDate > latest) return json({ error: `Employees can regularise attendance only for the previous ${maxBackdateDays} days` }, 403);
    if (!callerEmployee.reporting_manager_id) return json({ error: "A reporting manager must be assigned before submitting regularisation" }, 400);
  }

  let employeeId = callerEmployee?.id ?? "";
  if (isAdmin) {
    const employeeCode = String(body.employeeCode ?? "").trim();
    const { data: targetEmployee } = await admin.from("employees").select("id").eq("employee_code", employeeCode).maybeSingle();
    if (!targetEmployee) return json({ error: "Select a valid employee" }, 400);
    employeeId = targetEmployee.id;
  }

  const { data: existing, error: existingError } = await admin
    .from("attendance")
    .select("check_in,check_out,working_hours,attendance_status,is_regularization,original_check_in,original_check_out,original_working_hours,original_attendance_status")
    .eq("employee_id", employeeId)
    .eq("attendance_date", attendanceDate)
    .maybeSingle();
  if (existingError) return json({ error: existingError.message }, 400);
  const originalAttendance = existing?.is_regularization
    ? {
        original_check_in: existing.original_check_in,
        original_check_out: existing.original_check_out,
        original_working_hours: existing.original_working_hours,
        original_attendance_status: existing.original_attendance_status,
      }
    : {
        original_check_in: existing?.check_in ?? null,
        original_check_out: existing?.check_out ?? null,
        original_working_hours: existing?.working_hours ?? null,
        original_attendance_status: existing?.attendance_status ?? null,
      };

  const checkIn = new Date(`${attendanceDate}T${checkInTime}:00+05:30`);
  const checkOut = new Date(`${attendanceDate}T${checkOutTime}:00+05:30`);
  if (Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime()) || checkOut <= checkIn) return json({ error: "Check-out must be later than check-in" }, 400);
  const workingHours = Number(((checkOut.getTime() - checkIn.getTime()) / 3600000).toFixed(2));
  if (workingHours > 24) return json({ error: "Working hours cannot exceed 24 hours" }, 400);
  const attendanceStatus = workingHours > 8 ? "present" : workingHours >= 4 ? "half_day" : "absent";
  const approvalStatus = isAdmin ? "approved" : "pending";
  const payload = {
    employee_id: employeeId,
    attendance_date: attendanceDate,
    check_in: checkIn.toISOString(),
    check_out: checkOut.toISOString(),
    working_hours: workingHours,
    attendance_status: attendanceStatus,
    approval_status: approvalStatus,
    approved_by: isAdmin ? identity.user.id : null,
    approval_remarks: null,
    is_regularization: true,
    regularization_reason: reason,
    regularization_requested_at: new Date().toISOString(),
    regularized_by: identity.user.id,
    ...originalAttendance,
  };
  const { error } = await admin.from("attendance").upsert(payload, { onConflict: "employee_id,attendance_date" });
  if (error) return json({ error: error.message }, 400);
  return json({ ok: true, approvalStatus });
});
