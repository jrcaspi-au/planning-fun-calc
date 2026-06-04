import Papa from "papaparse";

export type SessionRow = {
  device: string;
  visitorType: string; // "New" | "Returning"
  bookGroup: string;   // "Books" | "Non-Books"
  sessions: number;
  pdpSessions: number;     // product_viewed
  loginStarted: number;
  loginCompleted: number;
  projectStarted: number;
  imageAdded: number;
  addedToCart: number;     // product_added
  orders: number;
};

export type AovRow = {
  device: string;
  productLine: string;
  aov: number;
  orders: number;
};

const norm = (s: string) =>
  String(s ?? "").toLowerCase().replace(/[\s_\-]/g, "");

const num = (v: unknown) =>
  Number(String(v ?? "").replace(/[$,\s]/g, "")) || 0;

function parseWithPapa(text: string): Record<string, string>[] {
  const res = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  return (res.data ?? []).filter((r) => r && Object.keys(r).length > 0);
}

function pick(row: Record<string, string>, aliases: string[]): string {
  const keys = Object.keys(row);
  for (const alias of aliases) {
    const k = keys.find((key) => norm(key) === norm(alias));
    if (k && row[k] !== undefined && row[k] !== "") return row[k];
  }
  return "";
}

// Normalise visitor type / book group labels coming from the CSV so that
// the dropdowns can match them regardless of casing or surrounding spaces.
function normVisitor(v: string): string {
  const n = String(v ?? "").trim().toLowerCase();
  if (n.startsWith("new")) return "New";
  if (n.startsWith("ret")) return "Returning";
  return v;
}

function normBook(v: string): string {
  const n = String(v ?? "").trim().toLowerCase().replace(/[\s_\-]/g, "");
  if (n === "books" || n === "book") return "Books";
  if (n === "nonbooks" || n === "nonbook" || n === "notbooks") return "Non-Books";
  return v;
}

function normDevice(v: string): string {
  const n = String(v ?? "").trim().toLowerCase();
  if (n.startsWith("desk")) return "Desktop";
  if (n.startsWith("mob")) return "Mobile";
  if (n.startsWith("tab")) return "Tablet";
  return v;
}

export function parseSessionCsv(text: string): SessionRow[] {
  const rows = parseWithPapa(text);
  return rows
    .map((r) => ({
      device: normDevice(
        pick(r, ["device_segment", "device", "device_category", "devicecategory"]),
      ),
      visitorType: normVisitor(
        pick(r, ["visitor_type", "visitortype", "visitor"]),
      ),
      bookGroup: normBook(
        pick(r, ["book_group", "bookgroup", "book"]),
      ),
      sessions: num(
        pick(r, [
          "avg_monthly_total_sessions",
          "total_sessions",
          "sessions",
        ]),
      ),
      pdpSessions: num(
        pick(r, [
          "avg_monthly_product_viewed",
          "product_viewed",
          "pdp_sessions",
        ]),
      ),
      loginStarted: num(
        pick(r, [
          "avg_monthly_login_started",
          "avg_monthly_log_in_started",
          "login_started",
        ]),
      ),
      loginCompleted: num(
        pick(r, [
          "avg_monthly_login_completed",
          "avg_monthly_log_in_completed",
          "login_completed",
        ]),
      ),
      projectStarted: num(
        pick(r, ["avg_monthly_project_started", "project_started"]),
      ),
      imageAdded: num(
        pick(r, ["avg_monthly_image_added", "image_added"]),
      ),
      addedToCart: num(
        pick(r, [
          "avg_monthly_product_added",
          "product_added",
          "added_to_cart",
        ]),
      ),
      orders: num(
        pick(r, [
          "avg_monthly_order_completed",
          "order_completed",
          "orders",
        ]),
      ),
    }))
    .filter((r) => r.device && r.visitorType && r.bookGroup);
}

export function parseAovCsv(text: string): AovRow[] {
  const rows = parseWithPapa(text);
  return rows
    .map((r) => ({
      device: pick(r, ["device", "device_category", "devicecategory"]),
      productLine: pick(r, ["product_line", "productline", "product"]),
      aov: num(pick(r, ["aov", "avg_order_value", "average_order_value"])),
      orders: num(pick(r, ["orders", "order_count", "n_orders"])),
    }))
    .filter((r) => r.device && r.productLine);
}

export type Baseline = {
  sessions: number;
  pdpSessions: number;
  loginStarted: number;
  loginCompleted: number;
  projectStarted: number;
  imageAdded: number;
  addedToCart: number;
  orders: number;
  aov: number;
};

export const ALL = "All";

const eq = (a: string, b: string) => norm(a) === norm(b);

export function computeBaseline(
  sessionRows: SessionRow[],
  aovRows: AovRow[],
  device: string,
  visitorType: string,
  bookGroup: string,
): Baseline {
  const matchDevice = (d: string) => device === ALL || eq(d, device);
  const matchVisitor = (v: string) => visitorType === ALL || eq(v, visitorType);
  const matchBook = (b: string) => bookGroup === ALL || eq(b, bookGroup);

  const filtered = sessionRows.filter(
    (r) => matchDevice(r.device) && matchVisitor(r.visitorType) && matchBook(r.bookGroup),
  );

  // Columns that are device×visitor totals duplicated across book rows.
  // For these, take ONE row per (device, visitor) cell to avoid double-counting
  // when book group = All.
  const seen = new Set<string>();
  let sessions = 0;
  let loginStarted = 0;
  let loginCompleted = 0;
  for (const r of filtered) {
    const k = `${r.device}|${r.visitorType}`;
    if (seen.has(k)) continue;
    seen.add(k);
    sessions += r.sessions;
    loginStarted += r.loginStarted;
    loginCompleted += r.loginCompleted;
  }

  // All other columns sum normally across selected dimensions.
  const sum = filtered.reduce(
    (acc, r) => ({
      pdpSessions: acc.pdpSessions + r.pdpSessions,
      projectStarted: acc.projectStarted + r.projectStarted,
      imageAdded: acc.imageAdded + r.imageAdded,
      addedToCart: acc.addedToCart + r.addedToCart,
      orders: acc.orders + r.orders,
    }),
    { pdpSessions: 0, projectStarted: 0, imageAdded: 0, addedToCart: 0, orders: 0 },
  );

  // AOV filtered by device only (visitor/book don't apply to the AOV file).
  const aovs = aovRows.filter((r) => device === ALL || eq(r.device, device));
  const aovOrderTotal = aovs.reduce((a, r) => a + r.orders, 0);
  const aovWeighted = aovs.reduce((a, r) => a + r.aov * r.orders, 0);
  const aov = aovOrderTotal > 0 ? aovWeighted / aovOrderTotal : 0;

  return {
    sessions,
    pdpSessions: sum.pdpSessions,
    loginStarted,
    loginCompleted,
    projectStarted: sum.projectStarted,
    imageAdded: sum.imageAdded,
    addedToCart: sum.addedToCart,
    orders: sum.orders,
    aov,
  };
}

export const fmtInt = (n: number) =>
  Number.isFinite(n) ? Math.round(n).toLocaleString("en-US") : "—";

export const fmtUsd = (n: number) =>
  Number.isFinite(n)
    ? n.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      })
    : "—";

export const fmtPct = (n: number) =>
  Number.isFinite(n) ? `${(n * 100).toFixed(1)}%` : "—";

export const safeDiv = (a: number, b: number) =>
  b > 0 && Number.isFinite(a) && Number.isFinite(b) ? a / b : 0;
