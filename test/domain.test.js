import test from "node:test";
import assert from "node:assert/strict";
import { createExperimentRecord, validateExperimentRecord, transitionExperiment, isCalibrationCurrent, createCalibrationRecord, validateTestDiaryEntry, validateMaintenanceAsset } from "../src/domain/index.js";
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
