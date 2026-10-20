import test from "node:test";
import assert from "node:assert/strict";
import { createExperimentRecord, validateExperimentRecord, transitionExperiment, isCalibrationCurrent, getAssetCalibrationStatus, createCalibrationRecord, validateTestDiaryEntry, validateMaintenanceAsset, getMaintenanceScheduleStatus, getExperimentEquipmentReadiness } from "../src/domain/index.js";
test("creates a traceable planned experiment record with immutable creation audit",()=>{
 const record=createExperimentRecord({
  id:"EXP-20261018-001",title:"Fuel-cell polarization sweep",assetId:2,
  plannedDate:"2026-10-20",owner:"Lab operator",purpose:"Measure polarization response using the approved test procedure.",
  actor:"operator-1",createdAt:"2026-10-18T09:00:00+08:00"
 });
 assert.equal(record.status,"planned");
 assert.equal(record.assetId,"2");
 assert.equal(record.plannedDate,"2026-10-20");
 assert.equal(record.createdAt,"2026-10-18T01:00:00.000Z");
 assert.equal(record.audit.length,1);
 assert.equal(record.audit[0].from,"new");
 assert.equal(record.audit[0].to,"planned");
 assert.equal(record.audit[0].actor,"operator-1");
 assert.ok(Object.isFrozen(record));
 assert.ok(Object.isFrozen(record.audit));
 assert.ok(Object.isFrozen(record.audit[0]));
});
test("validates a full experiment lifecycle and its chronological audit chain",()=>{
 const created=createExperimentRecord({
  id:"EXP-1",title:"Durability run",assetId:"2",plannedDate:"2026-10-20",
  owner:"Operator A",purpose:"Verify planned operation",actor:"operator-1",
  createdAt:"2026-10-18T01:00:00.000Z"
 });
 const started=transitionExperiment(created,"in-progress","operator-2","2026-10-18T01:01:00.000Z");
 const completed=transitionExperiment(started,"completed","reviewer-1","2026-10-18T01:02:00.000Z");
 const imported=validateExperimentRecord(completed);
 assert.equal(imported.status,"completed");
 assert.equal(imported.audit.length,3);
 assert.equal(imported.audit[1].from,"planned");
 assert.equal(imported.audit[1].to,"in-progress");
 assert.equal(imported.audit[2].from,"in-progress");
 assert.equal(imported.audit[2].to,"completed");
 assert.ok(Object.isFrozen(imported.audit));
 assert.ok(imported.audit.every(Object.isFrozen));
});
test("rejects experiment records with missing traceability, invalid plans or status mismatch",()=>{
 const base={
  id:"EXP-2",title:"Bench validation",assetId:2,plannedDate:"2026-10-20",
  owner:"Operator",purpose:"Validate operation",actor:"operator-1",
  createdAt:"2026-10-18T01:00:00.000Z"
 };
 assert.throws(()=>createExperimentRecord({...base,actor:" "}),/actor is required/);
 assert.throws(()=>createExperimentRecord({...base,title:" "}),/title is required/);
 assert.throws(()=>createExperimentRecord({...base,assetId:" "}),/asset reference is required/);
 assert.throws(()=>createExperimentRecord({...base,plannedDate:"2026-02-30"}),/calendar date/);
 assert.throws(()=>createExperimentRecord({...base,purpose:" "}),/purpose is required/);
 assert.throws(()=>createExperimentRecord({...base,id:"EXP"+String.fromCharCode(10)+"FORGED"}),/control characters/);
 assert.throws(()=>createExperimentRecord({...base,assetId:"ASSET"+String.fromCharCode(0)+"X"}),/safe text/);
 assert.throws(()=>createExperimentRecord({...base,actor:"operator"+String.fromCharCode(10)+"forged"}),/control characters/);
 assert.throws(()=>createExperimentRecord({...base,title:"title"+String.fromCharCode(127)}),/control characters/);
 const created=createExperimentRecord(base);
 assert.throws(()=>validateExperimentRecord({...created,status:"completed"}),/does not match/);
 assert.throws(()=>validateExperimentRecord({...created,audit:[]}),/include record creation/);
});
test("rejects impossible, skipped, reordered or tampered experiment audit chains",()=>{
 const base=createExperimentRecord({
  id:"EXP-3",title:"Stack test",assetId:2,plannedDate:"2026-10-20",
  owner:"Operator",purpose:"Traceable test plan",actor:"operator-1",
  createdAt:"2026-10-18T01:00:00.000Z"
 });
 const started=transitionExperiment(base,"in-progress","operator-2","2026-10-18T01:01:00.000Z");
 assert.throws(
  ()=>transitionExperiment(started,"completed","operator-3","2026-10-18T00:59:00.000Z"),
  /chronological/
 );
 assert.throws(()=>validateExperimentRecord({...started,audit:[
  started.audit[0],{from:"planned",to:"completed",actor:"operator-2",at:"2026-10-18T01:01:00.000Z"}
 ]}),/invalid lifecycle transition/);
 assert.throws(()=>validateExperimentRecord({...started,audit:[
  started.audit[0],{from:"planned",to:"in-progress",actor:"operator-2",at:"2026-10-18T00:59:00.000Z"}
 ]}),/chronological/);
 assert.throws(()=>validateExperimentRecord({...started,audit:[
  started.audit[0],{from:"planned",to:"in-progress",actor:" ",at:"2026-10-18T01:01:00.000Z"}
 ]}),/actor is required/);
 assert.throws(()=>validateExperimentRecord({...started,unexpected:{mutable:true}}),/unsupported fields/);
 assert.throws(()=>validateExperimentRecord({...started,audit:[
  started.audit[0],{from:"planned",to:"in-progress",actor:"operator-2"+String.fromCharCode(10)+"forged",at:"2026-10-18T01:01:00.000Z"}
 ]}),/control characters/);
 assert.throws(()=>validateExperimentRecord({...started,audit:[
  started.audit[0],{from:"planned",to:"in-progress",actor:"operator-2",at:"2026-10-18T01:01:00.000Z",metadata:"unreviewed"}
 ]}),/immutable lifecycle schema/);
});
test("records authorized experiment lifecycle transition only from a complete traceable record",()=>{
 const created=createExperimentRecord({
  id:"EXP-AUTH",title:"Authorized lifecycle",assetId:2,plannedDate:"2026-10-20",
  owner:"Operator",purpose:"Verify traceable lifecycle transitions",actor:"operator-0",
  createdAt:"2026-10-18T01:00:00.000Z"
 });
 const next=transitionExperiment(created,"in-progress","operator-1","2026-10-18T01:01:00.000Z");
 assert.equal(next.status,"in-progress"); assert.equal(next.audit.length,2);
 assert.equal(validateExperimentRecord(next).status,"in-progress");
 assert.throws(()=>transitionExperiment({id:"EXP-1",status:"planned",audit:[]},"in-progress","operator-1"),/asset reference is required/);
});
test("rejects skipping experiment lifecycle states",()=>{
 const created=createExperimentRecord({
  id:"EXP-SKIP",title:"Lifecycle guard",assetId:2,plannedDate:"2026-10-20",
  owner:"Operator",purpose:"Verify lifecycle transition guard",actor:"operator-0",
  createdAt:"2026-10-18T01:00:00.000Z"
 });
 assert.throws(()=>transitionExperiment(created,"completed","operator-1"),RangeError);
});
test("rejects inherited object property names as experiment lifecycle states",()=>{
 const created=createExperimentRecord({
  id:"EXP-PROTOTYPE",title:"Prototype guard",assetId:2,plannedDate:"2026-10-20",
  owner:"Operator",purpose:"Verify safe lifecycle state lookup",actor:"operator-0",
  createdAt:"2026-10-18T01:00:00.000Z"
 });
 assert.throws(()=>transitionExperiment({...created,status:"toString"},"completed","operator-1"),RangeError);
 assert.throws(()=>transitionExperiment({...created,status:"__proto__"},"completed","operator-1"),RangeError);
});
test("rejects malformed audit history and invalid experiment containers",()=>{
 assert.throws(()=>transitionExperiment({status:"planned",audit:{} },"in-progress","operator-1"),TypeError);
 assert.throws(()=>transitionExperiment([],"in-progress","operator-1"),TypeError);
});
test("checks calibration expiry against an explicit date",()=>{
 assert.equal(isCalibrationCurrent({calibratedAt:"2026-01-01T00:00:00Z",validForDays:30},new Date("2026-01-15T00:00:00Z")),true);
 assert.equal(isCalibrationCurrent({calibratedAt:"2026-01-01T00:00:00Z",validForDays:30},new Date("2026-02-15T00:00:00Z")),false);
});
test("future-dated calibration is not current before its calibration instant",()=>{
 assert.equal(isCalibrationCurrent(
  {calibratedAt:"2026-10-21T00:00:00Z",validForDays:365},
  new Date("2026-10-20T23:59:59Z")
 ),false);
 assert.equal(isCalibrationCurrent(
  {calibratedAt:"2026-10-21T00:00:00Z",validForDays:365},
  new Date("2026-10-21T00:00:00Z")
 ),true);
});
test("rejects timestamp numbers and invalid comparison dates",()=>{
 assert.throws(()=>isCalibrationCurrent({calibratedAt:1767225600000,validForDays:30}),TypeError);
 assert.throws(()=>isCalibrationCurrent({calibratedAt:"2026-01-01T00:00:00Z",validForDays:30},new Date("invalid")),TypeError);
});

test("validates test diary entries before accepting operational records",()=>{
 const valid=validateTestDiaryEntry({start:"2026-10-17T09:00:00+08:00",end:"2026-10-17T10:30:00+08:00",duration:1.5,unit:"Cell-A",operator:"operator-1",result:"pass"});
 assert.equal(valid.duration,1.5); assert.equal(valid.unit,"Cell-A");
});
test("rejects test diary records with reversed times, zero duration or missing traceability",()=>{
 const base={start:"2026-10-17T10:00:00+08:00",end:"2026-10-17T11:00:00+08:00",duration:1,unit:"Cell-A",operator:"operator-1"};
 assert.throws(()=>validateTestDiaryEntry({...base,end:"2026-10-17T09:00:00+08:00"}),RangeError);
 assert.throws(()=>validateTestDiaryEntry({...base,duration:0}),RangeError);
 assert.throws(()=>validateTestDiaryEntry({...base,operator:" "}),TypeError);
 assert.throws(()=>validateTestDiaryEntry({...base,unit:""}),TypeError);
});
test("preserves date-only diary dates as local calendar values",()=>{
 const valid=validateTestDiaryEntry({start:"2026-10-17",end:"2026-10-18",duration:2,unit:"Cell-A",operator:"operator-1"});
 assert.equal(valid.start,"2026-10-17");
 assert.equal(valid.end,"2026-10-18");
});
test("rejects impossible date-only diary calendar values",()=>{
 const base={start:"2026-02-28",end:"2026-03-01",duration:1,unit:"Cell-A",operator:"operator-1"};
 assert.throws(()=>validateTestDiaryEntry({...base,start:"2026-02-30"}),/calendar date/);
 assert.throws(()=>validateTestDiaryEntry({...base,end:"2026-02-30"}),/calendar date/);
});
test("normalizes optional test diary text and rejects unsafe operational values",()=>{
 const base={start:"2026-10-17",end:"2026-10-18",duration:2,unit:" Cell-A ",operator:" operator-1 ",
  sap:" PASS ",result:" pass ",cycle:" 120 ",error:" E-01 ",errorDesc:" seal check "};
 const valid=validateTestDiaryEntry(base);
 assert.equal(valid.unit,"Cell-A");
 assert.equal(valid.operator,"operator-1");
 assert.equal(valid.sap,"PASS");
 assert.equal(valid.result,"pass");
 assert.equal(valid.cycle,"120");
 assert.equal(valid.error,"E-01");
 assert.equal(valid.errorDesc,"seal check");
 for(const patch of [
  {result:42},{cycle:[]},{error:"E-01\nforged"},{errorDesc:"x".repeat(2001)},
  {unit:"operator\u0000name"},{operator:"x".repeat(121)}
 ]) assert.throws(()=>validateTestDiaryEntry({...base,...patch}));
});
test("equipment calibration readiness blocks missing failed expired future and ambiguous records",()=>{
 const at=new Date("2026-10-19T00:00:00.000Z");
 const record=(id,calibratedAt,result="pass",validForDays=365)=>createCalibrationRecord({
  id,assetId:7,calibratedAt,validForDays,certificateNo:"CERT-"+id,
  organization:"Metrology Lab",operator:"Lab operator",result
 });
 assert.equal(getAssetCalibrationStatus([],7,at),"not-recorded");
 assert.equal(getAssetCalibrationStatus([record(1,"2026-01-01T00:00:00Z","fail")],7,at),"failed");
 assert.equal(getAssetCalibrationStatus([record(2,"2025-01-01T00:00:00Z","pass",30)],7,at),"expired");
 assert.equal(getAssetCalibrationStatus([record(3,"2026-10-20T00:00:00Z")],7,at),"future-dated");
 assert.equal(getAssetCalibrationStatus([
  record(4,"2026-10-01T00:00:00Z"),record(5,"2026-10-01T00:00:00Z")
 ],7,at),"ambiguous");
 assert.equal(getAssetCalibrationStatus([
  record(6,"2026-10-01T00:00:00Z"),record(7,"2026-09-01T00:00:00Z")
 ],7,at),"current");
 const paddedAssetRecord={...record(8,"2026-10-01T00:00:00Z"),assetId:" 7 "};
 assert.equal(getAssetCalibrationStatus([paddedAssetRecord],7,at),"current",
  "calibration lookup must use the same trimmed asset identity as record normalization");
 assert.equal(getAssetCalibrationStatus([paddedAssetRecord]," 7 ",at),"current",
  "asset lookup input must be canonicalized consistently with stored calibration records");
 assert.throws(()=>getAssetCalibrationStatus({},7,at),TypeError);
 assert.throws(()=>getAssetCalibrationStatus([],7,new Date("invalid")),TypeError);
});
test("calibration timestamps require an explicit timezone and real calendar date",()=>{
 const at=new Date("2026-01-15T00:00:00Z");
 assert.throws(()=>isCalibrationCurrent({calibratedAt:"2026-01-01T00:00:00",validForDays:30},at),TypeError);
 assert.throws(()=>isCalibrationCurrent({calibratedAt:"2026-02-30T00:00:00Z",validForDays:30},at),TypeError);
 assert.throws(()=>isCalibrationCurrent({calibratedAt:"2026-01-01T00:00:00+14:30",validForDays:30},at),TypeError);
 assert.throws(()=>isCalibrationCurrent({calibratedAt:"2026-01-01T00:00:00.1234Z",validForDays:30},at),TypeError);
});
test("creates immutable, traceable equipment calibration records",()=>{
 const record=createCalibrationRecord({
  id:1001,assetId:2,calibratedAt:"2026-01-01T08:00:00+08:00",
  validForDays:365,certificateNo:"CERT-2026-001",organization:"Metrology Lab",
  operator:"Operator A",result:"pass",notes:"Annual calibration"
 });
 assert.equal(record.assetId,"2");
 assert.equal(record.calibratedAt,"2026-01-01T00:00:00.000Z");
 assert.ok(Object.isFrozen(record));
 assert.equal(isCalibrationCurrent(record,new Date("2026-06-01T00:00:00Z")),true);
 assert.equal(record.result,"pass");
});
test("rejects untraceable or invalid calibration records",()=>{
 const base={id:1001,assetId:2,calibratedAt:"2026-01-01T00:00:00Z",validForDays:365,certificateNo:"CERT-1",organization:"Lab",operator:"A",result:"pass"};
 assert.throws(()=>createCalibrationRecord({...base,assetId:" "}),TypeError);
 assert.throws(()=>createCalibrationRecord({...base,id:"CERT"+String.fromCharCode(10)+"INJECT"}),TypeError);
 assert.throws(()=>createCalibrationRecord({...base,assetId:"ASSET"+String.fromCharCode(0)+"-7"}),TypeError);
 assert.throws(()=>createCalibrationRecord({...base,assetId:"A".repeat(81)}),TypeError);
 assert.throws(()=>createCalibrationRecord({...base,certificateNo:" "}),TypeError);
 assert.throws(()=>createCalibrationRecord({...base,organization:" "}),TypeError);
 assert.throws(()=>createCalibrationRecord({...base,operator:" "}),TypeError);
 assert.throws(()=>createCalibrationRecord({...base,result:"unknown"}),RangeError);
 assert.throws(()=>createCalibrationRecord({...base,validForDays:0}),RangeError);
 assert.throws(()=>createCalibrationRecord({...base,calibratedAt:"2026-02-30T00:00:00Z"}),TypeError);
 assert.throws(()=>createCalibrationRecord({...base,notes:{text:"bad"}}),TypeError);
 assert.throws(()=>createCalibrationRecord({...base,id:"C".repeat(81)}),RangeError);
 assert.throws(()=>createCalibrationRecord({...base,certificateNo:"C".repeat(121)}),RangeError);
 assert.throws(()=>createCalibrationRecord({...base,organization:"O".repeat(181)}),RangeError);
 assert.throws(()=>createCalibrationRecord({...base,operator:"A".repeat(121)}),RangeError);
 assert.throws(()=>createCalibrationRecord({...base,notes:"N".repeat(2001)}),RangeError);
 assert.throws(()=>createCalibrationRecord({...base,certificateNo:"CERT" + String.fromCharCode(10) + "001"}),TypeError);
 assert.throws(()=>createCalibrationRecord({...base,notes:"note" + String.fromCharCode(0)}),TypeError);
 assert.equal(createCalibrationRecord({...base,id:" CAL-1 "}).id,"CAL-1");
});
test("calibration expiry rejects unsafe durations and overflow",()=>{
 assert.throws(()=>isCalibrationCurrent({calibratedAt:"2026-01-01T00:00:00Z",validForDays:Number.MAX_SAFE_INTEGER},new Date()),RangeError);
 assert.throws(()=>isCalibrationCurrent({calibratedAt:"2026-01-01T00:00:00Z",validForDays:1e308},new Date()),RangeError);
});
test("calibration timestamp offsets normalize consistently",()=>{
 assert.equal(isCalibrationCurrent({calibratedAt:"2026-01-01T08:00:00+08:00",validForDays:0},new Date("2026-01-01T00:00:00Z")),true);
});
test("timed diary entries require timezone and reject invalid or lossy timestamps",()=>{
 const base={start:"2026-10-17T09:00:00+08:00",end:"2026-10-17T10:00:00+08:00",duration:1,unit:"Cell-A",operator:"operator-1"};
 assert.throws(()=>validateTestDiaryEntry({...base,start:"2026-10-17T09:00:00"}),/explicit timezone/);
 assert.throws(()=>validateTestDiaryEntry({...base,end:"2026-02-30T10:00:00Z"}),/explicit timezone/);
 assert.throws(()=>validateTestDiaryEntry({...base,end:"2026-10-17T10:00:00.1234Z"}),/explicit timezone/);
});
test("diary timestamps must remain round-trippable after UTC offset normalization",()=>{
 const base={start:"0000-01-01T00:00:00+14:00",end:"0000-01-01T01:00:00+14:00",duration:1,unit:"Cell-A",operator:"operator-1"};
 assert.throws(()=>validateTestDiaryEntry(base),/four-digit UTC year range/);
 const late={start:"9999-12-31T22:00:00-14:00",end:"9999-12-31T23:00:00-14:00",duration:1,unit:"Cell-A",operator:"operator-1"};
 assert.throws(()=>validateTestDiaryEntry(late),/four-digit UTC year range/);
});
test("rejects unsafe experiment diary duration magnitudes",()=>{
 const base={start:"2026-10-17",end:"2026-10-18",duration:1,unit:"Cell-A",operator:"operator-1"};
 assert.throws(()=>validateTestDiaryEntry({...base,duration:Number.MAX_SAFE_INTEGER+1}),RangeError);
 assert.throws(()=>validateTestDiaryEntry({...base,duration:1e308}),RangeError);
 assert.equal(validateTestDiaryEntry({...base,duration:0.25}).duration,0.25);
});

test("freezes copied experiment audit history and rejects malformed entries",()=>{
 const created=createExperimentRecord({
  id:"EXP-AUDIT",title:"Audit immutability",assetId:2,plannedDate:"2026-10-20",
  owner:"Operator",purpose:"Verify immutable lifecycle audit",actor:"operator-0",
  createdAt:"2026-10-17T08:00:00.000Z"
 });
 const prior={...created.audit[0]};
 const source={...created,audit:[prior]};
 const next=transitionExperiment(source,"in-progress","operator-1","2026-10-17T09:00:00.000Z");
 assert.ok(Object.isFrozen(next.audit));
 assert.ok(Object.isFrozen(next.audit[0]));
 assert.ok(Object.isFrozen(next.audit[1]));
 assert.notEqual(next.audit[0],prior);
 assert.throws(()=>{next.audit[0].actor="tampered";},TypeError);
 assert.throws(()=>{next.audit.push({});},TypeError);
 assert.equal(prior.actor,"operator-0");
 assert.throws(()=>transitionExperiment({...created,audit:[null]},"in-progress","operator-1"),TypeError);
 assert.throws(()=>transitionExperiment({...created,audit:["invalid"]},"in-progress","operator-1"),TypeError);
 assert.throws(()=>transitionExperiment({...created,audit:[{...created.audit[0],metadata:{note:"mutable"}}]},"in-progress","operator-1"),TypeError);
});

test("validates equipment maintenance assets before saving",()=>{
 const valid=validateMaintenanceAsset({
  name:"  Test bench  ",category:"Test equipment",location:"Lab",qty:2,
  cycle:"二级保养",freq:"季度",last:"2026-01-31",next:"2026-04-30",
  responsible:"Operator",record:"Inspection"
 });
 assert.equal(valid.name,"Test bench");
 assert.equal(valid.qty,2);
 assert.ok(Object.isFrozen(valid));
 assert.throws(()=>{valid.name="tampered";},TypeError);
});
test("maintenance asset text is bounded and rejects control-character injection",()=>{
 const base={name:"Bench",category:"Equipment",location:"Lab",qty:1,cycle:"一级保养",freq:"季度",last:"2026-01-01",next:"2026-04-01",responsible:"Operator",record:"Inspection"};
 const valid=validateMaintenanceAsset({...base,name:" Bench ",freq:" 每季度 "});
 assert.equal(valid.name,"Bench");
 assert.equal(valid.freq,"每季度");
 for(const patch of [
  {name:"N".repeat(121)},{freq:"F".repeat(81)},
  {category:"C".repeat(81)},{location:"L".repeat(121)},
  {responsible:"R".repeat(121)},{record:"D".repeat(2001)},
  {name:"Bench\nforged"},{freq:"Quarter\u0000ly"},
  {category:"Equipment\nforged"},{location:"Lab\u0000A"},
  {responsible:"Operator\nforged"},{record:"note\u0000forged"}
 ]) assert.throws(()=>validateMaintenanceAsset({...base,...patch}));
});
test("rejects incomplete or impossible maintenance asset quantities and cycles",()=>{
 const base={name:"Bench",category:"Equipment",location:"Lab",qty:1,cycle:"一级保养",freq:"季度",last:"2026-01-01",next:"2026-04-01"};
 assert.throws(()=>validateMaintenanceAsset({...base,name:" "}),/name is required/);
 assert.throws(()=>validateMaintenanceAsset({...base,qty:0}),RangeError);
 assert.throws(()=>validateMaintenanceAsset({...base,qty:1.5}),RangeError);
 assert.throws(()=>validateMaintenanceAsset({...base,qty:Number.MAX_SAFE_INTEGER+1}),RangeError);
 assert.throws(()=>validateMaintenanceAsset({...base,cycle:"未知等级"}),RangeError);
 assert.throws(()=>validateMaintenanceAsset({...base,freq:" "}),/freq is required/);
});
test("rejects invalid or reversed equipment maintenance dates while allowing unset dates",()=>{
 const base={name:"Bench",qty:1,cycle:"一级保养",freq:"按需"};
 assert.throws(()=>validateMaintenanceAsset({...base,last:"2026-02-30",next:""}),/calendar date/);
 assert.throws(()=>validateMaintenanceAsset({...base,last:"2026-05-01",next:"2026-04-30"}),/cannot precede/);
 const valid=validateMaintenanceAsset({...base,last:"",next:""});
 assert.equal(valid.last,"");
 assert.equal(valid.next,"");
});


test("classifies maintenance schedule dates against an explicit local calendar day",()=>{
 const asOf=new Date("2026-10-19T12:00:00+08:00");
 assert.deepEqual(getMaintenanceScheduleStatus("",asOf),{
  status:"unscheduled",daysUntil:null,nextDate:""
 });
 assert.deepEqual(getMaintenanceScheduleStatus("2026-10-18",asOf),{
  status:"overdue",daysUntil:-1,nextDate:"2026-10-18"
 });
 assert.deepEqual(getMaintenanceScheduleStatus("2026-10-19",asOf),{
  status:"due-soon",daysUntil:0,nextDate:"2026-10-19"
 });
 assert.deepEqual(getMaintenanceScheduleStatus("2026-11-18",asOf),{
  status:"due-soon",daysUntil:30,nextDate:"2026-11-18"
 });
 assert.deepEqual(getMaintenanceScheduleStatus("2026-11-19",asOf),{
  status:"scheduled",daysUntil:31,nextDate:"2026-11-19"
 });
});
test("rejects malformed maintenance dates and invalid schedule policy inputs",()=>{
 assert.throws(()=>getMaintenanceScheduleStatus("2026-02-30",new Date("2026-10-19T00:00:00Z")),TypeError);
 assert.throws(()=>getMaintenanceScheduleStatus("2026-10-20",new Date("invalid")),TypeError);
 assert.throws(()=>getMaintenanceScheduleStatus("2026-10-20",new Date(),-1),RangeError);
 assert.throws(()=>getMaintenanceScheduleStatus("2026-10-20",new Date(),3651),RangeError);
});


test("experiment equipment readiness explains missing or invalid calibration before test start",()=>{
 const equipment=[{id:7,name:"Polarization bench"},{id:" 8 ",name:"Gas analyser"}];
 const at=new Date("2026-10-19T00:00:00.000Z");
 const record=(id,assetId,date,result="pass",days=365)=>createCalibrationRecord({
  id,assetId,calibratedAt:date,validForDays:days,certificateNo:"CERT-"+id,
  organization:"Metrology Lab",operator:"Operator",result
 });
 const current=getExperimentEquipmentReadiness({
  assetId:" 7 ",equipment,calibrationRecords:[record(1,7,"2026-10-01T00:00:00Z")],at
 });
 assert.equal(current.ready,true);
 assert.equal(current.status,"current");
 assert.equal(current.label,"校准有效");
 assert.equal(current.assetId,"7");
 assert.equal(current.assetExists,true);
 assert.ok(Object.isFrozen(current));

 const duplicateAsset=getExperimentEquipmentReadiness({
  assetId:7,equipment:[...equipment,{id:" 7 ",name:"Duplicate master-data row"}],
  calibrationRecords:[record(9,7,"2026-10-01T00:00:00Z")],at
 });
 assert.equal(duplicateAsset.assetExists,true);
 assert.equal(duplicateAsset.ready,false,
  "duplicate equipment IDs must block readiness even when one calibration certificate is current");
 assert.equal(duplicateAsset.status,"asset-ambiguous");
 assert.equal(duplicateAsset.label,"设备编号冲突");

 const cases=[
  [[], "not-recorded", "设备尚无校准记录"],
  [[record(2,7,"2026-10-01T00:00:00Z","fail")],"failed","设备最近一次校准不合格"],
  [[record(3,7,"2025-01-01T00:00:00Z","pass",30)],"expired","设备校准已过期"],
  [[record(4,7,"2026-10-20T00:00:00Z")],"future-dated","设备校准日期晚于当前日期，请核实证书"],
  [[record(5,7,"2026-10-01T00:00:00Z"),record(6,7,"2026-10-01T00:00:00Z")],"ambiguous","设备存在同一时刻的多份最新校准记录，无法确认有效证书"]
 ];
 for(const [calibrationRecords,status,message] of cases){
  const result=getExperimentEquipmentReadiness({assetId:7,equipment,calibrationRecords,at});
  assert.equal(result.ready,false);
  assert.equal(result.status,status);
  assert.equal(result.message,message);
 }
 const absent=getExperimentEquipmentReadiness({assetId:9,equipment,calibrationRecords:[],at});
 assert.equal(absent.assetExists,false);
 assert.equal(absent.status,"not-registered");
 assert.throws(()=>getExperimentEquipmentReadiness({assetId:" ",equipment,calibrationRecords:[],at}),TypeError);
 assert.throws(()=>getExperimentEquipmentReadiness({assetId:7,equipment:{},calibrationRecords:[],at}),TypeError);
});


test("rejects duplicate canonical calibration record IDs for one asset",()=>{
 const record=(id,calibratedAt)=>createCalibrationRecord({
  id,assetId:7,calibratedAt,validForDays:365,certificateNo:"CERT-"+String(id),
  organization:"org",operator:"operator",result:"pass"
 });
 assert.throws(()=>getAssetCalibrationStatus([
  record(9,"2026-09-01T00:00:00Z"),
  record("9","2026-10-01T00:00:00Z")
 ],7,new Date("2026-10-19T00:00:00Z")),
 /calibration record ids must be unique for an asset/);
});

test("rejects unsupported test diary fields instead of carrying unvalidated workflow flags",()=>{
 const base={start:"2026-10-17",end:"2026-10-18",duration:2,unit:"Cell-A",operator:"operator-1"};
 assert.throws(()=>validateTestDiaryEntry({...base,approved:true}),/unsupported fields/);
 assert.throws(()=>validateTestDiaryEntry({...base,role:"administrator"}),/unsupported fields/);
 const valid=validateTestDiaryEntry(base);
 assert.equal(Object.hasOwn(valid,"approved"),false);
 assert.equal(Object.hasOwn(valid,"role"),false);
});
