
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
  today.setUTCFullYear(asOf.getFullYear(), asOf.getMonth(), asOf.getDate());
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
    record: textField("record", 2000)
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
  const createdAt = normalizeExperimentInstant(entry.createdAt || new Date().toISOString(), "createdAt");
  return Object.freeze({
    id: entry.id.trim(),
    title,
    assetId: String(entry.assetId).trim(),
    plannedDate,
    owner,
    purpose,
    status: "planned",
    createdAt,
    audit: Object.freeze([Object.freeze({ from: "new", to: "planned", actor, at: createdAt })])
  });
}
export function validateExperimentRecord(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new TypeError("experiment record must be an object");
  }
  const allowedFields = new Set(["id", "title", "assetId", "plannedDate", "owner", "purpose", "status", "createdAt", "audit"]);
  if (Object.keys(entry).some(field => !allowedFields.has(field))) {
    throw new TypeError("experiment record contains unsupported fields");
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
  let expectedStatus = "planned";
  let previousTimestamp = -Infinity;
  const audit = entry.audit.map((record, index) => {
    if (!record || typeof record !== "object" || Array.isArray(record) ||
        Object.values(record).some(value => typeof value !== "string")) {
      throw new TypeError("experiment audit entries must contain only string fields");
    }
    const auditFields = ["from", "to", "actor", "at"];
    if (Object.keys(record).some(field => !auditFields.includes(field)) ||
        auditFields.some(field => typeof record[field] !== "string")) {
      throw new TypeError("experiment audit entries must use the immutable lifecycle schema");
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
    return Object.freeze({ ...record, actor: record.actor.trim(), at });
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
export function transitionExperiment(experiment, nextStatus, actor, at = new Date().toISOString()) {
  // A transition is only valid from a complete, traceable record. Do not let
  // callers append an audit event to a status-only or otherwise corrupt object.
  const current = validateExperimentRecord(experiment);
  if (typeof actor !== "string" || !actor.trim()) throw new TypeError("actor is required for audit");
  if (!Object.hasOwn(transitions, current.status)) throw new RangeError("unknown current status");
  if (!transitions[current.status].includes(nextStatus)) {
    throw new RangeError(`transition ${current.status} -> ${nextStatus} is not allowed`);
  }
  const normalizedAt = normalizeExperimentInstant(at, "audit timestamp");
  const previousAt = Date.parse(current.audit[current.audit.length - 1].at);
  if (Date.parse(normalizedAt) < previousAt) {
    throw new RangeError("experiment audit timestamps must be chronological");
  }
  const audit = [
    ...current.audit,
    Object.freeze({ from:current.status, to:nextStatus, actor:actor.trim(), at:normalizedAt })
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
    if (offsetMinute > 59 || offsetHour > 14 || (offsetHour === 14 && offsetMinute !== 0)) {
      throw new TypeError("calibratedAt contains an invalid timezone offset");
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
  return at.getTime() <= expiry;
}
export function getAssetCalibrationStatus(records, assetId, at = new Date()) {
  if (!Array.isArray(records)) throw new TypeError("calibration records must be an array");
  if (!(typeof assetId === "string" || Number.isSafeInteger(assetId)) || String(assetId).trim() === "") {
    throw new TypeError("assetId is required");
  }
  if (!(at instanceof Date) || !Number.isFinite(at.getTime())) {
    throw new TypeError("at must be a valid Date");
  }
  const normalizedAssetId = String(assetId).trim();
  const matching = records
    // Match against the same canonical asset reference returned by
    // createCalibrationRecord; legacy/imported whitespace must not hide a
    // valid calibration from the equipment-readiness gate.
    .filter(record => record && String(record.assetId).trim() === normalizedAssetId)
    .map(record => createCalibrationRecord(record))
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

export function createCalibrationRecord(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new TypeError("calibration record must be an object");
  }
  const id = entry.id;
  if (!((typeof id === "string" && id.trim()) || Number.isSafeInteger(id))) {
    throw new TypeError("calibration record id is required");
  }
  if (typeof id === "string" && id.trim().length > 80) {
    throw new RangeError("calibration record id must not exceed 80 characters");
  }
  if (!(typeof entry.assetId === "string" || Number.isSafeInteger(entry.assetId)) ||
      String(entry.assetId).trim() === "") {
    throw new TypeError("calibration asset reference is required");
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
    notes
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
  return Object.freeze({
    ...entry,
    start:normalizedStart,
    end:normalizedEnd,
    unit:requiredText(unit, "unit", 120),
    operator:requiredText(operator, "operator", 120),
    sap:optionalText(entry.sap, "air-tightness result", 120),
    result:optionalText(entry.result, "result", 120),
    cycle:optionalText(entry.cycle, "cycle count", 40),
    error:optionalText(entry.error, "error code", 120),
    errorDesc:optionalText(entry.errorDesc, "error description", 2000)
  });
}
