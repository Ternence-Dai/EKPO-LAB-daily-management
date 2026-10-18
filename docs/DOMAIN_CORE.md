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

## Calibration records and validity

`createCalibrationRecord(entry)` creates an immutable, normalized calibration record. It requires a unique record ID, a reference to an existing maintenance asset, a timezone-qualified calibration timestamp, a positive safe-integer validity period, certificate/report number, calibration organization, operator, and a `pass` or `fail` result. Optional notes must be text. The domain function validates the record shape; the application verifies that the referenced asset exists and that certificate references are not duplicated.

`isCalibrationCurrent({ calibratedAt, validForDays }, at)` requires an ISO timestamp with an explicit timezone, a non-negative safe-integer validity period, and a valid `Date` comparison instant. It returns true through the expiry instant itself; after that instant it returns false. Invalid calendar dates, invalid timezone offsets and unsupported fractional-second precision are rejected.

The browser UI treats the date-picker value as a calendar date and stores it at UTC midnight, preventing the selected day from shifting across timezones. It appends calibration history and does not offer in-place edits or deletion. It displays failed results distinctly from expired results and shows the latest calibration status (unrecorded, valid, expired, or failed) directly in the equipment register. Legacy caches and backups without a `calibrationLogs` table are migrated to an empty array without fabricating certificates or outcomes. Calibration rows in JSON imports are validated before the active database is replaced; the Excel export includes a separate calibration-history sheet.

## Test diary entries

`validateTestDiaryEntry(entry)` requires valid start/end values, a positive finite duration within the safe numeric range, a non-empty unit, and a non-empty operator.

- Date-only values use `YYYY-MM-DD` calendar semantics and remain date-only.
- Timed values require an explicit timezone and are normalized to UTC; the normalized UTC year must remain in the supported four-digit range so the saved value can be parsed again.
- The end time cannot precede the start time.

The module validates the declared duration value but does not infer its unit or recompute it from timestamps; the caller must keep duration and unit semantics consistent.

## Current application wiring

The current browser application calls `validateMaintenanceAsset` from the maintenance save flow, `validateTestDiaryEntry` from the test-diary save flow, and `createCalibrationRecord`/`isCalibrationCurrent` from the equipment calibration workflow. Calibration entry, append-only history, status display, legacy-cache migration, backup validation and Excel export are wired. The experiment lifecycle function remains a domain-core capability; a complete experiment-status workflow with persistence and audit display is not yet delivered.

## Verification boundary

`test/domain.test.js` covers lifecycle transitions, immutable audit history, calibration dates and expiry, diary ordering/duration, and maintenance data. The application validators cover persistence rollback, local-cache recovery, maintenance scheduling, inventory rollback, calibration UI and backup compatibility. These checks do not replace access control or a durable transactional database.
