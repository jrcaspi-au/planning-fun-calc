## Deliverable

A single Markdown file, `Planning-Funnel-Calculator-Confluence.md`, written to `/mnt/documents/` and surfaced as a downloadable artifact. The file is formatted for Confluence's "Insert → Markdown" macro: standard headings, bullet lists, tables, fenced code blocks for formulas, and block quotes for callouts — no app-specific HTML.

## Article structure

1. **Overview** — one-paragraph summary of what the calculator is, who it's for, and how to read the rest of the doc.
2. **Calculator Dynamics** (new content, derived from `src/routes/dashboard.tsx`)
   - **Mental model**: baseline funnel → choose a lift step → apply % lift → propagate downstream → multiply by AOV → apply safety margin → annualize.
   - **The core formula**, as a fenced block:
     ```
     incremental_monthly_revenue =
       (lifted_orders − baseline_orders) × AOV × safety_margin
     annual_incremental_revenue = incremental_monthly_revenue × 12
     ```
   - **Lift steps** table: Sessions, Product Viewed, Project Started, Image Added, Product Added, Order Completed — and what each lift multiplies (input volume vs. the step's inbound rate).
   - **Downstream behavior toggle**: "hold baseline rates constant" vs. "override downstream rates" and when to use each.
   - **Safety margin**: what the % means (haircut on incremental revenue), default 75%, why it exists.
   - **Segments**: Device × Visitor Type × Book Group select the baseline rates used in the chain.
   - **Sensitivity callouts**: how the app stress-tests AOV ±5%, lift size ±10%, and baseline rates ±10% / ±0.3pp — included so readers understand what drives swings.
3. **README — Funnel Definitions** (mirrors `src/routes/readme.tsx`)
   - What the calculator is, trailing-12-month window, funnel step definitions (one bullet each), single-session rule, the three segments (Device, Book Group, Visitor Type) with the New-vs-Returning order callout as a block quote, order exclusions, key limitations.
4. **AOV README** (mirrors `src/routes/aov-readme.tsx`)
   - What AOV represents, calculation (net revenue ÷ distinct orders per device × product line), trailing-12-month window, inclusion rules, device attribution, session-attribution limitation.
5. **Glossary** — short table of terms (Sessions, PDP rate, PSR, Image Add rate, Add-to-Cart rate, Checkout rate, AOV, Safety margin, Lift).

## Notes

- Content is documentation only; no code in the app changes.
- Wording for README / AOV sections is taken verbatim (or lightly re-flowed for Markdown) from the in-app pages so the Confluence article and the app stay consistent.
- Output will be delivered via a `<presentation-artifact>` tag so you can preview/download the `.md` directly.