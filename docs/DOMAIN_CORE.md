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

`createExperimentRecord(entry)` creates an immutable planned experiment record. It requires a unique ID (uniqueness is enforced by the application), title, equipment reference, real `YYYY-MM-DD` planned date, owner, purpose, and a non-empty creator/recording actor. The first audit row records `new → planned` with the creation actor and timestamp. It does not create a measurement result, sample, certificate, or approval.

`validateExperimentRecord(entry)` verifies the record identity, planned date, required descriptive fields, legal status, and complete audit chain. It replays the transitions from the creation event, rejects skipped or illegal transitions, requires a non-empty actor for each event, checks chronological timestamps, and requires the final audit status to match the record status. It returns an immutable record with a copied/frozen audit list.

`transitionExperiment(experiment, nextStatus, actor, at?)` permits only these transitions:

- `planned → in-progress` or `planned → cancelled`
- `in-progress → completed` or `in-progress → cancelled`
- `completed` and `cancelled` are terminal states

Every transition requires a non-empty actor and appends an ISO timestamped audit entry. The optional `at` argument supports deterministic tests and callers with an authoritative timestamp; timestamps earlier than the previous audit event are rejected. Existing audit rows are copied and frozen. Non-string values in audit rows are rejected so nested mutable payloads cannot be smuggled into the returned history. The returned experiment record is frozen at the top level, and its audit array/rows are copied and frozen. Other nested experiment properties are retained by reference; callers must not mutate them through the returned value and should clone nested state at the application boundary when required.

The browser UI exposes experiment planning, equipment association, responsible owner, creator attribution, status transitions, and expandable audit history. Status changes and plan creation use the same persistence rollback path as other lab mutations. Legacy caches and JSON backups without an `experiments` table migrate to an empty list; no plans or runs are fabricated. Existing experiment rows are validated at startup and during backup import, including equipment references and audit chronology. The operator name is user-entered attribution, not authenticated identity; a completed lifecycle state is not equivalent to reviewed/approved scientific results.

## Experiment-start SOP and consumables attestation

A transition from `planned` to `in-progress` requires a non-empty `consumablesCheckNote` of at most 500 characters. The note is trimmed and rejects control characters. It is accepted only on the start event; it is not a free-form field for unrelated lifecycle transitions.

The browser start flow asks the operator to record the applicable SOP identifier, consumables batch, remaining-quantity check, and whether the expiry covers the planned date. The note is displayed in the experiment audit history and is persisted with the start event. `validateExperimentRecord(entry)` also rejects an imported `in-progress` start event that omits the attestation, so import/restore cannot bypass the same rule. Historical records are not backfilled with invented evidence.

**Important verification boundary:** this is a manually entered attestation, not a structured consumables inventory system. The application does not automatically resolve a reagent/consumables lot, calculate available stock, validate a batch against a lot master, or independently compare expiry dates with the planned experiment date. Those capabilities require structured lot master data and controlled inventory workflows. The operator field remains self-reported attribution, not authenticated identity or approval.

## Calibration records and validity

`createCalibrationRecord(entry)` creates an immutable, normalized calibration record. It requires a unique record ID, a reference to an existing maintenance asset, a timezone-qualified calibration timestamp, a positive safe-integer validity period, certificate/report number, calibration organization, operator, and a `pass` or `fail` result. Optional notes must be text. The domain function validates the record shape; the application verifies that the referenced asset exists and that certificate references are not duplicated.

`isCalibrationCurrent({ calibratedAt, validForDays }, at)` requires an ISO timestamp with an explicit timezone, a non-negative safe-integer validity period, and a valid `Date` comparison instant. It returns true through the expiry instant itself; after that instant it returns false. Invalid calendar dates, invalid timezone offsets and unsupported fractional-second precision are rejected.

The browser UI treats the date-picker value as a calendar date and stores it at UTC midnight, preventing the selected day from shifting across timezones. It appends calibration history and does not offer in-place edits or deletion. It displays failed results distinctly from expired results and shows the latest calibration status (unrecorded, valid, expired, or failed) directly in the equipment register. Legacy caches and backups without a `calibrationLogs` table are migrated to an empty array without fabricating certificates or outcomes. Calibration rows in JSON imports are validated before the active database is replaced; the Excel export includes a separate calibration-history sheet.

## Test diary entries

`validateTestDiaryEntry(entry)` requires valid start/end values, a positive finite duration within the safe numeric range, a non-empty unit, and a non-empty operator.

- Date-only values use `YYYY-MM-DD` calendar semantics and remain date-only.
- Timed values require an explicit timezone and are normalized to UTC; the normalized UTC year must remain in the supported four-digit year range so the saved value can be parsed again.
- The end time cannot precede the start time.

The module validates the declared duration value but does not infer its unit or recompute it from timestamps; the caller must keep duration and unit semantics consistent.

## Current application wiring

The current browser application calls `validateMaintenanceAsset` from the maintenance save flow, `validateTestDiaryEntry` from the test-diary save flow, `createCalibrationRecord`/`isCalibrationCurrent` from the equipment calibration workflow, and `createExperimentRecord`/`validateExperimentRecord`/`transitionExperiment` from the experiment page. Experiment plans can be created against an in-register asset, moved through permitted states, and inspected with immutable, chronological audit history. Creation and transition writes use snapshot/commit rollback; startup and import validate the audit chain and asset reference. The start-event SOP/consumables attestation is persisted and revalidated on import. The operator field is self-reported and does not enforce identity or permissions. The Excel workbook exports experiment-plan metadata and a separate flattened status-audit sheet.

## Verification boundary

`test/domain.test.js` covers lifecycle transitions, immutable audit history, calibration dates and expiry, diary ordering/duration, maintenance data, and the required start-event attestation including imported records. The application validators cover persistence rollback, local-cache recovery, maintenance scheduling, inventory rollback, calibration UI and backup compatibility. These checks do not replace access control, structured consumables inventory, or a durable transactional database.

## Open-source laboratory-system references

- [eLabFTW](https://github.com/elabftw/elabftw) is a reference for electronic laboratory notebooks, experiment records, templates, and traceable research workflows.
- [SENAITE](https://github.com/senaite/senaite.core) is a reference for analytical-laboratory sample workflows, review states, quality control, and auditable LIMS operations.
- The local experiment lifecycle now requires a complete creation record and validates every transition against the existing immutable audit chain. These references inform future sample/result review and attachment workflows; the current browser cache is not a multi-user regulated LIMS or a substitute for controlled records.


## Calibration metadata integrity

Calibration record identifiers are trimmed and limited to 80 characters. Certificate numbers are limited to 120 characters, organization names to 180, operator names to 120, and notes to 2,000. These text fields reject ASCII control characters so imported or manually entered records cannot carry hidden line breaks or terminal control bytes into audit and certificate views.
