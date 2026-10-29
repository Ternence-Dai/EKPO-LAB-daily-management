
function parseMaintenanceDate(value, field) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new TypeError(`maintenance ${field} must be a valid calendar date`);
  }
  const date = new Date(value + "T00:00:00.000Z");
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new TypeError(`maintenance ${field} must be a valid calendar date`);
  }
  return value;
}

export function getMaintenanceScheduleStatus(nextDate, asOf = new Date(), dueSoonDays = 30) {
  if (!(asOf instanceof Date) || !Number.isFinite(asOf.getTime())) {
    throw new TypeError("maintenance status reference date must be a valid Date");
  }
  if (!Number.isSafeInteger(dueSoonDays) || dueSoonDays < 0 || dueSoonDays > 3650) {
    throw new RangeError("dueSoonDays must be a safe integer from 0 to 3650");
  }
  const normalizedNextDate = parseMaintenanceDate(nextDate, "next date");
  if (!normalizedNextDate) {
    return Object.freeze({ status:"unscheduled", daysUntil:null, nextDate:"" });
  }
  const [nextYear, nextMonth, nextDay] = normalizedNextDate.split("-").map(Number);
  const next = new Date(0);
  next.setUTCFullYear(nextYear, nextMonth - 1, nextDay);
  next.setUTCHours(0, 0, 0, 0);
  const today = new Date(0);
  today.setUTCFullYear(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate());
  today.setUTCHours(0, 0, 0, 0);
  const daysUntil = Math.round((next.getTime() - today.getTime()) / 86400000);
  const status = daysUntil < 0 ? "overdue"
    : daysUntil <= dueSoonDays ? "due-soon" : "scheduled";
  return Object.freeze({ status, daysUntil, nextDate:normalizedNextDate });
}

export function validateMaintenanceAsset(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new TypeError("maintenance asset must be an object");
  }
  const allowedFields = new Set([
    "name", "category", "location", "qty", "cycle", "freq",
    "last", "next", "responsible", "record", "purchasePrice", "purchaseDate"
  ]);
  if (Object.keys(entry).some(field => !allowedFields.has(field))) {
    throw new TypeError("maintenance asset contains unsupported fields");
  }
  const textField = (field, maxLength, required = false) => {
    if (entry[field] === undefined || entry[field] === null) {
      if (required) throw new TypeError(`maintenance ${field} is required`);
      return "";
    }
    if (typeof entry[field] !== "string") throw new TypeError(`maintenance ${field} must be text`);
    const value = entry[field].trim();
    if (required && !value) throw new TypeError(`maintenance ${field} is required`);
    if (value.length > maxLength) throw new RangeError(`maintenance ${field} exceeds ${maxLength} characters`);
    if (/[\x00-\x1F\x7F]/.test(value)) throw new TypeError(`maintenance ${field} must not contain control characters`);
    return value;
  };
  const name = textField("name", 120, true);
  if (!Number.isSafeInteger(entry.qty) || entry.qty < 1) {
    throw new RangeError("maintenance asset quantity must be a positive safe integer");
  }
  const allowedCycles = new Set(["一级保养", "二级保养", "三级保养"]);
  if (!allowedCycles.has(entry.cycle)) throw new RangeError("maintenance cycle is invalid");
  const freq = textField("freq", 80, true);
  const last = parseMaintenanceDate(entry.last, "last date");
  const next = parseMaintenanceDate(entry.next, "next date");
  if (last && next && next < last) {
    throw new RangeError("next maintenance date cannot precede last maintenance date");
  }
  let purchasePrice;
  if (entry.purchasePrice !== undefined && entry.purchasePrice !== null && entry.purchasePrice !== "") {
    if (typeof entry.purchasePrice !== "number" || !Number.isFinite(entry.purchasePrice) || entry.purchasePrice < 0) {
      throw new RangeError("maintenance purchase price must be a non-negative finite number");
    }
    purchasePrice = entry.purchasePrice;
  }
  const purchaseDate = parseMaintenanceDate(entry.purchaseDate, "purchase date");
  return Object.freeze({
    name,
    category: textField("category", 80),
    location: textField("location", 120),
    qty: entry.qty,
    cycle: entry.cycle,
    freq,
    last,
    next,
    responsible: textField("responsible", 120),
    record: textField("record", 2000),
    ...(purchasePrice !== undefined ? { purchasePrice } : {}),
    ...(purchaseDate ? { purchaseDate } : {})
  });
}

const transitions = { planned:["in-progress","cancelled"], "in-progress":["completed","cancelled"], completed:[], cancelled:[] };
const experimentStatuses = new Set(["planned", "in-progress", "completed", "cancelled"]);
function parseExperimentDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new TypeError("experiment plannedDate must be a valid calendar date");
  }
  const date = new Date(value + "T00:00:00.000Z");
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new TypeError("experiment plannedDate must be a valid calendar date");
  }
  return value;
}
function normalizeExperimentInstant(value, field) {
  const timestamp = parseCalibrationInstant(value);
  const date = new Date(timestamp);
  const year = date.getUTCFullYear();
  if (year < 0 || year > 9999) throw new TypeError(`experiment ${field} normalizes outside the supported UTC year range`);
  return date.toISOString();
}
function requiredExperimentText(entry, field, maxLength) {
  if (typeof entry[field] !== "string" || !entry[field].trim()) {
    throw new TypeError(`experiment ${field} is required`);
  }
  const value = entry[field].trim();
  if (value.length > maxLength) throw new RangeError(`experiment ${field} exceeds ${maxLength} characters`);
  if ([...value].some(character => character.charCodeAt(0) <= 31 || character.charCodeAt(0) === 127)) throw new TypeError(`experiment ${field} must not contain control characters`);
  return value;
}
export function createExperimentRecord(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new TypeError("experiment record must be an object");
  }
  const allowedFields = new Set(["id","title","assetId","plannedDate","owner","purpose","actor","createdAt","budget"]);
  let budget;
  if (entry.budget !== undefined && entry.budget !== null && entry.budget !== "") {
    if (typeof entry.budget !== "number" || !Number.isFinite(entry.budget) || entry.budget < 0) {
      throw new RangeError("experiment budget must be a non-negative finite number");
    }
    budget = entry.budget;
  }
  if (Object.keys(entry).some(field => !allowedFields.has(field))) throw new TypeError("experiment record contains unsupported creation fields");
  if (typeof entry.id !== "string" || !entry.id.trim() || entry.id.trim().length > 80 ||
      [...entry.id].some(character => character.charCodeAt(0) <= 31 || character.charCodeAt(0) === 127)) {
    throw new TypeError("experiment id is required and must not contain control characters");
  }
  if (!(typeof entry.assetId === "string" || Number.isSafeInteger(entry.assetId)) ||
      String(entry.assetId).trim() === "" || String(entry.assetId).length > 80 ||
      [...String(entry.assetId)].some(character => character.charCodeAt(0) <= 31 || character.charCodeAt(0) === 127)) {
    throw new TypeError("experiment asset reference is required and must be safe text");
  }
  const title = requiredExperimentText(entry, "title", 120);
  const owner = requiredExperimentText(entry, "owner", 120);
  const purpose = requiredExperimentText(entry, "purpose", 2000);
  const actor = requiredExperimentText(entry, "actor", 120);
  const plannedDate = parseExperimentDate(entry.plannedDate);
  const createdAtInput = entry.createdAt === undefined ? new Date().toISOString() : entry.createdAt;
  const createdAt = normalizeExperimentInstant(createdAtInput, "createdAt");
  return Object.freeze({
    id: entry.id.trim(),
    title,
    assetId: String(entry.assetId).trim(),
    plannedDate,
    owner,
    purpose,
    ...(budget !== undefined ? { budget } : {}),
    status: "planned",
    createdAt,
    audit: Object.freeze([Object.freeze({ from: "new", to: "planned", actor, at: createdAt })])
  });
}
export function validateExperimentRecord(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new TypeError("experiment record must be an object");
  }
  const allowedFields = new Set(["id", "title", "assetId", "plannedDate", "owner", "purpose", "status", "createdAt", "audit", "budget"]);
  if (Object.keys(entry).some(field => !allowedFields.has(field))) {
    throw new TypeError("experiment record contains unsupported fields");
  }
  if (entry.budget !== undefined && entry.budget !== null &&
      (typeof entry.budget !== "number" || !Number.isFinite(entry.budget) || entry.budget < 0)) {
    throw new RangeError("experiment budget must be a non-negative finite number");
  }
  if (typeof entry.id !== "string" || !entry.id.trim() || entry.id.trim().length > 80 ||
      [...entry.id].some(character => character.charCodeAt(0) <= 31 || character.charCodeAt(0) === 127)) {
    throw new TypeError("experiment id is required and must not contain control characters");
  }
  if (!(typeof entry.assetId === "string" || Number.isSafeInteger(entry.assetId)) ||
      String(entry.assetId).trim() === "" || String(entry.assetId).length > 80 ||
      [...String(entry.assetId)].some(character => character.charCodeAt(0) <= 31 || character.charCodeAt(0) === 127)) {
    throw new TypeError("experiment asset reference is required and must be safe text");
  }
  const title = requiredExperimentText(entry, "title", 120);
  const owner = requiredExperimentText(entry, "owner", 120);
  const purpose = requiredExperimentText(entry, "purpose", 2000);
  const plannedDate = parseExperimentDate(entry.plannedDate);
  const createdAt = normalizeExperimentInstant(entry.createdAt, "createdAt");
  if (!experimentStatuses.has(entry.status)) throw new RangeError("experiment status is invalid");
  if (!Array.isArray(entry.audit) || entry.audit.length < 1) {
    throw new TypeError("experiment audit history must include record creation");
  }
  if (entry.audit.length > 50000) {
    throw new RangeError("experiment audit history exceeds the 50000-record validation limit");
  }
  let expectedStatus = "planned";
  let previousTimestamp = -Infinity;
  const audit = entry.audit.map((record, index) => {
    if (!record || typeof record !== "object" || Array.isArray(record) ||
        Object.values(record).some(value => typeof value !== "string")) {
      throw new TypeError("experiment audit entries must contain only string fields");
    }
    const auditFields = ["from", "to", "actor", "at", "consumablesCheckNote"];
    const requiredAuditFields = ["from", "to", "actor", "at"];
    if (Object.keys(record).some(field => !auditFields.includes(field)) ||
        requiredAuditFields.some(field => typeof record[field] !== "string")) {
      throw new TypeError("experiment audit entries must use the immutable lifecycle schema");
    }
    if (Object.hasOwn(record, "consumablesCheckNote")) {
      if (record.to !== "in-progress" || typeof record.consumablesCheckNote !== "string" ||
          !record.consumablesCheckNote.trim() || record.consumablesCheckNote.trim().length > 500 ||
          [...record.consumablesCheckNote].some(character => character.charCodeAt(0) <= 31 || character.charCodeAt(0) === 127)) {
        throw new TypeError("consumables SOP attestation must be bounded non-empty text on the experiment start event");
      }
    }
    if (record.to === "in-progress" && !Object.hasOwn(record, "consumablesCheckNote")) {
      throw new TypeError("experiment start audit event must include its consumables SOP attestation");
    }
    if (typeof record.actor !== "string" || !record.actor.trim() ||
        record.actor.trim().length > 120 || [...record.actor].some(character => character.charCodeAt(0) <= 31 || character.charCodeAt(0) === 127)) {
      throw new TypeError("experiment audit actor is required, bounded and free of control characters");
    }
    const at = normalizeExperimentInstant(record.at, "audit timestamp");
    const timestamp = Date.parse(at);
    if (timestamp < previousTimestamp) throw new RangeError("experiment audit timestamps must be chronological");
    previousTimestamp = timestamp;
    if (index === 0) {
      if (record.from !== "new" || record.to !== "planned" || timestamp !== Date.parse(createdAt)) {
        throw new RangeError("experiment creation audit event is invalid");
      }
    } else {
      if (record.from !== expectedStatus || !transitions[expectedStatus].includes(record.to)) {
        throw new RangeError("experiment audit contains an invalid lifecycle transition");
      }
    }
    expectedStatus = record.to;
    return Object.freeze({
      ...record,
      actor: record.actor.trim(),
      at,
      ...(Object.hasOwn(record, "consumablesCheckNote")
        ? {consumablesCheckNote:record.consumablesCheckNote.trim()}
        : {})
    });
  });
  if (expectedStatus !== entry.status) {
    throw new RangeError("experiment status does not match its audit history");
  }
  return Object.freeze({
    ...entry,
    id: entry.id.trim(),
    title,
    assetId: String(entry.assetId).trim(),
    plannedDate,
    owner,
    purpose,
    status: entry.status,
    createdAt,
    audit: Object.freeze(audit)
  });
}
export function transitionExperiment(experiment, nextStatus, actor, at = new Date().toISOString(), consumablesCheckNote, asOf = new Date()) {
  // A transition is only valid from a complete, traceable record. Do not let
  // callers append an audit event to a status-only or otherwise corrupt object.
  const current = validateExperimentRecord(experiment);
  if (typeof actor !== "string" || !actor.trim()) throw new TypeError("actor is required for audit");
  if (!Object.hasOwn(transitions, current.status)) throw new RangeError("unknown current status");
  if (!transitions[current.status].includes(nextStatus)) {
    throw new RangeError(`transition ${current.status} -> ${nextStatus} is not allowed`);
  }
  const normalizedAt = normalizeExperimentInstant(at, "audit timestamp");
  if (!(asOf instanceof Date) || !Number.isFinite(asOf.getTime())) {
    throw new TypeError("experiment transition reference time must be a valid Date");
  }
  if (Date.parse(normalizedAt) > asOf.getTime()) {
    throw new RangeError("future-dated experiment lifecycle transition cannot be posted");
  }
  const previousAt = Date.parse(current.audit[current.audit.length - 1].at);
  if (Date.parse(normalizedAt) < previousAt) {
    throw new RangeError("experiment audit timestamps must be chronological");
  }
  let normalizedConsumablesCheckNote;
  if (nextStatus === "in-progress") {
    if (typeof consumablesCheckNote !== "string" || !consumablesCheckNote.trim()) {
      throw new TypeError("consumables SOP attestation is required before starting an experiment");
    }
    normalizedConsumablesCheckNote = consumablesCheckNote.trim();
    if (normalizedConsumablesCheckNote.length > 500 ||
        [...normalizedConsumablesCheckNote].some(character => character.charCodeAt(0) <= 31 || character.charCodeAt(0) === 127)) {
      throw new RangeError("consumables SOP attestation must be at most 500 characters and contain no control characters");
    }
  } else if (consumablesCheckNote !== undefined) {
    throw new TypeError("consumables SOP attestation is only accepted when starting an experiment");
  }
  const startEvidence = nextStatus === "in-progress"
    ? {consumablesCheckNote:normalizedConsumablesCheckNote}
    : {};
  const audit = [
    ...current.audit,
    Object.freeze({ from:current.status, to:nextStatus, actor:actor.trim(), at:normalizedAt, ...startEvidence })
  ];
  return validateExperimentRecord({ ...current, status:nextStatus, audit });
}
function parseCalibrationInstant(value) {
  if (typeof value !== "string") throw new TypeError("calibratedAt must be an ISO timestamp with an explicit timezone");
  const match = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.\d{1,3})?)?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!match) throw new TypeError("calibratedAt must be an ISO timestamp with an explicit timezone");
  const [, yearText, monthText, dayText, , , , zone, , offsetHourText, offsetMinuteText] = match;
  const year = Number(yearText), month = Number(monthText), day = Number(dayText);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]) {
    throw new TypeError("calibratedAt contains an invalid calendar date");
  }
  if (zone !== "Z") {
    const offsetHour = Number(offsetHourText), offsetMinute = Number(offsetMinuteText);
    if (offsetMinute > 59 || offsetHour > 14 || (offsetHour === 14 && offsetMinute !== 0) ||
        (match[8] === "-" && offsetHour === 0 && offsetMinute === 0)) {
      throw new TypeError("calibratedAt contains an invalid or unknown timezone offset");
    }
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new TypeError("calibratedAt must be a valid ISO timestamp");
  return timestamp;
}
export function isCalibrationCurrent({ calibratedAt, validForDays }, at = new Date()) {
  const calibratedTimestamp = parseCalibrationInstant(calibratedAt);
  if (!Number.isSafeInteger(validForDays) || validForDays < 0) throw new RangeError("validForDays must be a non-negative safe integer");
  if (!(at instanceof Date) || !Number.isFinite(at.getTime())) throw new TypeError("at must be a valid Date");
  const expiry = calibratedTimestamp + validForDays * 86400000;
  if (!Number.isFinite(expiry) || Math.abs(expiry) > 8.64e15) throw new RangeError("calibration expiry is outside the supported date range");
  // A future-dated certificate is not evidence that calibration has already
  // occurred; keep the primitive predicate consistent with readiness checks.
  return calibratedTimestamp <= at.getTime() && at.getTime() <= expiry;
}
export function getAssetCalibrationStatus(records, assetId, at = new Date()) {
  if (!Array.isArray(records)) throw new TypeError("calibration records must be an array");
  if (records.length > 50000) throw new RangeError("calibration history exceeds the 50000-record validation limit");
  if (!(typeof assetId === "string" || Number.isSafeInteger(assetId)) || String(assetId).trim() === "") {
    throw new TypeError("assetId is required");
  }
  if (!(at instanceof Date) || !Number.isFinite(at.getTime())) {
    throw new TypeError("at must be a valid Date");
  }
  const normalizedAssetId = String(assetId).trim();
  const calibrationIds = new Set();
  const matching = records
    .filter(record => record && String(record.assetId).trim() === normalizedAssetId)
    .map(record => {
      const normalized = createCalibrationRecord(record);
      const identity = String(normalized.id);
      if (calibrationIds.has(identity)) {
        throw new RangeError("calibration record ids must be unique for an asset");
      }
      calibrationIds.add(identity);
      return normalized;
    })
    .sort((a, b) => Date.parse(b.calibratedAt) - Date.parse(a.calibratedAt));
  if (!matching.length) return "not-recorded";
  const latest = matching[0];
  const latestTime = Date.parse(latest.calibratedAt);
  if (latestTime > at.getTime()) return "future-dated";
  if (matching.length > 1 && Date.parse(matching[1].calibratedAt) === latestTime) {
    return "ambiguous";
  }
  if (latest.result === "fail") return "failed";
  return isCalibrationCurrent(latest, at) ? "current" : "expired";
}

export function getExperimentPreflightReadiness({
  assetId, plannedDate, equipment, calibrationRecords, at = new Date(), dueSoonDays = 30
} = {}) {
  // A planned experiment is only operationally eligible when calibration and
  // the scheduled maintenance window both cover its planned execution date.
  const normalizedPlannedDate = parseExperimentDate(plannedDate);
  // Keep two independent gates: evidence must already exist now, and remain
  // valid through the complete planned calendar day (the form has no time field).
  const currentCalibration = getExperimentEquipmentReadiness({
    assetId, equipment, calibrationRecords, at
  });
  const plannedDateEnd = new Date(normalizedPlannedDate + "T23:59:59.999Z");
  const plannedCalibration = getExperimentEquipmentReadiness({
    assetId, equipment, calibrationRecords, at:plannedDateEnd
  });
  const calibration = currentCalibration.ready ? plannedCalibration : currentCalibration;
  const normalizedAssetId = String(assetId).trim();
  const matchingAssets = equipment.filter(item => item &&
    (typeof item.id === "string" || Number.isSafeInteger(item.id)) &&
    String(item.id).trim() === normalizedAssetId);
  if (!calibration.assetExists || matchingAssets.length !== 1) {
    return Object.freeze({
      ...calibration,
      calibrationReady: false,
      maintenanceReady: false,
      maintenanceStatus: "unverified",
      maintenanceNextDate: "",
      maintenanceDaysUntil: null,
      plannedDate: normalizedPlannedDate,
      consumablesStatus: "not-assessed",
      consumablesMessage: "实验计划未关联结构化耗材清单；开始前仍须按适用 SOP 核对批次、余量和有效期。",
      ready: false,
      preflightStatus: "blocked",
      warning: ""
    });
  }

  let maintenance;
  try {
    maintenance = getMaintenanceScheduleStatus(matchingAssets[0].next || "", at, dueSoonDays);
  } catch (error) {
    maintenance = Object.freeze({status:"invalid", daysUntil:null, nextDate:""});
  }

  let maintenanceReady = true;
  let maintenanceMessage = "";
  if (maintenance.status === "unscheduled") {
    maintenanceReady = false;
    maintenanceMessage = "设备未记录下次维护日期，无法确认计划期间的维护覆盖";
  } else if (maintenance.status === "overdue") {
    maintenanceReady = false;
    maintenanceMessage = "设备维护已逾期，完成维护并更新台账前不能开始实验";
  } else if (maintenance.status === "invalid") {
    maintenanceReady = false;
    maintenanceMessage = "设备下次维护日期格式无效，需先核对设备台账";
  } else if (normalizedPlannedDate >= maintenance.nextDate) {
    maintenanceReady = false;
    maintenanceMessage = "计划日期达到或晚于下次维护日期，请先安排维护";
  } else if (maintenance.status === "due-soon") {
    maintenanceMessage = "设备将在 " + maintenance.daysUntil +
      " 天后到期维护；实验计划早于维护日期，但需按 SOP 确认窗口";
  }

  const calibrationReady = currentCalibration.ready && plannedCalibration.ready;
  const calibrationMessage = !currentCalibration.ready
    ? currentCalibration.message
    : !plannedCalibration.ready && plannedCalibration.status === "expired"
      ? "当前校准证据仍有效，但有效期不能覆盖计划日期 " + normalizedPlannedDate + " 的全天；请更新校准或调整计划日期"
      : plannedCalibration.message;
  const ready = calibrationReady && maintenanceReady;
  const warnings = [];
  if (!calibrationReady) warnings.push(calibrationMessage);
  if (maintenanceMessage) warnings.push(maintenanceMessage);
  const label = !calibrationReady ? calibration.label
    : !maintenanceReady ? (maintenance.status === "overdue" ? "维护已逾期" :
      maintenance.status === "unscheduled" ? "维护日期未记录" : "维护窗口待核验")
    : maintenance.status === "due-soon" ? "可安排 · 维护将到期" : "设备准备条件通过";

  return Object.freeze({
    ...calibration,
    calibrationReady,
    calibrationStatusAsOfNow: currentCalibration.status,
    calibrationStatusOnPlannedDate: plannedCalibration.status,
    calibrationMessage,
    maintenanceReady,
    maintenanceStatus: maintenance.status,
    maintenanceNextDate: maintenance.nextDate,
    maintenanceDaysUntil: maintenance.daysUntil,
    plannedDate: normalizedPlannedDate,
    consumablesStatus: "not-assessed",
    consumablesMessage: "实验计划未关联结构化耗材清单；开始前仍须按适用 SOP 核对批次、余量和有效期。",
    ready,
    preflightStatus: ready ? (maintenance.status === "due-soon" ? "ready-with-warning" : "ready") : "blocked",
    label,
    message: warnings.join("；") || "设备校准与计划维护日期覆盖当前计划日期",
    warning: ready && maintenance.status === "due-soon" ? maintenanceMessage : ""
  });
}

export function createCalibrationRecord(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new TypeError("calibration record must be an object");
  }
  const id = entry.id;
  if (!((typeof id === "string" && id.trim()) || Number.isSafeInteger(id))) {
    throw new TypeError("calibration record id is required");
  }
  if (typeof id === "string" && (!id.trim() || /[\x00-\x1F\x7F]/.test(id))) {
    throw new TypeError("calibration record id must be non-empty and free of control characters");
  }
  if (typeof id === "string" && id.trim().length > 80) {
    throw new RangeError("calibration record id must not exceed 80 characters");
  }
  if (!(typeof entry.assetId === "string" || Number.isSafeInteger(entry.assetId)) ||
      String(entry.assetId).trim() === "" || String(entry.assetId).trim().length > 80 ||
      /[\x00-\x1F\x7F]/.test(String(entry.assetId))) {
    throw new TypeError("calibration asset reference must be non-empty, bounded and free of control characters");
  }
  const calibratedTimestamp = parseCalibrationInstant(entry.calibratedAt);
  const normalizedDate = new Date(calibratedTimestamp);
  const normalizedYear = normalizedDate.getUTCFullYear();
  if (normalizedYear < 0 || normalizedYear > 9999) {
    throw new TypeError("calibratedAt normalizes outside the supported four-digit UTC year range");
  }
  if (!Number.isSafeInteger(entry.validForDays) || entry.validForDays < 1) {
    throw new RangeError("validForDays must be a positive safe integer");
  }
  const requiredText = (field, maxLength) => {
    if (typeof entry[field] !== "string" || !entry[field].trim()) {
      throw new TypeError(`calibration ${field} is required`);
    }
    const value = entry[field].trim();
    if (value.length > maxLength) throw new RangeError(`calibration ${field} exceeds ${maxLength} characters`);
    if (/[\x00-\x1F\x7F]/.test(value)) throw new TypeError(`calibration ${field} must not contain control characters`);
    return value;
  };
  if (!["pass", "fail"].includes(entry.result)) {
    throw new RangeError("calibration result must be pass or fail");
  }
  let cost;
  if (entry.cost !== undefined && entry.cost !== null && entry.cost !== "") {
    if (typeof entry.cost !== "number" || !Number.isFinite(entry.cost) || entry.cost < 0) {
      throw new RangeError("calibration cost must be a non-negative finite number");
    }
    cost = entry.cost;
  }
  if (entry.notes !== undefined && entry.notes !== null && typeof entry.notes !== "string") {
    throw new TypeError("calibration notes must be text");
  }
  const notes = typeof entry.notes === "string" ? entry.notes.trim() : "";
  if (notes.length > 2000) throw new RangeError("calibration notes must not exceed 2000 characters");
  if (/[\x00-\x1F\x7F]/.test(notes)) throw new TypeError("calibration notes must not contain control characters");
  const expiry = calibratedTimestamp + entry.validForDays * 86400000;
  if (!Number.isFinite(expiry) || Math.abs(expiry) > 8.64e15) {
    throw new RangeError("calibration expiry is outside the supported date range");
  }
  return Object.freeze({
    id: typeof id === "string" ? id.trim() : id,
    assetId: String(entry.assetId).trim(),
    calibratedAt: normalizedDate.toISOString(),
    validForDays: entry.validForDays,
    certificateNo: requiredText("certificateNo", 120),
    organization: requiredText("organization", 180),
    operator: requiredText("operator", 120),
    result: entry.result,
    notes,
    ...(cost !== undefined ? { cost } : {})
  });
}
function normalizeDiaryDate(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`test ${label} must be valid`);
  // Date-only form controls represent calendar days, not UTC instants. Keep
  // that representation stable so charts do not shift the day by timezone.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const normalized = new Date(value + "T00:00:00.000Z");
    if (!Number.isFinite(normalized.getTime()) || normalized.toISOString().slice(0,10) !== value) {
      throw new TypeError(`test ${label} must be a valid calendar date`);
    }
    return value;
  }
  let timestamp;
  try {
    timestamp = parseCalibrationInstant(value);
  } catch {
    throw new TypeError(`test ${label} must be an ISO timestamp with an explicit timezone and millisecond precision or less`);
  }
  const normalized = new Date(timestamp);
  const normalizedYear = normalized.getUTCFullYear();
  if (normalizedYear < 0 || normalizedYear > 9999) {
    throw new TypeError(`test ${label} normalizes outside the supported four-digit UTC year range`);
  }
  return normalized.toISOString();
}
export function validateTestDiaryEntry(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new TypeError("test diary entry is required");
  const allowedFields = new Set([
    "start", "end", "duration", "unit", "operator",
    "sap", "result", "cycle", "error", "errorDesc", "cost"
  ]);
  if (Object.keys(entry).some(field => !allowedFields.has(field))) {
    throw new TypeError("test diary entry contains unsupported fields");
  }
  const { start, end, duration, unit, operator } = entry;
  const normalizedStart = normalizeDiaryDate(start, "start time");
  const normalizedEnd = normalizeDiaryDate(end, "end time");
  if (Date.parse(normalizedEnd) < Date.parse(normalizedStart)) throw new RangeError("test end time cannot precede start time");
  if (!Number.isFinite(duration) || duration <= 0 || duration > Number.MAX_SAFE_INTEGER) {
    throw new RangeError("test duration must be a positive finite number within the safe numeric range");
  }
  const requiredText = (value, field, maxLength) => {
    if (typeof value !== "string" || !value.trim()) throw new TypeError(`test ${field} is required`);
    const normalized = value.trim();
    if (normalized.length > maxLength) throw new RangeError(`test ${field} exceeds ${maxLength} characters`);
    if (/[\x00-\x1F\x7F]/.test(normalized)) throw new TypeError(`test ${field} must not contain control characters`);
    return normalized;
  };
  const optionalText = (value, field, maxLength) => {
    if (value === undefined || value === null || value === "") return "";
    if (typeof value !== "string") throw new TypeError(`test ${field} must be text`);
    const normalized = value.trim();
    if (normalized.length > maxLength) throw new RangeError(`test ${field} exceeds ${maxLength} characters`);
    if (/[\x00-\x1F\x7F]/.test(normalized)) throw new TypeError(`test ${field} must not contain control characters`);
    return normalized;
  };
  let cost;
  if (entry.cost !== undefined && entry.cost !== null && entry.cost !== "") {
    if (typeof entry.cost !== "number" || !Number.isFinite(entry.cost) || entry.cost < 0) {
      throw new RangeError("test cost must be a non-negative finite number");
    }
    cost = entry.cost;
  }
  return Object.freeze({
    start:normalizedStart,
    end:normalizedEnd,
    duration,
    unit:requiredText(unit, "unit", 120),
    operator:requiredText(operator, "operator", 120),
    sap:optionalText(entry.sap, "air-tightness result", 120),
    result:optionalText(entry.result, "result", 120),
    cycle:optionalText(entry.cycle, "cycle count", 40),
    error:optionalText(entry.error, "error code", 120),
    errorDesc:optionalText(entry.errorDesc, "error description", 2000),
    ...(cost !== undefined ? { cost } : {})
  });
}


const experimentCalibrationMessages = {
  "not-registered": "关联设备已不在设备台账中",
  "asset-ambiguous": "设备台账存在重复资产编号，必须先完成主数据核对",
  "not-recorded": "设备尚无校准记录",
  failed: "设备最近一次校准不合格",
  expired: "设备校准已过期",
  "future-dated": "设备校准日期晚于当前日期，请核实证书",
  ambiguous: "设备存在同一时刻的多份最新校准记录，无法确认有效证书",
  current: "校准有效"
};

export function getExperimentEquipmentReadiness({
  assetId, equipment, calibrationRecords, at = new Date()
} = {}) {
  if (!(typeof assetId === "string" || Number.isSafeInteger(assetId)) ||
      String(assetId).trim() === "" || String(assetId).length > 80 ||
      [...String(assetId)].some(character => character.charCodeAt(0) <= 31 || character.charCodeAt(0) === 127)) {
    throw new TypeError("experiment equipment assetId is required and must be safe text");
  }
  if (!Array.isArray(equipment)) throw new TypeError("experiment equipment register must be an array");
  if (!Array.isArray(calibrationRecords)) throw new TypeError("experiment calibration records must be an array");
  if (equipment.length > 50000) throw new RangeError("experiment equipment register exceeds the 50000-record validation limit");
  if (calibrationRecords.length > 50000) throw new RangeError("experiment calibration records exceed the 50000-record validation limit");
  if (!(at instanceof Date) || !Number.isFinite(at.getTime())) {
    throw new TypeError("experiment equipment readiness reference time must be valid");
  }
  const normalizedAssetId = String(assetId).trim();
  const matchingAssets = equipment.filter(item => item &&
    (typeof item.id === "string" || Number.isSafeInteger(item.id)) &&
    String(item.id).trim() === normalizedAssetId);
  if (!matchingAssets.length) {
    return Object.freeze({
      assetId: normalizedAssetId, assetExists: false, status: "not-registered",
      ready: false, label: "设备不在台账", message: experimentCalibrationMessages["not-registered"]
    });
  }
  // Duplicate normalized IDs make the equipment-to-certificate relationship
  // ambiguous. Never select the first matching master-data row and mark it ready.
  if (matchingAssets.length > 1) {
    return Object.freeze({
      assetId: normalizedAssetId, assetExists: true, status: "asset-ambiguous",
      ready: false, label: "设备编号冲突", message: experimentCalibrationMessages["asset-ambiguous"]
    });
  }
  const calibrationStatus = getAssetCalibrationStatus(calibrationRecords, normalizedAssetId, at);
  return Object.freeze({
    assetId: normalizedAssetId,
    assetExists: true,
    status: calibrationStatus,
    ready: calibrationStatus === "current",
    label: calibrationStatus === "current" ? "校准有效" : "校准" + ({
      "not-recorded": "未记录",
      failed: "不合格",
      expired: "已过期",
      "future-dated": "日期待核实",
      ambiguous: "记录冲突"
    }[calibrationStatus] || "状态待核实"),
    message: experimentCalibrationMessages[calibrationStatus] || "设备校准状态无法确认"
  });
}
