# Fuel Cell Laboratory Operations & LIMS

> 燃料电池实验室运营与 LIMS

A traceable laboratory operations system for equipment, experiments, samples, reagents, calibration, maintenance, inventory, safety, and quality records.

## Current verified capabilities and planned modules

- **Verified:** equipment registry, append-only calibration metadata/results, calibration expiry status, maintenance schedules, experiment plans and lifecycle audit history
- **Verified:** gas-use and spare-part inventory ledgers, validated stock movements, test-diary records, JSON backup/restore, and Excel exports
- **Verified:** experiment start is gated by a manually entered SOP/consumables attestation. The SOP identifier, batch, remaining-quantity check, and expiry check must be recorded in the immutable start-event audit history, including when experiment records are imported or validated.
- **Demonstration/reference data:** sample procurement, gas and laboratory readings are not verified operational records
- **Planned, not yet implemented:** structured sample/reagent lot inventory and automatic stock/expiry verification, SOP catalogue and controlled SOP revision workflows, safety workflows, binary certificate/record attachments, durable attachment storage and integrity checks, authenticated review/approval, and complete multi-user audit controls

## Engineering principles

Track who/when/source for every critical record. Separate planned, measured, imported, and demo data. Enforce units, calibration status, expiry checks, and review gates.

- Modular, typed, documented code; no monolithic application entry point.
- Reproducible setup, deterministic tests, and automated quality checks.
- Secure configuration: secrets belong in environment variables or managed secret stores, never in source control.
- Accessible, responsive interface with clear loading, empty, error, and offline states.
- Open-source components are evaluated for maintenance, license compatibility, security, and fit before adoption.

## Delivery status

The modernization work is being applied directly to `main`. The verified slice includes equipment maintenance scheduling, validated test-diary records, spare-part stock movement checks, append-only equipment calibration, and an experiment-planning lifecycle. Experiment plans must reference an in-register asset and include a real calendar date, owner, purpose, and self-reported recording actor. Allowed states are `planned → in-progress → completed` or cancellation from planned/in-progress; each event is appended to a frozen audit history and checked chronologically on load/import. Starting an experiment requires a bounded, non-empty manual attestation naming the applicable SOP and recording batch, remaining-quantity, and expiry checks. The same evidence is required when validating imported start events; historical records are not backfilled with invented evidence. This is an attestation record, not an automated inventory check: the application does not yet resolve a structured consumables lot, calculate available quantity, or verify expiry against a controlled lot register. Plan creation and state changes use persistence rollback; legacy backups without an experiment table migrate to an empty list, never fabricated runs. JSON backup/restore validates equipment references and audit chains, while Excel exports separate plan metadata from flattened audit events. The V3 interface adds a clear laboratory operations dashboard, refined cost/consumption charts and KPI cards, cleaner ledgers and calibration forms, grouped backup controls, and eight-route mobile navigation synchronized with the desktop sidebar. All sample procurement, gas and laboratory readings remain visibly identified as demo data. CI includes domain-level lifecycle tests and application integration checks.

Backup provenance is deliberately conservative: only records still carrying the built-in `demo-seed` marker are labeled as demonstration exports. Every other export, including imported backups that claim `verified-operational`, is labeled as an unverified migration copy because an editable JSON field cannot independently prove business provenance. Structural validation checks shape and references, not the truth of laboratory source records.

The calibration form currently stores certificate identifiers and metadata only; it does not upload or retain the original certificate file. JSON backup/restore therefore preserves calibration metadata, not certificate binaries. Attachment storage must not be treated as delivered until file bytes, metadata, integrity checks, deletion/retention policy, and backup/restore consistency are implemented and tested.

The experiment lifecycle UI is present: users can create plans, associate registered equipment, advance or cancel allowed states, and inspect the append-only actor/time audit history including the start-event consumables attestation. Remaining delivery work includes structured sample/reagent lot management and automated quantity/expiry verification, controlled SOP and safety workflows, attachment and certificate-file handling, authenticated role/access controls and approval workflows, broader end-to-end browser coverage, and verification against actual laboratory source records. The browser cache is not yet a durable multi-user LIMS backend; the current self-reported actor field is traceability metadata, not proof of authenticated identity.

See [the rebuild plan](docs/REBUILD_PLAN.md) and [domain rules, units and validation boundaries](docs/DOMAIN_CORE.md).


## 开源项目深度对标

本项目采用的上游参考、架构借鉴、实现边界与后续验收要求见 [docs/OPEN_SOURCE_BENCHMARKS.md](docs/OPEN_SOURCE_BENCHMARKS.md)。
