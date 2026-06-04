import Papa from "papaparse";

export type SessionRow = {
  device: string;
  productLine: string;
  sessions: number;
  pdpSessions: number;
  loginStarted: number;
  loginCompleted: number;
  alreadyAuthenticated: number;
  projectStarted: number;
  imageAdded: number;
  addedToCart: number;
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

export function parseSessionCsv(text: string): SessionRow[] {
  const rows = parseWithPapa(text);
  return rows
    .map((r) => ({
      device: pick(r, ["device", "device_category", "devicecategory"]),
      productLine: pick(r, ["product_line", "productline", "product"]),
      pdpSessions: num(
        pick(r, [
          "pdp_sessions",
          "pdpsessions",
          "avg_monthly_product_viewed",
          "product_viewed",
        ]),
      ),
      projectStarted: num(
        pick(r, [
          "project_started",
          "projectstarted",
          "avg_monthly_project_started",
        ]),
      ),
      loginStarted: num(
        pick(r, [
          "log_in_started",
          "loginstarted",
          "login_started",
          "avg_monthly_log_in_started",
          "avg_monthly_login_started",
        ]),
      ),
      loginCompleted: num(
        pick(r, [
          "log_in_completed",
          "logincompleted",
          "login_completed",
          "avg_monthly_log_in_completed",
          "avg_monthly_login_completed",
        ]),
      ),
      alreadyAuthenticated: num(
        pick(r, [
          "already_authenticated",
          "alreadyauthenticated",
          "avg_monthly_already_authenticated",
        ]),
      ),
      imageAdded: num(
        pick(r, ["image_added", "imageadded", "avg_monthly_image_added"]),
      ),
      addedToCart: num(
        pick(r, [
          "added_to_cart",
          "addedtocart",
          "product_added",
          "avg_monthly_product_added",
        ]),
      ),
      orders: num(
        pick(r, [
          "orders",
          "order_completed",
          "avg_monthly_order_completed",
        ]),
      ),
    }))
    .filter((r) => r.device && r.productLine);
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
  pdpSessions: number;
  loginStarted: number;
  loginCompleted: number;
  alreadyAuthenticated: number;
  projectStarted: number;
  imageAdded: number;
  addedToCart: number;
  orders: number;
  aov: number;
};

const ALL_DEVICES = "All Devices";
const ALL_PRODUCTS = "All products";

export function computeBaseline(
  sessionRows: SessionRow[],
  aovRows: AovRow[],
  device: string,
  productLines: string | string[],
): Baseline {
  const eq = (a: string, b: string) => norm(a) === norm(b);
  const matchDevice = (d: string) => device === ALL_DEVICES || eq(d, device);
  const selected = Array.isArray(productLines) ? productLines : [productLines];
  const allProducts =
    selected.length === 0 || selected.some((p) => p === ALL_PRODUCTS);
  const matchProduct = (p: string) =>
    allProducts || selected.some((sel) => eq(sel, p));

  const sessions = sessionRows.filter(
    (r) => matchDevice(r.device) && matchProduct(r.productLine),
  );
  const aovs = aovRows.filter(
    (r) => matchDevice(r.device) && matchProduct(r.productLine),
  );

  const sum = sessions.reduce(
    (acc, r) => ({
      pdpSessions: acc.pdpSessions + r.pdpSessions,
      loginStarted: acc.loginStarted + r.loginStarted,
      loginCompleted: acc.loginCompleted + r.loginCompleted,
      alreadyAuthenticated: acc.alreadyAuthenticated + r.alreadyAuthenticated,
      projectStarted: acc.projectStarted + r.projectStarted,
      imageAdded: acc.imageAdded + r.imageAdded,
      addedToCart: acc.addedToCart + r.addedToCart,
      orders: acc.orders + r.orders,
    }),
    { pdpSessions: 0, loginStarted: 0, loginCompleted: 0, alreadyAuthenticated: 0, projectStarted: 0, imageAdded: 0, addedToCart: 0, orders: 0 },
  );

  const aovOrderTotal = aovs.reduce((a, r) => a + r.orders, 0);
  const aovWeighted = aovs.reduce((a, r) => a + r.aov * r.orders, 0);
  const aov = aovOrderTotal > 0 ? aovWeighted / aovOrderTotal : 0;

  return { ...sum, aov };
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
