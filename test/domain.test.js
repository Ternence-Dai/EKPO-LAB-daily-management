import test from "node:test";
import assert from "node:assert/strict";
import { transitionExperiment, isCalibrationCurrent, validateTestDiaryEntry, validateMaintenanceAsset } from "../src/domain/index.js";
test("records authorized experiment lifecycle transition",()=>{
 const next=transitionExperiment({id:"EXP-1",status:"planned",audit:[]},"in-progress","operator-1");
 assert.equal(next.status,"in-progress"); assert.equal(next.audit.length,1);
});
test("rejects skipping experiment lifecycle states",()=>{
 assert.throws(()=>transitionExperiment({status:"planned"},"completed","operator-1"),RangeError);
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
test("calibration timestamps require an explicit timezone and real calendar date",()=>{
 const at=new Date("2026-01-15T00:00:00Z");
 assert.throws(()=>isCalibrationCurrent({calibratedAt:"2026-01-01T00:00:00",validForDays:30},at),TypeError);
 assert.throws(()=>isCalibrationCurrent({calibratedAt:"2026-02-30T00:00:00Z",validForDays:30},at),TypeError);
 assert.throws(()=>isCalibrationCurrent({calibratedAt:"2026-01-01T00:00:00+14:30",validForDays:30},at),TypeError);
 assert.throws(()=>isCalibrationCurrent({calibratedAt:"2026-01-01T00:00:00.1234Z",validForDays:30},at),TypeError);
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
test("rejects unsafe experiment diary duration magnitudes",()=>{
 const base={start:"2026-10-17",end:"2026-10-18",duration:1,unit:"Cell-A",operator:"operator-1"};
 assert.throws(()=>validateTestDiaryEntry({...base,duration:Number.MAX_SAFE_INTEGER+1}),RangeError);
 assert.throws(()=>validateTestDiaryEntry({...base,duration:1e308}),RangeError);
 assert.equal(validateTestDiaryEntry({...base,duration:0.25}).duration,0.25);
});

test("freezes copied experiment audit history and rejects malformed entries",()=>{
 const prior={from:"planned",to:"in-progress",actor:"operator-1",at:"2026-10-17T09:00:00.000Z"};
 const source={status:"in-progress",audit:[prior]};
 const next=transitionExperiment(source,"completed","operator-2");
 assert.ok(Object.isFrozen(next.audit));
 assert.ok(Object.isFrozen(next.audit[0]));
 assert.ok(Object.isFrozen(next.audit[1]));
 assert.notEqual(next.audit[0],prior);
 assert.throws(()=>{next.audit[0].actor="tampered";},TypeError);
 assert.throws(()=>{next.audit.push({});},TypeError);
 assert.equal(prior.actor,"operator-1");
 assert.throws(()=>transitionExperiment({status:"planned",audit:[null]},"in-progress","operator-1"),TypeError);
 assert.throws(()=>transitionExperiment({status:"planned",audit:["invalid"]},"in-progress","operator-1"),TypeError);
 assert.throws(()=>transitionExperiment({status:"planned",audit:[{from:"planned",to:"in-progress",actor:"operator-1",at:"2026-10-17T09:00:00.000Z",metadata:{note:"mutable"}}]},"in-progress","operator-1"),TypeError);
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
test("rejects incomplete or impossible maintenance asset quantities and cycles",()=>{
 const base={name:"Bench",category:"Equipment",location:"Lab",qty:1,cycle:"一级保养",freq:"季度",last:"2026-01-01",next:"2026-04-01"};
 assert.throws(()=>validateMaintenanceAsset({...base,name:" "}),/name is required/);
 assert.throws(()=>validateMaintenanceAsset({...base,qty:0}),RangeError);
 assert.throws(()=>validateMaintenanceAsset({...base,qty:1.5}),RangeError);
 assert.throws(()=>validateMaintenanceAsset({...base,qty:Number.MAX_SAFE_INTEGER+1}),RangeError);
 assert.throws(()=>validateMaintenanceAsset({...base,cycle:"未知等级"}),RangeError);
 assert.throws(()=>validateMaintenanceAsset({...base,freq:" "}),/frequency is required/);
});
test("rejects invalid or reversed equipment maintenance dates while allowing unset dates",()=>{
 const base={name:"Bench",qty:1,cycle:"一级保养",freq:"按需"};
 assert.throws(()=>validateMaintenanceAsset({...base,last:"2026-02-30",next:""}),/calendar date/);
 assert.throws(()=>validateMaintenanceAsset({...base,last:"2026-05-01",next:"2026-04-30"}),/cannot precede/);
 const valid=validateMaintenanceAsset({...base,last:"",next:""});
 assert.equal(valid.last,"");
 assert.equal(valid.next,"");
});
