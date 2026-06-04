## Problem

When a CSV is uploaded, the calculator displays zeros across the board even though rows are parsed successfully.

Root cause: a mismatch between the Device dropdown's "all" value and the sentinel `computeBaseline` checks for.

- `src/routes/dashboard.tsx` initializes `device` with the string `"All Devices"` and the select options are `["All Devices", "Desktop", "Mobile", "Tablet"]`.
- `src/lib/funnel-data.ts` exports `ALL = "All"`, and `computeBaseline` only skips device filtering when `device === ALL`. Otherwise it does `eq(row.device, device)`, comparing `"Desktop"` (etc.) against `"All Devices"` — which never matches.
- Result: `filtered` is empty → sessions, PDP, project started, orders, AOV all aggregate to 0.

Visitor Type and Book Group don't have this bug because they're initialized with the real `ALL` constant.

## Fix

Single, small change in `src/routes/dashboard.tsx`:

1. Use the `ALL` sentinel for the Device state too.
   - `useState<string>(ALL)` instead of `useState<string>("All Devices")`.
   - Select options become `[ALL, "Desktop", "Mobile", "Tablet"]` (label can still read "All Devices" via a conditional on the SelectItem children if we want to preserve the visible label).
2. Update the two other spots that compare against the literal `"All Devices"`:
   - The segments builder around line 425 (`device === "All Devices" || ...`) → `device === ALL || ...`.
   - The CSV filename builder around line 590 — keep it working with whatever the value is (it's just `replace(/\s+/g, "")`, so `"All"` is fine).

No changes to lift logic, safety margin, AOV math, parser, or layout.

## Verification

- Upload the 8-row CSV; confirm Sessions, Product Viewed, Project Started, etc. populate for the default "All" selection.
- Switch Device to Desktop/Mobile/Tablet and confirm numbers change accordingly.
- Switch Visitor Type and Book Group and confirm filtering still works.
- Confirm Segmented tab still lists segments.
