// Pure preview only: requires a COMPLETE trusted server snapshot, current work-hour
// policy and subsequent transactional revalidation. Never accepts browser data as
// an authority to write, and never calls SQL or changes the supplied snapshot.
import { planTaskGroupSchedule, scheduleWallMillis, scheduleDurationMillis, GroupScheduleError } from './task-group-schedule-core.mjs';
export class GroupSplitPlanError extends Error {
  constructor(code,message){super(message);this.name='GroupSplitPlanError';this.code=code;}
}
const fail=(code,message)=>{throw new GroupSplitPlanError(code,message);};
const norm=v=>String(v).replace(/[۰-۹]/g,c=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(c)).replace(/[٠-٩]/g,c=>'٠١٢٣٤٥٦٧٨٩'.indexOf(c));
const id=value=>{
  if(typeof value!=='string'&&typeof value!=='number')fail('INVALID_ID','شناسه معتبر نیست.');
  const text=norm(value).trim(),n=Number(text);
  if(!/^\d+$/.test(text)||!Number.isSafeInteger(n)||n<1||n>2147483647)fail('INVALID_ID','شناسه معتبر نیست.');
  return n;
};
const bool=value=>value===true||value===1||value==='1'?1:value===false||value===0||value==='0'?0:null;
const version=value=>{if(typeof value!=='string'||!/^[0-9a-f]{16}$/i.test(value))fail('INVALID_VERSION','نسخهٔ گروه معتبر نیست.');return value.toUpperCase();};
const wall=ms=>new Date(ms).toISOString().slice(0,19).replace('T',' ');
const maybeWall=value=>value==null||value===''?null:wall(scheduleWallMillis(value));
const fixedConflict=(error,phase)=>{
  if(!(error instanceof GroupScheduleError)||error.code!=='FIXED_CONFLICT')throw error;
  return {code:phase==='before'?'EXISTING_FIXED_CONFLICT':'SPLIT_FIXED_CONFLICT',conflicts:error.details.conflicts,limited:!!error.details.limited};
};

// fixedOverrides are explicit new start/end times ONLY for departing active fixed
// tasks. They are not persisted here and must be separately confirmed by a user.
export function planGroupSplitSchedule({tasks,groups,members,groupId,originTaskId,expectedGroupVersion,action,taskIds,fixedOverrides=[],startAt,adjustStart}={}){
  if(![tasks,groups,members,fixedOverrides].every(Array.isArray)||typeof adjustStart!=='function')fail('INVALID_SNAPSHOT','تصویر کامل و تنظیم ساعات کاری معتبر لازم است.');
  const gid=id(groupId), origin=id(originTaskId), expected=version(expectedGroupVersion);
  if(!['leave','dissolve'].includes(action))fail('INVALID_ACTION','نوع جداسازی معتبر نیست.');
  if(!Array.isArray(taskIds)||taskIds.length<1||taskIds.length>250)fail('INVALID_TARGETS','اعضای موردنظر باید صریح انتخاب شوند.');
  const targets=taskIds.map(id).sort((a,b)=>a-b);
  if(new Set(targets).size!==targets.length)fail('DUPLICATE_TARGETS','عضو تکراری انتخاب شده است.');
  const groupRows=groups.filter(g=>g&&id(g.GroupID)===gid);
  if(groupRows.length!==1||bool(groupRows[0].IsActive)!==1)fail('GROUP_INACTIVE','گروه فعال و یکتا پیدا نشد.');
  if(version(groupRows[0].Version)!==expected)fail('GROUP_CHANGED','گروه تغییر کرده است.');
  const taskMap=new Map();
  for(const task of tasks){if(!task||typeof task!=='object')fail('INVALID_SNAPSHOT','تصویر کارها معتبر نیست.');const tid=id(task.TaskID);if(taskMap.has(tid)||bool(task.Complited)===null)fail('INVALID_SNAPSHOT','وضعیت یا مالک کار معتبر نیست.');taskMap.set(tid,task);}
  const active=[], seenCurrent=new Set();
  for(const member of members){
    if(!member||typeof member!=='object'||!Object.hasOwn(member,'LeftAt'))fail('INVALID_SNAPSHOT','تصویر عضویت کامل نیست.');
    const tid=id(member.TaskID), mgid=id(member.GroupID);
    if(member.LeftAt!==null)continue;
    if(seenCurrent.has(tid)||bool(member.SyncEnabled)===null)fail('INVALID_SNAPSHOT','عضویت جاری تکراری یا نامعتبر است.');
    seenCurrent.add(tid);
    if(mgid===gid)active.push(tid);
  }
  active.sort((a,b)=>a-b);
  if(active.length<1||active.length>250||!active.includes(origin))fail('ORIGIN_NOT_MEMBER','کار مبنا عضو جاری گروه نیست.');
  if(targets.some(t=>!active.includes(t)))fail('MEMBERSHIP_CHANGED','یکی از اعضای انتخاب‌شده دیگر عضو این گروه نیست.');
  if(action==='dissolve'&&(active.length!==targets.length||active.some((t,i)=>t!==targets[i])))fail('INCOMPLETE_DISSOLUTION','برای انحلال باید همهٔ اعضای جاری صریحاً انتخاب شوند.');
  if(action==='leave'&&active.length-targets.length<2)return {ready:false,blockers:[{code:'GROUP_FATE_DECISION_REQUIRED',remainingMemberCount:active.length-targets.length}],changes:[],requiresScheduleConfirmation:false};
  const overrideMap=new Map();
  if(fixedOverrides.length>targets.length)fail('INVALID_OVERRIDE','تعداد زمان‌های جایگزین معتبر نیست.');
  for(const item of fixedOverrides){
    if(!item||typeof item!=='object')fail('INVALID_OVERRIDE','زمان جایگزین معتبر نیست.');
    const tid=id(item.taskId),task=taskMap.get(tid);
    if(!targets.includes(tid)||overrideMap.has(tid)||!task||bool(task.Complited)!==0||task.Priorities!=='زمان انجام ثابت'||bool(task.FixedDueTime)!==1)fail('INVALID_OVERRIDE','زمان جایگزین فقط برای عضو جداشوندهٔ فعال با زمان ثابت مجاز است.');
    const start=scheduleWallMillis(item.startLocal),end=scheduleWallMillis(item.endLocal),duration=scheduleDurationMillis(task.Durationtime);
    if(end<=start||end-start!==duration)fail('INVALID_OVERRIDE','بازهٔ جایگزین باید با مدت کار یکسان باشد.');
    overrideMap.set(tid,{startLocal:wall(start),endLocal:wall(end)});
  }
  // Validate both the current schedule and the hypothetical split, against the
  // same full snapshot and exact same explicit start/work-hours policy.
  const input={tasks,groups,members,startAt,adjustStart};
  try{planTaskGroupSchedule(input);}catch(error){return {ready:false,blockers:[fixedConflict(error,'before')],changes:[],requiresScheduleConfirmation:false};}
  const targetSet=new Set(targets);
  const nextMembers=members.filter(m=>!(m.LeftAt===null&&id(m.GroupID)===gid&&targetSet.has(id(m.TaskID))));
  const nextGroups=groups.map(g=>id(g.GroupID)===gid&&action==='dissolve'?{...g,IsActive:0}:g);
  const nextTasks=tasks.map(t=>{const o=overrideMap.get(id(t.TaskID));return o?{...t,DueDateTime:o.startLocal,EndDateTime:o.endLocal}:t;});
  let result;
  try{result=planTaskGroupSchedule({tasks:nextTasks,groups:nextGroups,members:nextMembers,startAt,adjustStart});}
  catch(error){return {ready:false,blockers:[fixedConflict(error,'after')],changes:[],requiresScheduleConfirmation:false};}
  const changes=[];
  for(const after of result.assignments){
    const before=taskMap.get(after.taskId);
    if(!before)fail('INVALID_SNAPSHOT','کار زمان‌بندی‌شده در تصویر اصلی وجود ندارد.');
    const beforeStart=maybeWall(before.DueDateTime),beforeEnd=maybeWall(before.EndDateTime);
    if(beforeStart!==after.startLocal||beforeEnd!==after.endLocal)changes.push({taskId:after.taskId,before:{start:beforeStart,end:beforeEnd},after:{start:after.startLocal,end:after.endLocal},fixed:after.fixed});
  }
  return {ready:true,blockers:[],groupId:gid,expectedGroupVersion:expected,action,selectedTaskIds:targets,
    explicitFixedOverrideTaskIds:[...overrideMap.keys()].sort((a,b)=>a-b),changes,requiresScheduleConfirmation:changes.length>0,
    workUnitCount:result.workUnitCount,taskCount:result.taskCount,copyHistoricalFollows:false,deleteFollowHistory:false};
}
