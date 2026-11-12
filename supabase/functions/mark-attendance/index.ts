import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const indiaDate=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const distance=(aLat:number,aLng:number,bLat:number,bLng:number)=>{const r=6371000;const rad=(n:number)=>n*Math.PI/180;const dLat=rad(bLat-aLat);const dLng=rad(bLng-aLng);const value=Math.sin(dLat/2)**2+Math.cos(rad(aLat))*Math.cos(rad(bLat))*Math.sin(dLng/2)**2;return 2*r*Math.atan2(Math.sqrt(value),Math.sqrt(1-value))};

Deno.serve(async(request)=>{
  if(request.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(request.method!=="POST")return json({error:"Method not allowed"},405);
  const url=Deno.env.get("SUPABASE_URL"),anon=Deno.env.get("SUPABASE_ANON_KEY"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),authorization=request.headers.get("Authorization");
  if(!url||!anon||!service||!authorization)return json({error:"Unauthorized"},401);
  const caller=createClient(url,anon,{global:{headers:{Authorization:authorization}}});const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:identity}=await caller.auth.getUser();if(!identity.user)return json({error:"Unauthorized"},401);
  const body=await request.json();const action=String(body.action??"");const latitude=Number(body.latitude),longitude=Number(body.longitude),accuracy=Number(body.accuracy);
  if(!["check-in","check-out"].includes(action)||!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180)return json({error:"A valid attendance action and current location are required"},400);
  const {data:employee}=await admin.from("employees").select("id,location_id").eq("profile_id",identity.user.id).maybeSingle();if(!employee)return json({error:"This account is not linked to an employee"},400);
  const {data:office}=await admin.from("locations").select("name,latitude,longitude,geofence_radius_m").eq("id",employee.location_id).maybeSingle();
  if(!office||office.latitude===null||office.longitude===null)return json({error:"Office geofence is not configured for your location. Contact Admin."},400);
  const metres=distance(latitude,longitude,Number(office.latitude),Number(office.longitude));const radius=Number(office.geofence_radius_m??1000);
  if(metres>radius)return json({error:`You are ${Math.round(metres)}m from ${office.name}. Attendance is allowed within ${radius}m.`},403);
  const today=indiaDate();const now=new Date();
  if(action==="check-in"){
    const {data:existing}=await admin.from("attendance").select("id,check_in").eq("employee_id",employee.id).eq("attendance_date",today).maybeSingle();
    if(existing?.check_in)return json({error:"You have already checked in today"},409);
    const {data:policy}=await admin.from("hr_policies").select("settings").eq("policy_type","attendance").maybeSingle();const settings=(policy?.settings??{}) as Record<string,unknown>;const [hour,minute]=String(settings.workday_start??"09:30").split(":").map(Number);const grace=Number(settings.grace_minutes??15);const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Kolkata",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(now);const current=Number(parts.find(p=>p.type==="hour")?.value??0)*60+Number(parts.find(p=>p.type==="minute")?.value??0);const attendanceStatus=current>hour*60+minute+grace?"late":"present";
    const {error}=await admin.from("attendance").upsert({employee_id:employee.id,attendance_date:today,check_in:now.toISOString(),check_out:null,working_hours:null,attendance_status:attendanceStatus,approval_status:"approved",is_regularization:false,check_in_latitude:latitude,check_in_longitude:longitude,check_in_distance_m:Number(metres.toFixed(2))},{onConflict:"employee_id,attendance_date"});if(error)return json({error:error.message},400);
    return json({ok:true,action,distance:Math.round(metres),accuracy:Number.isFinite(accuracy)?Math.round(accuracy):null,office:office.name,attendanceStatus});
  }
  // A night shift can legitimately start on the previous Indian calendar date and
  // finish after midnight. Prefer today's record, then safely fall back to the
  // most recent still-open check-in from yesterday.
  let {data:record}=await admin.from("attendance").select("id,check_in,attendance_date").eq("employee_id",employee.id).eq("attendance_date",today).maybeSingle();
  if(!record?.check_in){const yesterday=new Date(`${today}T00:00:00Z`);yesterday.setUTCDate(yesterday.getUTCDate()-1);const previousDate=yesterday.toISOString().slice(0,10);const {data:previous}=await admin.from("attendance").select("id,check_in,attendance_date").eq("employee_id",employee.id).eq("attendance_date",previousDate).is("check_out",null).maybeSingle();record=previous;}
  if(!record?.check_in)return json({error:"Check in before checking out"},400);
  const hours=Math.max(0,(now.getTime()-new Date(record.check_in).getTime())/3600000);const roundedHours=Number(hours.toFixed(2));const attendanceStatus=hours>8?"present":hours>=4?"half_day":"absent";const {error}=await admin.from("attendance").update({check_out:now.toISOString(),working_hours:roundedHours,attendance_status:attendanceStatus,approval_status:"approved",approved_by:null,approval_remarks:null,check_out_latitude:latitude,check_out_longitude:longitude,check_out_distance_m:Number(metres.toFixed(2))}).eq("id",record.id);if(error)return json({error:error.message},400);
  return json({ok:true,action,distance:Math.round(metres),accuracy:Number.isFinite(accuracy)?Math.round(accuracy):null,office:office.name,workingHours:roundedHours,attendanceStatus});
});
