# Data Re-Engineering Brief for Claude

Deliverable: one Markdown file, `/mnt/documents/data-reengineering-brief.md`, that a user can paste into Claude Code. The brief tells Claude what the Planning Funnel Calculator is, what every input number means in business terms, and what shape the two CSVs must land in — so Claude can go find the correct indicator in whatever financial/analytics package the user names.

Package-agnostic by request: the brief describes each metric in business terms (grain, filters, unit, time window) and leaves Claude to map those to the specific indicator names in the target system.

## File layout

Single `.md`, roughly this structure:

1. **Purpose & how to use this brief** — one paragraph telling Claude: "You will be given access to a financial/analytics package. Reproduce the two CSVs described below. Use the metric spec table to find the right indicator; use the definitions and filters to disambiguate."
2. **What the app is** — 3–4 sentences summarising the Planning Funnel Calculator: takes a proposed lift on one funnel step, projects incremental monthly + annualised revenue through held-constant downstream rates, with a safety-margin multiplier. Cite `/readme` for canonical business logic and `/aov-readme` for AOV logic.
3. **How the calculation flows (full spec)** — user asked for everything:
   - Funnel chain: Sessions → Product Viewed → Project Started → Image Added → Product Added → Order Completed → Revenue.
   - Login Started / Login Completed are contextual, sit outside the chain.
   - Derived rates: PDP Rate, PSR, Image Add Rate, Add to Cart Rate, Checkout Rate (each = next step ÷ prior step, from the same segment row).
   - Lift propagation: a lift at step *k* multiplies that step's inbound rate; all downstream rates held constant unless overridden.
   - Safety margin: user-entered % (default 75) multiplies incremental revenue before annualising ×12.
   - AOV: weighted average (Σ aov × orders) ÷ Σ orders, filtered by device only.
   - Single-session rule: every funnel count is deduped to one per session.
4. **Segment dimensions** — Device (Desktop, Mobile; Tablet explicitly out of scope), Visitor Type (New, Returning; based on first-ever visit, not first purchase), Book Group (Books wins on mixed baskets; Non-Books = everything else). Note the Sessions/Login-do-not-split-by-book-group caveat from the README.
5. **Time window** — trailing 12 months, divided by 12 for a stable monthly baseline.
6. **Exclusions** — canceled, B2B, employee/sample/test discount codes, unpaid/$0 orders, bot sessions, unclassified product lines (verbatim from the two READMEs).
7. **Target CSV #1 — `session_level.csv`** — columns, grain, one row per (device × visitor type × book group) cell.
8. **Target CSV #2 — `aov_data.csv`** — columns, grain, one row per (device × product line) cell.
9. **Metric spec table** — the core artifact (see below).
10. **Known gaps and caveats** — Image Added is estimated (keyless raw event, directional only); Sessions/Login are device×visitor totals duplicated across book rows (do not sum); order visit attribution is project-start visit, not order visit (explains Orders > Add-to-Cart in New).
11. **Validation checks Claude should run after sourcing** — row counts per segment, monotonic-ish funnel shape, PSR grid sanity (reference `/mnt/documents/psr-grid.md` if available), AOV weighted average matches package's built-in AOV within tolerance.

## The metric spec table

One row per data point Claude has to source. Columns:

| Field | Description |
|---|---|
| `csv` | `session_level` or `aov_data` |
| `column` | Exact CSV column name to produce |
| `business name` | Human-readable name (e.g. "Project Started sessions") |
| `definition` | What the number counts, in business terms |
| `grain` | Unit + dedup rule (e.g. "session, deduped once per visit") |
| `dimensions` | Which of device / visitor / book group split it |
| `filters` | Bots excluded, B2B excluded, canceled excluded, discount-code exclusions, etc. |
| `time window` | Trailing 12 months, monthly avg (÷12) |
| `source hint` | Neutral pointer for Claude: "the event/step called 'project started' or equivalent in your package; look for a session-level flag or a per-session count" |
| `notes` | Estimation caveats, propagation rules, cross-segment behavior |

Rows in the table (one per metric):

- `session_level.avg_monthly_total_sessions` — Sessions
- `session_level.avg_monthly_product_viewed` — Product Viewed
- `session_level.avg_monthly_login_started` — Login Started
- `session_level.avg_monthly_login_completed` — Login Completed
- `session_level.avg_monthly_project_started` — Project Started
- `session_level.avg_monthly_image_added` — Image Added (flag as estimate)
- `session_level.avg_monthly_product_added` — Product Added (add-to-cart)
- `session_level.avg_monthly_order_completed` — Order Completed
- `aov_data.aov` — Weighted AOV per (device × product line)
- `aov_data.orders` — Order count per (device × product line), used as the weight

Plus dimension rows explaining accepted values:

- `session_level.device_segment` — Desktop | Mobile
- `session_level.visitor_type` — New | Returning
- `session_level.book_group` — Books | Non-Books
- `aov_data.device_category` — Desktop | Mobile
- `aov_data.product_line` — canonical product-line label (list current values as reference)

## Sources the brief will cite

- `src/routes/readme.tsx` — funnel steps, single-session rule, segments, exclusions, limitations
- `src/routes/aov-readme.tsx` — AOV calculation, device attribution, order inclusion rules
- `src/lib/funnel-data.ts` — column aliases and normalisation the app already accepts (so Claude knows which header names are safe)
- `src/routes/dashboard.tsx` — rate formulas, chain propagation, safety-margin math
- `src/data/session_level.csv` and `src/data/aov_data.csv` — current shape to match
- `/mnt/documents/psr-grid.md` — reference PSR values for validation

## Out of scope

- No code changes to the app.
- No new UI, no new route.
- Tablet coverage (per your answer, keep Desktop + Mobile only; note Tablet as out of scope in the brief).
- No opinionated mapping to a specific analytics vendor's field names.
