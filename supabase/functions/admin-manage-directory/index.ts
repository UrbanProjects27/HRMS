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
  const { data: identity } = await caller.auth.getUser();
  if (!identity.user) return json({ error: "Unauthorized" }, 401);
  const { data: profile } = await admin.from("profiles").select("role").eq("id", identity.user.id).single();
  if (profile?.role !== "admin") return json({ error: "Admin access required" }, 403);

  const body = await request.json();
  const name = String(body.name ?? "").trim();
  let error: { message: string } | null = null;

  if (body.action === "add-department") ({ error } = await admin.from("departments").insert({ name }));
  else if (body.action === "edit-department") ({ error } = await admin.from("departments").update({ name }).eq("name", body.currentName));
  else if (body.action === "delete-department") ({ error } = await admin.from("departments").delete().eq("name", name));
  else if (body.action === "add-location") ({ error } = await admin.from("locations").insert({ name }));
  else if (body.action === "edit-location") ({ error } = await admin.from("locations").update({ name }).eq("name", body.currentName));
  else if (body.action === "set-location-geofence") {
    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);
    const radius = 1000;
    if (!name || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return json({ error: "Enter valid office coordinates" }, 400);
    ({ error } = await admin.from("locations").update({ latitude, longitude, geofence_radius_m: radius }).eq("name", name));
  }
  else if (body.action === "add-holiday") {
    const locationName = String(body.location ?? "");
    const { data: location } = locationName === "All locations" ? { data: null } : await admin.from("locations").select("id").eq("name", locationName).maybeSingle();
    ({ error } = await admin.from("holidays").insert({ name, holiday_date: body.date, holiday_type: "National", location_id: location?.id ?? null }));
  }
  else if (body.action === "edit-holiday") {
    const locationName = String(body.location ?? "");
    const { data: location } = locationName === "All locations" ? { data: null } : await admin.from("locations").select("id").eq("name", locationName).maybeSingle();
    ({ error } = await admin.from("holidays").update({ name, holiday_date: body.date, holiday_type: "National", location_id: location?.id ?? null }).eq("id", body.id));
  }
  else if (body.action === "set-leave-balance") {
    const { data: employee, error: employeeError } = await admin.from("employees").select("id").eq("employee_code", body.employeeCode).maybeSingle();
    if (employeeError || !employee) return json({ error: employeeError?.message ?? "Employee was not found" }, 404);
    const allocations = [
      ["Casual leave", body.casual], ["Sick leave", body.sick], ["Earned leave", body.earned], ["Work from home", body.workFromHome],
    ] as const;
    for (const [typeName, allocated] of allocations) {
      const { data: leaveType, error: typeError } = await admin.from("leave_types").upsert({ name: typeName }, { onConflict: "name" }).select("id").single();
      if (typeError || !leaveType) return json({ error: typeError?.message ?? `Unable to configure ${typeName}` }, 400);
      const result = await admin.from("leave_balances").upsert({ employee_id: employee.id, leave_type_id: leaveType.id, balance_year: new Date().getUTCFullYear(), allocated: Number(allocated), updated_by: identity.user.id }, { onConflict: "employee_id,leave_type_id,balance_year" });
      if (result.error) return json({ error: result.error.message }, 400);
    }
  }
  else if (body.action === "edit-employee") {
    const employeeCode = String(body.employeeCode ?? "").trim();
    const employeeName = String(body.employeeName ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const contactNumber = String(body.contactNumber ?? "").trim();
    const emergencyContactNumber = String(body.emergencyContactNumber ?? "").trim();
    const designation = String(body.designation ?? "").trim();
    const payrollCompany = String(body.payrollCompany ?? "").trim();
    const address = String(body.address ?? "").trim();
    const status = String(body.status ?? "").trim().toLowerCase();
    const accessRole = String(body.accessRole ?? "employee").trim().toLowerCase();
    if (!employeeCode || !employeeName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Employee name and a valid email are required" }, 400);
    if (!designation || !payrollCompany || !address || !["active", "inactive"].includes(status) || !["admin", "manager", "employee"].includes(accessRole)) return json({ error: "Designation, payroll company, address, status and portal access are required" }, 400);
    if (!/^\d{10}$/.test(contactNumber) || !/^\d{10}$/.test(emergencyContactNumber)) return json({ error: "Contact numbers must contain exactly 10 digits" }, 400);
    if (!body.joinedOn || (body.exitedOn && String(body.exitedOn) < String(body.joinedOn))) return json({ error: "Employment dates are invalid" }, 400);

    const [{ data: employee, error: lookupError }, { data: department }, { data: location }] = await Promise.all([
      admin.from("employees").select("id,profile_id,email").eq("employee_code", employeeCode).maybeSingle(),
      admin.from("departments").select("id").eq("name", body.department).maybeSingle(),
      admin.from("locations").select("id").eq("name", body.location).maybeSingle(),
    ]);
    if (lookupError || !employee) return json({ error: lookupError?.message ?? "Employee was not found" }, 404);
    if (!department || !location) return json({ error: "Select a valid department and location" }, 400);
    if (!employee.profile_id) return json({ error: "This employee does not have a linked user account" }, 409);
    if (employee.profile_id === identity.user.id && accessRole !== "admin") return json({ error: "You cannot remove your own administrator access" }, 409);

    const { data: emailOwner, error: emailLookupError } = await admin.from("employees").select("id").eq("email", email).neq("id", employee.id).maybeSingle();
    if (emailLookupError) return json({ error: emailLookupError.message }, 400);
    if (emailOwner) return json({ error: "This email is already assigned to another employee" }, 409);

    let reportingManagerId: string | null = null;
    const managerCode = String(body.managerCode ?? "").trim();
    if (managerCode) {
      const { data: manager } = await admin.from("employees").select("id").eq("employee_code", managerCode).maybeSingle();
      if (!manager || manager.id === employee.id) return json({ error: "Select a valid reporting manager" }, 400);
      reportingManagerId = manager.id;
    }

    if (employee.profile_id && employee.email !== email) {
      const { error: authError } = await admin.auth.admin.updateUserById(employee.profile_id, { email, email_confirm: true });
      if (authError) return json({ error: authError.message }, 400);
    }

    ({ error } = await admin.from("employees").update({
      name: employeeName,
      email,
      department_id: department.id,
      location_id: location.id,
      designation,
      reporting_manager_id: reportingManagerId,
      payroll_company: payrollCompany,
      address,
      contact_number: contactNumber,
      emergency_contact_number: emergencyContactNumber,
      joined_on: body.joinedOn,
      exited_on: body.exitedOn || null,
      status,
      updated_at: new Date().toISOString(),
    }).eq("id", employee.id));
    if (!error) ({ error } = await admin.from("profiles").update({ full_name: employeeName, role: accessRole, updated_at: new Date().toISOString() }).eq("id", employee.profile_id));
  }
  else if (body.action === "reset-employee-password") {
    const employeeCode = String(body.employeeCode ?? "").trim();
    const temporaryPassword = String(body.temporaryPassword ?? "");
    if (!employeeCode) return json({ error: "Select an employee" }, 400);
    if (temporaryPassword.length < 8 || temporaryPassword.length > 72) return json({ error: "Temporary password must contain between 8 and 72 characters" }, 400);
    const { data: employee, error: lookupError } = await admin.from("employees").select("profile_id,name").eq("employee_code", employeeCode).maybeSingle();
    if (lookupError || !employee) return json({ error: lookupError?.message ?? "Employee was not found" }, 404);
    if (!employee.profile_id) return json({ error: "This employee does not have a linked user account" }, 409);
    const { error: authError } = await admin.auth.admin.updateUserById(employee.profile_id, { password: temporaryPassword });
    if (authError) return json({ error: authError.message }, 400);
  }
  else if (body.action === "delete-employee") {
    const { data: employee, error: lookupError } = await admin.from("employees").select("id,profile_id").eq("employee_code", body.employeeCode).maybeSingle();
    if (lookupError) return json({ error: lookupError.message }, 400);
    if (!employee) return json({ ok: true, alreadyDeleted: true });
    ({ error } = await admin.from("employees").delete().eq("id", employee.id));
    if (!error && employee.profile_id) {
      const { error: authError } = await admin.auth.admin.deleteUser(employee.profile_id);
      error = authError;
    }
  } else return json({ error: "Unsupported directory action" }, 400);

  if (error) return json({ error: error.message }, 400);
  return json({ ok: true });
});
