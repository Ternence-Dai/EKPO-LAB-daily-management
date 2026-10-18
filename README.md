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

The modernization work is being applied directly to `main`. The current baseline includes a domain-core module, automated domain tests, standalone-app validation, and a GitHub Pages deployment workflow. These checks passing confirms the current baseline is buildable; it does **not** mean the full product rebuild is complete.

The current delivered slice includes equipment calibration entry and history, certificate/reference validation, expiry status, legacy-cache migration, backup import/export checks, and domain regression tests. Remaining delivery work includes a complete experiment lifecycle UI with audit display, broader end-to-end browser coverage, data verification against real laboratory source records, and further extraction of maintainable modules from the legacy entry point. Existing user data and the legacy application must be preserved while these changes are introduced.

See [the rebuild plan](docs/REBUILD_PLAN.md) and [domain rules, units and validation boundaries](docs/DOMAIN_CORE.md).
