# EKPO LabOS — Deep Redesign Roadmap

> Status: discovery and laboratory-workflow baseline. Preserve existing records and validate operational requirements with lab stakeholders.

## Product vision
Transform the current lab dashboard into a traceable laboratory operations system spanning equipment, experiments, samples, consumables, safety, maintenance, and research data.

## Product pillars
1. **Experiment lifecycle** — request, approval, scheduling, execution, review, and archival.
2. **Equipment operations** — asset registry, calibration status, maintenance, utilization, and downtime.
3. **Sample and consumable traceability** — identifiers, location, lot, custody, and stock movements.
4. **Safety and compliance** — SOP acknowledgement, risk controls, incidents, and corrective actions.
5. **Research data integration** — link experiment metadata to fuel-cell analysis datasets without duplicating source-of-truth records.

## Proposed architecture
- Frontend: TypeScript + React/Vite, role-aware lab workspaces.
- Domain: Equipment, Calibration, Experiment, Sample, Consumable, SOP, Incident, MaintenanceTask.
- Backend: authenticated API, relational storage, audit log, file metadata and controlled file storage.
- Integrations: validated CSV/XLSX import pipeline; ECharts visualization; explicit versioned interfaces.
- Quality: workflow integration tests, permission tests, import fixtures, Playwright.

## Redesign workstreams
### P0 — operational audit
- Inventory existing modules, Excel import/export behavior, chart logic, status fields, and sample/demo records.
- Review third-party CDN dependencies and define pinned, integrity-checked or bundled alternatives.
- Map actual SOPs, equipment identifiers, calibration intervals, and approval responsibilities with lab owners.
- Identify personal information and remove unnecessary public contact metadata.

### P1 — traceable data model
- Establish unique IDs, controlled vocabularies, timestamps, operator attribution, and immutable event history.
- Validate imported workbooks with preview, row-level errors, duplicate checks, and safe rollback.
- Track equipment calibration and maintenance status separately from operational availability.
- Preserve raw instrument files and link processed derivatives to source hashes.

### P2 — operational UX
- Redesign around Today / Experiments / Equipment / Samples / Inventory / Safety / Reports.
- Prioritize overdue tasks, blocked experiments, calibration alerts, and stock exceptions.
- Add clear ownership, due dates, filters, and role-based permissions.
- Ensure tablet and desktop usability in lab environments.

### P3 — intelligent assistance
- Summarize experiment logs and surface missing metadata.
- Recommend scheduling based on explicit equipment availability and constraints.
- Generate draft reports with links to source records; require operator review.
- Never allow AI to mark calibration, safety, or experiment approval complete.

## Acceptance criteria
- Experiment and equipment state transitions are auditable.
- Import validation catches malformed, duplicate, and unit-inconsistent rows.
- Calibration status is visible and cannot be silently bypassed.
- Role-based authorization and critical workflow tests pass.
- Every report links to raw source files and transformation history.

## Non-goals / safeguards
- No fabricated experimental records.
- No AI approval of safety-critical procedures or calibration.
- No deletion of source data during migration.
