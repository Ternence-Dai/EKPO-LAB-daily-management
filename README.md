# Fuel Cell Laboratory Operations & LIMS

> 燃料电池实验室运营与 LIMS

A traceable laboratory operations system for equipment, experiments, samples, reagents, calibration, maintenance, inventory, safety, and quality records.

## Product modules

- Equipment registry, append-only calibration certificates/results, calibration expiry status, and maintenance schedules
- Experiment plans, runs, samples, and electronic lab records
- Reagent and consumable inventory with lot/expiry tracking
- SOPs, safety checks, incidents, and training records
- Result capture, attachments, and review/approval workflow
- Dashboards, exports, and complete audit history

## Engineering principles

Track who/when/source for every critical record. Separate planned, measured, imported, and demo data. Enforce units, calibration status, expiry checks, and review gates.

- Modular, typed, documented code; no monolithic application entry point.
- Reproducible setup, deterministic tests, and automated quality checks.
- Secure configuration: secrets belong in environment variables or managed secret stores, never in source control.
- Accessible, responsive interface with clear loading, empty, error, and offline states.
- Open-source components are evaluated for maintenance, license compatibility, security, and fit before adoption.

## Delivery status

The modernization work is being applied directly to `main`. The verified slice includes equipment maintenance scheduling, validated test-diary records, spare-part stock movement checks, and an append-only equipment calibration workflow. Calibration entries require an asset, date, certificate/reference, organization, operator, validity period, and pass/fail outcome; the equipment register shows the latest status. Legacy caches/backups without a calibration table migrate to an empty list rather than fabricated records. Restore writes preserve the recovery lock on persistence failure. CI, tests, build, and Pages deployment pass.

Remaining delivery work includes the experiment lifecycle UI with audit display, attachment and certificate-file handling, access controls and approval workflows, broader end-to-end browser coverage, and verification against the actual laboratory source records. The browser cache is not yet a durable multi-user LIMS backend.

See [the rebuild plan](docs/REBUILD_PLAN.md) and [domain rules, units and validation boundaries](docs/DOMAIN_CORE.md).
