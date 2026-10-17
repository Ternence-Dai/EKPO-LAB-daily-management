const transitions = { planned:["in-progress","cancelled"], "in-progress":["completed","cancelled"], completed:[], cancelled:[] };
export function transitionExperiment(experiment, nextStatus, actor) {
  if (!experiment || typeof experiment !== "object" || Array.isArray(experiment)) throw new TypeError("experiment is required");
  if (typeof actor !== "string" || !actor.trim()) throw new TypeError("actor is required for audit");
  if (!transitions[experiment.status]) throw new RangeError("unknown current status");
  if (!transitions[experiment.status].includes(nextStatus)) throw new RangeError(`transition ${experiment.status} -> ${nextStatus} is not allowed`);
  if (experiment.audit !== undefined && !Array.isArray(experiment.audit)) throw new TypeError("experiment audit must be an array");
  return Object.freeze({ ...experiment, status:nextStatus, audit:[...(experiment.audit || []), Object.freeze({ from:experiment.status, to:nextStatus, actor:actor.trim(), at:new Date().toISOString() })] });
}
export function isCalibrationCurrent({ calibratedAt, validForDays }, at = new Date()) {
  if (typeof calibratedAt !== "string" || !calibratedAt.trim() || !Number.isFinite(Date.parse(calibratedAt))) throw new TypeError("calibratedAt must be a valid date string");
  if (!Number.isInteger(validForDays) || validForDays < 0) throw new RangeError("validForDays must be non-negative");
  if (!(at instanceof Date) || !Number.isNaN(at.getTime()) === false) throw new TypeError("at must be a valid Date");
  const expiry = Date.parse(calibratedAt) + validForDays * 86400000;
  return at.getTime() <= expiry;
}
