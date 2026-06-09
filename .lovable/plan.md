## PSR grid export

Generate a one-off PSR-by-segment grid from the baseline data currently stored in the shared CSV (Lovable Cloud `shared_csv` table, key for the session/funnel CSV).

### Cells

All 12 combinations:
- Device: Desktop, Mobile, Tablet
- Visitor: New, Returning
- Book Group: Books, Non-Books

PSR = `project_started / product_viewed`, computed per cell using the same parsing/normalisation as `src/lib/funnel-data.ts` (`parseSessionCsv` + `computeBaseline` with no `All`).

### Steps

1. Read the shared funnel CSV from the `shared_csv` table (same key the dashboard loads).
2. Parse it with the existing `parseSessionCsv` logic (re-used inline in a Node script under `/tmp`).
3. For each of the 12 (device, visitor, bookGroup) tuples, compute:
   - product_viewed (PDP sessions)
   - project_started
   - PSR = project_started / product_viewed (blank if PDP sessions = 0)
4. Write two artifacts to `/mnt/documents/`:
   - `psr-grid.csv` — columns: `device, visitor_type, book_group, product_viewed, project_started, psr`
   - `psr-grid.md` — a readable table grouped by device, with PSR shown as a percentage to 1 decimal.
5. Surface both with `<presentation-artifact>` tags.

### Out of scope

- No UI changes to the dashboard.
- No "All" totals row/column.
- No AOV, orders, or other rates — PSR only.
