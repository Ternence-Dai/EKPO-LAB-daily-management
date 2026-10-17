# Rebuild plan — 燃料电池实验室运营与 LIMS

## Product intent

A traceable laboratory operations system for equipment, experiments, samples, reagents, calibration, maintenance, inventory, safety, and quality records.

## Target capabilities

1. Equipment registry, calibration, and maintenance schedules
2. Experiment plans, runs, samples, and electronic lab records
3. Reagent and consumable inventory with lot/expiry tracking
4. SOPs, safety checks, incidents, and training records
5. Result capture, attachments, and review/approval workflow
6. Dashboards, exports, and complete audit history

## Non-negotiable correctness and safety gates

Track who/when/source for every critical record. Separate planned, measured, imported, and demo data. Enforce units, calibration status, expiry checks, and review gates.

## Delivery sequence

1. Inventory current behavior, assets, data formats, and dependencies.
2. Define domain model, API contracts, permissions, and migration/import strategy.
3. Implement the smallest end-to-end vertical slice with typed interfaces.
4. Add unit, integration, and browser-level tests for critical workflows.
5. Add CI, security/dependency scanning, and reproducible build instructions.
6. Validate with reference datasets and document known limitations.
7. Review deployment, backup, recovery, and release process before production use.

## Open-source adoption policy

For each dependency or reference project, record its repository URL, license, maintenance activity, security posture, exact component being reused or adapted, and attribution obligations. Prefer stable standards and small interoperable components over copying whole applications.

## Status

- [ ] Existing repository and data audit complete
- [ ] Domain model and architecture approved
- [ ] Core vertical slice implemented
- [ ] Critical workflows tested
- [ ] CI and security checks passing
- [ ] Deployment and backup procedure verified
- [ ] Release candidate reviewed
