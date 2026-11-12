import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const validTime=(value:string)=>/^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const toMinutes=(value:string)=>{const [hour,minute]=value.split(":").map(Number);return hour*60+minute};
const indiaDate=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const shiftDate=(date:string,days:number)=>{const value=new Date(`${date}T00:00:00Z`);value.setUTCDate(value.getUTCDate()+days);return value.toISOString().slice(0,10)};

Deno.serve(async(request)=>{
  if(request.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(request.method!=="POST")return json({error:"Method not allowed"},405);
  const url=Deno.env.get("SUPABASE_URL");const anonKey=Deno.env.get("SUPABASE_ANON_KEY");const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");const authorization=request.headers.get("Authorization");
  if(!url||!anonKey||!serviceKey||!authorization)return json({error:"Unauthorized"},401);
  const caller=createClient(url,anonKey,{global:{headers:{Authorization:authorization}}});const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:identity,error:identityError}=await caller.auth.getUser();if(identityError||!identity.user)return json({error:"Unauthorized"},401);
  const body=await request.json();const action=String(body.action??"");
  const [{data:profile},{data:callerEmployee}]=await Promise.all([admin.from("profiles").select("role").eq("id",identity.user.id).single(),admin.from("employees").select("id,reporting_manager_id").eq("profile_id",identity.user.id).maybeSingle()]);

  if(action==="create"){
    if(!callerEmployee?.id)return json({error:"This account is not linked to an employee record"},403);
    if(!callerEmployee.reporting_manager_id)return json({error:"A reporting manager must be assigned before overtime can be requested"},400);
    const date=String(body.date??"");const fromTime=String(body.fromTime??"");const toTime=String(body.toTime??"");const reason=String(body.reason??"").trim();
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!validTime(fromTime)||!validTime(toTime)||reason.length<5)return json({error:"A valid date, time range, and reason are required"},400);
    const minutes=toMinutes(toTime)-toMinutes(fromTime);if(minutes<=0)return json({error:"To time must be later than from time"},400);
    const {data,error}=await admin.from("overtime_requests").insert({employee_id:callerEmployee.id,overtime_date:date,from_time:fromTime,to_time:toTime,hours:Number((minutes/60).toFixed(2)),reason,status:"pending"}).select("id,hours").single();
    if(error)return json({error:error.code==="23505"?"An overtime request already exists for this time range":error.message},400);
    return json({ok:true,...data});
  }

  if(action==="regularize"){
    const isAdmin=profile?.role==="admin";const date=String(body.date??"");const fromTime=String(body.fromTime??"");const toTime=String(body.toTime??"");const reason=String(body.reason??"").trim();const today=indiaDate();
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!validTime(fromTime)||!validTime(toTime)||reason.length<5)return json({error:"A valid date, time range, and reason are required"},400);
    const minutes=toMinutes(toTime)-toMinutes(fromTime);if(minutes<=0)return json({error:"To time must be later than from time"},400);
    if(date>today)return json({error:"Future overtime cannot be regularised"},400);
    let targetEmployeeId=callerEmployee?.id??"";
    if(isAdmin){const employeeCode=String(body.employeeCode??"").trim();const {data,error}=await admin.from("employees").select("id").eq("employee_code",employeeCode).maybeSingle();if(error||!data)return json({error:error?.message??"Employee was not found"},404);targetEmployeeId=data.id}
    else {if(!callerEmployee?.id)return json({error:"This account is not linked to an employee record"},403);const {data:policy}=await admin.from("hr_policies").select("settings").eq("policy_type","attendance").maybeSingle();const settings=(policy?.settings??{}) as Record<string,unknown>;const maxBackdateDays=Math.max(1,Math.floor(Number(settings.overtime_regularization_days??3)));if(date<shiftDate(today,-maxBackdateDays)||date>=today)return json({error:`Employees can regularise overtime only for the previous ${maxBackdateDays} calendar days`},400);if(!callerEmployee.reporting_manager_id)return json({error:"A reporting manager must be assigned before overtime can be regularised"},400)}
    const status=isAdmin?"approved":"pending";const {data,error}=await admin.from("overtime_requests").insert({employee_id:targetEmployeeId,overtime_date:date,from_time:fromTime,to_time:toTime,hours:Number((minutes/60).toFixed(2)),reason,status,is_regularization:true,regularized_by:identity.user.id,reviewed_by:isAdmin?identity.user.id:null,reviewed_at:isAdmin?new Date().toISOString():null}).select("id,hours,status").single();
    if(error)return json({error:error.code==="23505"?"An overtime request already exists for this time range":error.message},400);
    return json({ok:true,...data});
  }

  if(action==="review"){
    const requestId=String(body.requestId??"");const decision=String(body.decision??"").toLowerCase();if(!requestId||!["approved","rejected"].includes(decision))return json({error:"A valid overtime request and decision are required"},400);
    const {data:overtime,error:requestError}=await admin.from("overtime_requests").select("id,employee_id,status").eq("id",requestId).maybeSingle();if(requestError||!overtime)return json({error:requestError?.message??"Overtime request was not found"},404);
    if(overtime.status!=="pending")return json({error:"This overtime request has already been reviewed"},409);
    const {data:targetEmployee}=await admin.from("employees").select("reporting_manager_id").eq("id",overtime.employee_id).single();const isAdmin=profile?.role==="admin";const isAssignedManager=Boolean(callerEmployee?.id&&targetEmployee?.reporting_manager_id===callerEmployee.id);
    if(!isAdmin&&!isAssignedManager)return json({error:"Only the assigned reporting manager can review this overtime request"},403);
    const {error:updateError}=await admin.from("overtime_requests").update({status:decision,reviewed_by:identity.user.id,reviewed_at:new Date().toISOString()}).eq("id",requestId).eq("status","pending");if(updateError)return json({error:updateError.message},400);
    return json({ok:true,decision});
  }

  return json({error:"Unsupported overtime action"},400);
});
