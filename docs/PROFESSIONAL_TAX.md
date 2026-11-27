# Professional Tax (PT) Module

State- and category-specific, slab-based Professional Tax for the payroll module.
Maharashtra (MH) is the first seeded state; the engine is state-agnostic — other
states are added as data, never as code.

## Legal basis (Maharashtra, effective 01-04-2023, as amended 2023/2026)

- Art. 276 of the Constitution of India (Professional Tax)
- Maharashtra State Tax on Professions, Trades, Callings and Employments Act, 1975
- Schedule I, Entry 1; Maharashtra Profession Tax Rules, 1975
- Amendment Act XIX of 2023; Amendment Rules 2026

Slabs are stored as data in `payroll_statutory_settings` (type `PT`), versioned
`MH-2023`, effective 2023-04-01:

| Category | Up to ₹7,500 | ₹7,501–₹10,000 | Above ₹10,000 | Feb (top slab) |
|---|---:|---:|---:|---:|
| MALE   | 0 | 175 | 200 | 300 |
| FEMALE | 0 (up to ₹25,000) | — | 200 | 300 |

Maximum annual PT in the highest slab: ₹2,500.

## Calculation rules implemented

- **Basis**: monthly **gross wages** (the statutory-engine gross, same basis
  as PF/ESI), **never CTC, never a percentage**.
- **February**: the top slab is ₹300 in February (the per-slab
  `februaryTaxAmount` drives this generically; the difference is reported as
  `februaryAdjustment`).
- **Category is explicit**: `employee_payroll_profiles.ptCategory` (MALE/FEMALE)
  wins; otherwise the employee's `gender` is used; otherwise PT is **0 and
  flagged `NO_CATEGORY`** — never inferred from name/age/any profile attribute.
- **State is explicit**: `employee_payroll_profiles.stateCode` selects the
  state's slabs. No state set → PT is 0 and flagged `NO_STATE` (unless a
  legacy stateless PT rule exists, which is honoured for backwards
  compatibility). Maharashtra is **never assumed**.
- **Exemptions**: apply only when `ptExempt` is set, `ptExemptionStatus` is
  `APPROVED`, and the pay date is inside `ptExemptionValidFrom/Until`. Age,
  disability or any other attribute does NOT auto-exempt. The approval action
  (`POST /payroll/pt/exemptions/review`) is the only path to `APPROVED` and
  writes a `PT_EXEMPTION_APPROVED/REJECTED` audit row.

## Data model

- `payroll_statutory_settings` — PT slab fields: `employeeCategory`,
  `minimumSalary`, `maximumSalary` (NULL = unbounded), `normalTaxAmount`,
  `februaryTaxAmount`, `legalReference`, `ruleVersion`, plus the existing
  effective-date + active columns.
- `employee_payroll_profiles` — PT context: `gender`, `ptApplicable`,
  `workLocation`, `ptCategory`, `ptExempt`, `ptExemptionCategory`,
  `ptExemptionValidFrom/Until`, `ptExemptionDocument`,
  `ptExemptionApprovedBy`, `ptExemptionStatus`.
- `payroll_pt_transactions` — one frozen trace per payroll record (unique on
  `payrollRecordId`): basis, matched slab, rule version, normal/Feb/exempt
  amounts, skip reason. A recalculation can never create a second row, and a
  finalized record's row is never modified.
- `payroll_pt_filings` — employer ledger per state+FY: filing frequency
  (Rule 11: prev-FY PT liability < ₹1,00,000 → ANNUAL, ≥ ₹1,00,000 →
  MONTHLY), deadlines, paid/pending, challan/return references, late fee and
  interest.

## Payroll integration

`PayrollService.createPayroll` → `applyStatutoryComponents` → the slab engine
(`ProfessionalTaxService`) → exactly one `Professional Tax` DEDUCTION
component (dedup by name, so it is charged **once**), plus a frozen PT
snapshot on the record and a PT transaction row. Historical records keep the
snapshots they were computed with — a new `ruleVersion` cannot rewrite
already-run months. Payslips render PT from the frozen components.

PF/ESI behaviour is untouched.

## Deadlines (configurable, flagged for verification)

Monthly PT payment: **21st** of the following month. Annual return: within
30 days of the FY end. Late fee / interest: the amended 2026 rules prescribe
penalty + interest on late payment — the exact current schedule should be
verified against the latest notification before the figures here are relied on
for filings. These are stored per filing row (editable), **not** hardcoded,
so a correction is a data change, not a code change.

**Flagged for verification (kept configurable, not asserted):**
- The exact late-fee formula under the 2026 amendment rules.
- Whether the "previous year liability" that sets monthly vs annual frequency
  is the *assessed* or *paid* liability under the current notification.

## API

- `GET /payroll/pt/dashboard?stateCode&month&year`
- `GET /payroll/pt/reports/monthly-employee|monthly-state|fiscal-year-employee|reconciliation|exemptions|compliance`
- `GET/POST /payroll/pt/exemptions[ /review]`
- `GET/POST /payroll/pt/filings`
- PT slab management: the existing statutory-settings endpoints
  (`/payroll/statutory-settings`, type `PT`).
- Employee PT context: `PUT /payroll/employees/:id/profile`.

All PT routes are `SUPER_ADMIN` / `HR_ADMIN` only.

## UI

- **HR → Professional Tax** (`/hr/pt`): dashboard (deducted/paid/outstanding,
  Feb adjustment, exempt counts, state- & employee-wise, deadlines), six
  reports with CSV export, exemption approve/reject, filing ledger.
- **Employee details → PF & ESI tab → Professional Tax card**: work state,
  work location, gender, PT applicable, statutory category, exemption block.

## Deployment

1. Migration: `prisma/migrations/20261128000000_professional_tax/` (idempotent;
   also self-heals + seeds on first PT use via `ProfessionalTaxService.ensureSchema`).
   On the hand-managed prod DB, run the migration SQL directly:
   `mysql … < prisma/migrations/20261128000000_professional_tax/migration.sql`
2. `npm run build` (client), `pm2 restart` (server).
3. Set the employees' **Work State** (e.g. `MH`) and **category** on the
   employee's PF & ESI tab — until then PT stays 0 (skipped, flagged), by
   design.
