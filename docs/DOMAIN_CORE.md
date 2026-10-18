# EKPO laboratory operations domain core

The domain module centralizes validation for maintenance assets, experiment lifecycle transitions, calibration validity, and test-diary records.

## Maintenance assets

`validateMaintenanceAsset(entry)` returns an immutable normalized record.

- Name and maintenance frequency are required.
- Quantity is a positive safe integer.
- Cycle must be one of `一级保养`, `二级保养`, or `三级保养`.
- Optional last/next dates must be real `YYYY-MM-DD` calendar dates.
- When both dates are present, the next maintenance date cannot precede the last maintenance date.
- Optional category, location, responsible person and record fields must be text and are trimmed.

Date-only values remain calendar dates; they are not converted to UTC instants.

## Experiment lifecycle

`transitionExperiment(experiment, nextStatus, actor)` permits only these transitions:

- `planned → in-progress` or `planned → cancelled`
- `in-progress → completed` or `in-progress → cancelled`
- `completed` and `cancelled` are terminal states

Every transition requires a non-empty actor and appends an ISO timestamped audit entry. Existing audit rows are copied and frozen. Non-string values in audit rows are rejected so nested mutable payloads cannot be smuggled into the returned history. The returned experiment record is frozen at the top level, and its audit array/rows are copied and frozen. Other nested experiment properties are retained by reference; callers must not mutate them through the returned value and should clone nested state at the application boundary when required.

## Calibration validity

`isCalibrationCurrent({ calibratedAt, validForDays }, at)` requires an ISO timestamp with an explicit timezone, a non-negative safe-integer validity period, and a valid `Date` comparison instant. It returns true through the expiry instant itself; after that instant it returns false. Invalid calendar dates, invalid timezone offsets and unsupported fractional-second precision are rejected.

## Test diary entries

`validateTestDiaryEntry(entry)` requires valid start/end values, a positive finite duration within the safe numeric range, a non-empty unit, and a non-empty operator.

- Date-only values use `YYYY-MM-DD` calendar semantics and remain date-only.
- Timed values require an explicit timezone and are normalized to UTC.
- The end time cannot precede the start time.

The module validates the declared duration value but does not infer its unit or recompute it from timestamps; the caller must keep duration and unit semantics consistent.

## Current application wiring

The current browser application calls `validateMaintenanceAsset` from the maintenance save flow and `validateTestDiaryEntry` from the test-diary save flow. The experiment lifecycle and calibration functions are currently domain-core capabilities; the legacy UI does not yet expose complete experiment-status or calibration workflows. They must not be counted as delivered user-facing modules until those workflows, persistence, audit display and regression tests are integrated.

## Verification boundary

`test/domain.test.js` covers lifecycle transitions, immutable audit history, calibration dates and expiry, diary ordering/duration, and maintenance data. The application validators cover persistence rollback, local-cache recovery, maintenance scheduling, inventory rollback and user-interface integration. These checks do not replace access control or a durable transactional database.
