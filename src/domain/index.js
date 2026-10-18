const transitions = { planned:["in-progress","cancelled"], "in-progress":["completed","cancelled"], completed:[], cancelled:[] };
export function transitionExperiment(experiment, nextStatus, actor) {
  if (!experiment || typeof experiment !== "object" || Array.isArray(experiment)) throw new TypeError("experiment is required");
  if (typeof actor !== "string" || !actor.trim()) throw new TypeError("actor is required for audit");
  if (!transitions[experiment.status]) throw new RangeError("unknown current status");
  if (!transitions[experiment.status].includes(nextStatus)) throw new RangeError(`transition ${experiment.status} -> ${nextStatus} is not allowed`);
  if (experiment.audit !== undefined && !Array.isArray(experiment.audit)) throw new TypeError("experiment audit must be an array");
  return Object.freeze({ ...experiment, status:nextStatus, audit:[...(experiment.audit || []), Object.freeze({ from:experiment.status, to:nextStatus, actor:actor.trim(), at:new Date().toISOString() })] });
}
function parseCalibrationInstant(value) {
  if (typeof value !== "string") throw new TypeError("calibratedAt must be an ISO timestamp with an explicit timezone");
  const match = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.\d{1,9})?)?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
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
  if (!Number.isFinite(expiry)) throw new RangeError("calibration expiry is outside the supported date range");
  return at.getTime() <= expiry;
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
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new TypeError(`test ${label} must be valid`);
  return new Date(timestamp).toISOString();
}
export function validateTestDiaryEntry(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new TypeError("test diary entry is required");
  const { start, end, duration, unit, operator } = entry;
  const normalizedStart = normalizeDiaryDate(start, "start time");
  const normalizedEnd = normalizeDiaryDate(end, "end time");
  if (Date.parse(normalizedEnd) < Date.parse(normalizedStart)) throw new RangeError("test end time cannot precede start time");
  if (!Number.isFinite(duration) || duration <= 0) throw new RangeError("test duration must be a positive finite number");
  if (typeof unit !== "string" || !unit.trim()) throw new TypeError("test unit is required");
  if (typeof operator !== "string" || !operator.trim()) throw new TypeError("test operator is required");
  return Object.freeze({ ...entry, start:normalizedStart, end:normalizedEnd, unit:unit.trim(), operator:operator.trim() });
}
