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

The modernization work is being applied directly to `main`. The verified slice includes equipment maintenance scheduling, validated test-diary records, spare-part stock movement checks, append-only equipment calibration, and an experiment-planning lifecycle. Experiment plans must reference an in-register asset and include a real calendar date, owner, purpose, and self-reported recording actor. Allowed states are `planned → in-progress → completed` or cancellation from planned/in-progress; each event is appended to a frozen audit history and checked chronologically on load/import. Plan creation and state changes use persistence rollback; legacy backups without an experiment table migrate to an empty list, never fabricated runs. JSON backup/restore validates equipment references and audit chains, while Excel exports separate plan metadata from flattened audit events. The V3 interface adds a clear laboratory operations dashboard, refined cost/consumption charts and KPI cards, cleaner ledgers and calibration forms, grouped backup controls, and eight-route mobile navigation synchronized with the desktop sidebar. All sample procurement, gas and laboratory readings remain visibly identified as demo data. CI now includes domain-level lifecycle tests and application integration checks.

Remaining delivery work includes the experiment lifecycle UI with audit display, attachment and certificate-file handling, access controls and approval workflows, broader end-to-end browser coverage, and verification against the actual laboratory source records. The browser cache is not yet a durable multi-user LIMS backend.

See [the rebuild plan](docs/REBUILD_PLAN.md) and [domain rules, units and validation boundaries](docs/DOMAIN_CORE.md).
