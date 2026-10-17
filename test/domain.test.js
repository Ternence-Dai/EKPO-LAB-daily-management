import test from "node:test";
import assert from "node:assert/strict";
import { transitionExperiment, isCalibrationCurrent, validateTestDiaryEntry } from "../src/domain/index.js";
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
 const valid=validateTestDiaryEntry({start:"2026-10-17T09:00:00",end:"2026-10-17T10:30:00",duration:1.5,unit:"Cell-A",operator:"operator-1",result:"pass"});
 assert.equal(valid.duration,1.5); assert.equal(valid.unit,"Cell-A");
});
test("rejects test diary records with reversed times, zero duration or missing traceability",()=>{
 const base={start:"2026-10-17T10:00:00",end:"2026-10-17T11:00:00",duration:1,unit:"Cell-A",operator:"operator-1"};
 assert.throws(()=>validateTestDiaryEntry({...base,end:"2026-10-17T09:00:00"}),RangeError);
 assert.throws(()=>validateTestDiaryEntry({...base,duration:0}),RangeError);
 assert.throws(()=>validateTestDiaryEntry({...base,operator:" "}),TypeError);
 assert.throws(()=>validateTestDiaryEntry({...base,unit:""}),TypeError);
});
