import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = request.headers.get("Authorization");
  if (!url || !anonKey || !serviceKey || !authorization) return json({ error: "Unauthorized" }, 401);

  const callerClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
  const adminClient = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: userError } = await callerClient.auth.getUser();
  if (userError || !userData.user) return json({ error: "Unauthorized" }, 401);
  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", userData.user.id).single();
  if (profile?.role !== "admin") return json({ error: "Admin access required" }, 403);

  const body = await request.json();
  const required = ["id", "name", "email", "password", "department", "location", "designation", "manager", "payrollCompany", "address", "contact", "emergency", "joinedOn", "status"];
  if (required.some((field) => !String(body[field] ?? "").trim())) return json({ error: "Missing mandatory employee fields" }, 400);
  if (!/^\d{10}$/.test(body.contact) || !/^\d{10}$/.test(body.emergency)) return json({ error: "Contact numbers must contain exactly 10 digits" }, 400);
  if (String(body.password).length < 8) return json({ error: "Password must contain at least 8 characters" }, 400);
  if (body.exitedOn && body.exitedOn < body.joinedOn) return json({ error: "Exit date cannot be before joining date" }, 400);

  const [{ data: department }, { data: location }, { data: manager }] = await Promise.all([
    adminClient.from("departments").select("id").eq("name", body.department).single(),
    adminClient.from("locations").select("id").eq("name", body.location).single(),
    adminClient.from("employees").select("id").eq("name", body.manager).limit(1).maybeSingle(),
  ]);
  if (!department || !location) return json({ error: "Department or location was not found" }, 400);

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email: String(body.email).trim().toLowerCase(),
    password: body.password,
    email_confirm: true,
    user_metadata: { full_name: body.name, employee_code: body.id },
  });
  if (createError || !created.user) return json({ error: createError?.message ?? "User could not be created" }, 400);

  // The auth bootstrap trigger creates this profile as soon as the Auth user is
  // inserted. Upsert keeps the function compatible with projects both with and
  // without that trigger and prevents a duplicate profiles primary-key error.
  const { error: profileError } = await adminClient.from("profiles").upsert(
    { id: created.user.id, full_name: body.name, role: "employee" },
    { onConflict: "id" },
  );
  const { error: employeeError } = profileError ? { error: profileError } : await adminClient.from("employees").insert({
    profile_id: created.user.id,
    employee_code: body.id,
    name: body.name,
    email: String(body.email).trim().toLowerCase(),
    department_id: department.id,
    location_id: location.id,
    designation: body.designation,
    reporting_manager_id: manager?.id ?? null,
    payroll_company: String(body.payrollCompany).trim(),
    address: body.address,
    contact_number: body.contact,
    emergency_contact_number: body.emergency,
    joined_on: body.joinedOn,
    exited_on: body.exitedOn || null,
    status: String(body.status).toLowerCase(),
  });
  if (employeeError) {
    await adminClient.auth.admin.deleteUser(created.user.id);
    return json({ error: employeeError.message }, 400);
  }
  return json({ ok: true, userId: created.user.id });
});
