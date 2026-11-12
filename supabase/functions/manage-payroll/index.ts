import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
Deno.serve(async(request)=>{
  if(request.method==="OPTIONS")return new Response("ok",{headers:cors});if(request.method!=="POST")return json({error:"Method not allowed"},405);
  const url=Deno.env.get("SUPABASE_URL"),anon=Deno.env.get("SUPABASE_ANON_KEY"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),authorization=request.headers.get("Authorization");if(!url||!anon||!service||!authorization)return json({error:"Unauthorized"},401);
  const caller=createClient(url,anon,{global:{headers:{Authorization:authorization}}});const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});const {data:identity}=await caller.auth.getUser();if(!identity.user)return json({error:"Unauthorized"},401);const {data:profile}=await admin.from("profiles").select("role").eq("id",identity.user.id).single();if(profile?.role!=="admin")return json({error:"Admin access required"},403);
  const body=await request.json();const action=String(body.action??"");
  if(action==="set-structure"){
    const {data:employee}=await admin.from("employees").select("id").eq("employee_code",body.employeeCode).maybeSingle();if(!employee)return json({error:"Employee not found"},404);const values=[body.basic,body.hra,body.specialAllowance,body.deductions].map(Number);if(values.some(value=>!Number.isFinite(value)||value<0))return json({error:"Salary values must be valid non-negative numbers"},400);
    const {error}=await admin.from("salary_structures").upsert({employee_id:employee.id,basic:values[0],hra:values[1],special_allowance:values[2],deductions:values[3],effective_from:body.effectiveFrom||new Date().toISOString().slice(0,10),updated_by:identity.user.id,updated_at:new Date().toISOString()},{onConflict:"employee_id"});if(error)return json({error:error.message},400);return json({ok:true});
  }
  if(action==="generate"){
    const month=String(body.month??"");if(!/^\d{4}-\d{2}$/.test(month))return json({error:"Select a valid payroll month"},400);const [{data:employees},{data:structures}]=await Promise.all([admin.from("employees").select("id").eq("status","active"),admin.from("salary_structures").select("employee_id,basic,hra,special_allowance,deductions")]);const byEmployee=new Map((structures??[]).map(item=>[item.employee_id,item]));let generated=0,skipped=0;
    for(const employee of employees??[]){const structure=byEmployee.get(employee.id);if(!structure){skipped++;continue}const basic=Number(structure.basic),hra=Number(structure.hra),special=Number(structure.special_allowance),deductions=Number(structure.deductions),gross=basic+hra+special,net=Math.max(0,gross-deductions);const {error}=await admin.from("payroll_records").upsert({employee_id:employee.id,payroll_month:`${month}-01`,basic,hra,special_allowance:special,deductions,gross_salary:gross,net_salary:net,status:"generated",generated_by:identity.user.id,generated_at:new Date().toISOString()},{onConflict:"employee_id,payroll_month"});if(error)return json({error:error.message},400);generated++}
    return json({ok:true,generated,skipped});
  }
  return json({error:"Unsupported payroll action"},400);
});
