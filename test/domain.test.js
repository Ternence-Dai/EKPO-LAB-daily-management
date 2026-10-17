import test from "node:test";
import assert from "node:assert/strict";
import { transitionExperiment, isCalibrationCurrent } from "../src/domain/index.js";
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
