
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

export function validateMaintenanceAsset(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new TypeError("maintenance asset must be an object");
  }
  const name = typeof entry.name === "string" ? entry.name.trim() : "";
  if (!name) throw new TypeError("maintenance asset name is required");
  if (!Number.isSafeInteger(entry.qty) || entry.qty < 1) {
    throw new RangeError("maintenance asset quantity must be a positive safe integer");
  }
  const allowedCycles = new Set(["一级保养", "二级保养", "三级保养"]);
  if (!allowedCycles.has(entry.cycle)) throw new RangeError("maintenance cycle is invalid");
  const freq = typeof entry.freq === "string" ? entry.freq.trim() : "";
  if (!freq) throw new TypeError("maintenance frequency is required");
  const last = parseMaintenanceDate(entry.last, "last date");
  const next = parseMaintenanceDate(entry.next, "next date");
  if (last && next && next < last) {
    throw new RangeError("next maintenance date cannot precede last maintenance date");
  }
  const textField = (field) => {
    if (entry[field] === undefined || entry[field] === null) return "";
    if (typeof entry[field] !== "string") throw new TypeError(`maintenance ${field} must be text`);
    return entry[field].trim();
  };
  return Object.freeze({
    name,
    category: textField("category"),
    location: textField("location"),
    qty: entry.qty,
    cycle: entry.cycle,
    freq,
    last,
    next,
    responsible: textField("responsible"),
    record: textField("record")
  });
}

const transitions = { planned:["in-progress","cancelled"], "in-progress":["completed","cancelled"], completed:[], cancelled:[] };
const experimentStatuses = new Set(["planned", "in-progress", "completed", "cancelled"]);
function parseExperimentDate(value) {
  if (typeof value !== "string" || !/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) {
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
  return value;
}
export function createExperimentRecord(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new TypeError("experiment record must be an object");
  }
  if (typeof entry.id !== "string" || !entry.id.trim() || entry.id.trim().length > 80) {
    throw new TypeError("experiment id is required");
  }
  if (!(typeof entry.assetId === "string" || Number.isSafeInteger(entry.assetId)) ||
      String(entry.assetId).trim() === "") {
    throw new TypeError("experiment asset reference is required");
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
  if (typeof entry.id !== "string" || !entry.id.trim() || entry.id.trim().length > 80) {
    throw new TypeError("experiment id is required");
  }
  if (!(typeof entry.assetId === "string" || Number.isSafeInteger(entry.assetId)) ||
      String(entry.assetId).trim() === "") {
    throw new TypeError("experiment asset reference is required");
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
    if (typeof record.actor !== "string" || !record.actor.trim()) {
      throw new TypeError("experiment audit actor is required");
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
  if (!experiment || typeof experiment !== "object" || Array.isArray(experiment)) throw new TypeError("experiment is required");
  if (typeof actor !== "string" || !actor.trim()) throw new TypeError("actor is required for audit");
  if (!Object.hasOwn(transitions, experiment.status)) throw new RangeError("unknown current status");
  if (!transitions[experiment.status].includes(nextStatus)) throw new RangeError(`transition ${experiment.status} -> ${nextStatus} is not allowed`);
  if (experiment.audit !== undefined && !Array.isArray(experiment.audit)) throw new TypeError("experiment audit must be an array");
  const audit = (experiment.audit || []).map((record) => {
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      throw new TypeError("experiment audit entries must be objects");
    }
    // Audit rows are an immutable primitive-value schema. Reject nested
    // payloads rather than freezing only the outer row and leaving mutable
    // objects reachable through the returned history.
    if (Object.values(record).some(value => typeof value !== "string")) {
      throw new TypeError("experiment audit fields must be strings");
    }
    return Object.freeze({ ...record });
  });
  const normalizedAt = normalizeExperimentInstant(at, "audit timestamp");
  if (audit.length) {
    const previousAt = Date.parse(normalizeExperimentInstant(audit[audit.length - 1].at, "previous audit timestamp"));
    if (Date.parse(normalizedAt) < previousAt) {
      throw new RangeError("experiment audit timestamps must be chronological");
    }
  }
  audit.push(Object.freeze({ from:experiment.status, to:nextStatus, actor:actor.trim(), at:normalizedAt }));
  return Object.freeze({ ...experiment, status:nextStatus, audit:Object.freeze(audit) });
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
export function createCalibrationRecord(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new TypeError("calibration record must be an object");
  }
  const id = entry.id;
  if (!((typeof id === "string" && id.trim()) || Number.isSafeInteger(id))) {
    throw new TypeError("calibration record id is required");
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
  const requiredText = (field) => {
    if (typeof entry[field] !== "string" || !entry[field].trim()) {
      throw new TypeError(`calibration ${field} is required`);
    }
    return entry[field].trim();
  };
  if (!["pass", "fail"].includes(entry.result)) {
    throw new RangeError("calibration result must be pass or fail");
  }
  if (entry.notes !== undefined && entry.notes !== null && typeof entry.notes !== "string") {
    throw new TypeError("calibration notes must be text");
  }
  const expiry = calibratedTimestamp + entry.validForDays * 86400000;
  if (!Number.isFinite(expiry) || Math.abs(expiry) > 8.64e15) {
    throw new RangeError("calibration expiry is outside the supported date range");
  }
  return Object.freeze({
    id,
    assetId: String(entry.assetId).trim(),
    calibratedAt: normalizedDate.toISOString(),
    validForDays: entry.validForDays,
    certificateNo: requiredText("certificateNo"),
    organization: requiredText("organization"),
    operator: requiredText("operator"),
    result: entry.result,
    notes: typeof entry.notes === "string" ? entry.notes.trim() : ""
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
  if (typeof unit !== "string" || !unit.trim()) throw new TypeError("test unit is required");
  if (typeof operator !== "string" || !operator.trim()) throw new TypeError("test operator is required");
  return Object.freeze({ ...entry, start:normalizedStart, end:normalizedEnd, unit:unit.trim(), operator:operator.trim() });
}
