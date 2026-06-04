import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";


import { isAuthenticated, logout } from "@/lib/auth";
import {
  type SessionRow,
  type AovRow,
  type Baseline,
  computeBaseline,
  fmtInt,
  fmtUsd,
  safeDiv,
  parseSessionCsv,
  parseAovCsv,
  ALL,
} from "@/lib/funnel-data";
import aovCsvRaw from "@/data/aov_data.csv?raw";
import { toast } from "sonner";
import { Check, Upload, Download, Loader2, ArrowDown, AlertTriangle } from "lucide-react";
import { Fragment } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";


export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Funnel Calculator" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: Dashboard,
});

const DEVICES = ["Desktop", "Mobile", "Tablet"] as const;
const VISITOR_TYPES = [ALL, "New", "Returning"] as const;
const BOOK_GROUPS = [ALL, "Books", "Non-Books"] as const;


// Funnel chain steps available to lift. The label identifies the node whose
// inbound rate is lifted (Product Viewed lifts the input volume itself).
type LiftStep =
  | "Sessions"
  | "ProductViewed"
  | "ProjectStarted"
  | "ImageAdded"
  | "ProductAdded"
  | "OrderCompleted";

const LIFT_STEPS: { value: LiftStep; label: string; rateLabel: string }[] = [
  { value: "Sessions", label: "Sessions", rateLabel: "" },
  { value: "ProductViewed", label: "Product Viewed", rateLabel: "PDP Rate" },
  { value: "ProjectStarted", label: "Project Started", rateLabel: "PSR" },
  { value: "ImageAdded", label: "Image Added", rateLabel: "Image Add Rate" },
  { value: "ProductAdded", label: "Product Added", rateLabel: "Add to Cart Rate" },
  { value: "OrderCompleted", label: "Order Completed", rateLabel: "Checkout Rate" },
];

type RateKey = "pdpRate" | "psr" | "imageAddRate" | "addToCartRate" | "checkoutRate";

type Rates = {
  pdpRate: number;
  psr: number;
  imageAddRate: number;
  addToCartRate: number;
  checkoutRate: number;
};

// Rate keys for steps strictly DOWNSTREAM of the given lifted step.
// (The lifted step's own rate is the one being lifted.)
function downstreamRateKeys(s: LiftStep): RateKey[] {
  switch (s) {
    case "Sessions":
      return ["pdpRate", "psr", "imageAddRate", "addToCartRate", "checkoutRate"];
    case "ProductViewed":
      return ["psr", "imageAddRate", "addToCartRate", "checkoutRate"];
    case "ProjectStarted":
      return ["imageAddRate", "addToCartRate", "checkoutRate"];
    case "ImageAdded":
      return ["addToCartRate", "checkoutRate"];
    case "ProductAdded":
      return ["checkoutRate"];
    case "OrderCompleted":
      return [];
  }
}

const RATE_LABEL: Record<RateKey, string> = {
  pdpRate: "PDP Rate",
  psr: "PSR",
  imageAddRate: "Image Add Rate",
  addToCartRate: "Add to Cart Rate",
  checkoutRate: "Checkout Rate",
};

type ChainState = {
  sessions: number;
  product_viewed: number;
  project_started: number;
  image_added: number;
  product_added: number;
  order_completed: number;
  revenue: number;
  rates: Rates;
};

function computeChain(
  sessions: number,
  pdpSessions: number,
  aov: number,
  rates: Rates,
  liftStep: LiftStep | null,
  liftMult: number,
  downstreamOverrides?: Partial<Record<RateKey, number>>,
): ChainState {
  const r = { ...rates };
  let sessionsVal = sessions;
  if (liftStep && liftMult !== 1) {
    if (liftStep === "Sessions") sessionsVal *= liftMult;
    else if (liftStep === "ProductViewed") r.pdpRate *= liftMult;
    else if (liftStep === "ProjectStarted") r.psr *= liftMult;
    else if (liftStep === "ImageAdded") r.imageAddRate *= liftMult;
    else if (liftStep === "ProductAdded") r.addToCartRate *= liftMult;
    else if (liftStep === "OrderCompleted") r.checkoutRate *= liftMult;
  }
  // Downstream behavior assumption overrides apply only to lifted chains
  // (i.e., when a lift step is actually being applied).
  if (liftStep && downstreamOverrides) {
    for (const k of downstreamRateKeys(liftStep)) {
      const v = downstreamOverrides[k];
      if (v !== undefined && Number.isFinite(v)) r[k] = v;
    }
  }
  // Sessions data may not be available yet; when missing, fall back to
  // pdpSessions as the top of the funnel and surface "—" for Sessions / PDP Rate.
  const hasSessionsData = sessionsVal > 0 && Number.isFinite(r.pdpRate) && r.pdpRate > 0;
  const product_viewed = hasSessionsData ? sessionsVal * r.pdpRate : pdpSessions;
  const sessionsOut = hasSessionsData ? sessionsVal : NaN;
  if (!hasSessionsData) r.pdpRate = NaN;
  const project_started = product_viewed * r.psr;
  const image_added = project_started * r.imageAddRate;
  const product_added = image_added * r.addToCartRate;
  const order_completed = product_added * r.checkoutRate;
  const revenue = order_completed * aov;
  return {
    sessions: sessionsOut,
    product_viewed,
    project_started,
    image_added,
    product_added,
    order_completed,
    revenue,
    rates: r,
  };
}

function ratesFromBaseline(b: Baseline): Rates {
  return {
    pdpRate: safeDiv(b.pdpSessions, b.sessions),
    psr: safeDiv(b.projectStarted, b.pdpSessions),
    imageAddRate: safeDiv(b.imageAdded, b.projectStarted),
    addToCartRate: safeDiv(b.addedToCart, b.imageAdded),
    checkoutRate: safeDiv(b.orders, b.addedToCart),
  };
}

function blendedRatesFromChain(c: ChainState): Rates {
  return {
    pdpRate: safeDiv(c.product_viewed, c.sessions),
    psr: safeDiv(c.project_started, c.product_viewed),
    imageAddRate: safeDiv(c.image_added, c.project_started),
    addToCartRate: safeDiv(c.product_added, c.image_added),
    checkoutRate: safeDiv(c.order_completed, c.product_added),
  };
}

// ----------------------------- Assumptions / Sensitivity helpers -----------------------------

const STEP_LABEL: Record<LiftStep, string> = {
  Sessions: "Sessions",
  ProductViewed: "Product Viewed",
  ProjectStarted: "Project Started",
  ImageAdded: "Image Added",
  ProductAdded: "Product Added",
  OrderCompleted: "Order Completed",
};

const RATE_PLAIN: Record<RateKey, string> = {
  pdpRate: "PDP rate",
  psr: "project start rate",
  imageAddRate: "image-add rate",
  addToCartRate: "add-to-cart rate",
  checkoutRate: "order conversion",
};

function annualIncremental(
  sessions: number,
  pdp: number,
  aov: number,
  rates: Rates,
  testStep: LiftStep,
  liftMult: number,
  downstream: Partial<Record<RateKey, number>> | undefined,
  safetyMult: number,
): number {
  const base = computeChain(sessions, pdp, aov, rates, null, 1);
  const lifted = computeChain(sessions, pdp, aov, rates, testStep, liftMult, downstream);
  return (lifted.revenue - base.revenue) * safetyMult * 12;
}

function buildAssumptionsText(args: {
  testStep: LiftStep;
  liftPct: number;
  trafficBase: string;
  overrides: Array<{ key: RateKey; overridePct: number; baselinePct: number }>;
  aov: number;
  monthly: number;
  annual: number;
}): string {
  const lines: string[] = [];
  lines.push(`Lift applied at: ${STEP_LABEL[args.testStep]} (+${args.liftPct}%)`);
  lines.push(`Traffic base: ${args.trafficBase}`);
  if (args.overrides.length === 0) {
    lines.push(`Downstream behavior: baseline rates held constant`);
  } else {
    lines.push(`Downstream overrides:`);
    for (const o of args.overrides) {
      lines.push(
        `  - ${RATE_PLAIN[o.key]}: ${o.overridePct.toFixed(2)}% (replaces baseline ${o.baselinePct.toFixed(2)}%)`,
      );
    }
  }
  lines.push(`AOV: ${fmtUsd(args.aov)}`);
  lines.push(`Monthly incremental revenue: ${fmtUsd(args.monthly)}`);
  lines.push(`Annualized: ${fmtUsd(args.annual)}`);
  return lines.join("\n");
}

type SensCandidate = { label: string; swing: number };

function computeSensitivity(args: {
  sessions: number;
  pdp: number;
  aov: number;
  rates: Rates;
  testStep: LiftStep;
  liftMult: number;
  downstream: Partial<Record<RateKey, number>> | undefined;
  safetyMult: number;
}): SensCandidate[] {
  const base = annualIncremental(
    args.sessions, args.pdp, args.aov, args.rates, args.testStep, args.liftMult, args.downstream, args.safetyMult,
  );
  if (!Number.isFinite(base) || args.liftMult === 1) return [];
  const candidates: SensCandidate[] = [];

  const measure = (hi: number, lo: number) =>
    Math.max(Math.abs(hi - base), Math.abs(lo - base));

  // AOV ±5%
  {
    const hi = annualIncremental(args.sessions, args.pdp, args.aov * 1.05, args.rates, args.testStep, args.liftMult, args.downstream, args.safetyMult);
    const lo = annualIncremental(args.sessions, args.pdp, args.aov * 0.95, args.rates, args.testStep, args.liftMult, args.downstream, args.safetyMult);
    candidates.push({ label: `AOV (±5% = ±${fmtUsd(measure(hi, lo))} annualized)`, swing: measure(hi, lo) });
  }

  // Lift size ±10% (relative on (liftMult - 1))
  {
    const delta = args.liftMult - 1;
    const hi = annualIncremental(args.sessions, args.pdp, args.aov, args.rates, args.testStep, 1 + delta * 1.1, args.downstream, args.safetyMult);
    const lo = annualIncremental(args.sessions, args.pdp, args.aov, args.rates, args.testStep, 1 + delta * 0.9, args.downstream, args.safetyMult);
    candidates.push({ label: `lift size (±10% = ±${fmtUsd(measure(hi, lo))} annualized)`, swing: measure(hi, lo) });
  }

  // Rates: ±10% relative and ±0.3pp absolute
  const rateKeys: RateKey[] = ["pdpRate", "psr", "imageAddRate", "addToCartRate", "checkoutRate"];
  for (const k of rateKeys) {
    const cur = args.rates[k];
    if (!Number.isFinite(cur)) continue;
    {
      const hi = annualIncremental(args.sessions, args.pdp, args.aov, { ...args.rates, [k]: cur * 1.1 }, args.testStep, args.liftMult, args.downstream, args.safetyMult);
      const lo = annualIncremental(args.sessions, args.pdp, args.aov, { ...args.rates, [k]: cur * 0.9 }, args.testStep, args.liftMult, args.downstream, args.safetyMult);
      candidates.push({ label: `baseline ${RATE_PLAIN[k]} (±10% = ±${fmtUsd(measure(hi, lo))} annualized)`, swing: measure(hi, lo) });
    }
    {
      const pp = 0.003;
      const hi = annualIncremental(args.sessions, args.pdp, args.aov, { ...args.rates, [k]: cur + pp }, args.testStep, args.liftMult, args.downstream, args.safetyMult);
      const lo = annualIncremental(args.sessions, args.pdp, args.aov, { ...args.rates, [k]: Math.max(0, cur - pp) }, args.testStep, args.liftMult, args.downstream, args.safetyMult);
      candidates.push({ label: `baseline ${RATE_PLAIN[k]} (±0.3pp = ±${fmtUsd(measure(hi, lo))} annualized)`, swing: measure(hi, lo) });
    }
  }

  candidates.sort((a, b) => b.swing - a.swing);
  return candidates;
}

function sensitivityLine(cands: SensCandidate[]): string {
  if (cands.length === 0) return "";
  const top = cands.slice(0, Math.min(2, cands.length)).filter((c) => c.swing > 0);
  if (top.length === 0) return "";
  return `Most sensitive to: ${top.map((c) => c.label).join("; ")}.`;
}

function Dashboard() {
  const navigate = useNavigate();
  const [authReady, setAuthReady] = useState(false);

  const [device, setDevice] = useState<string>("All Devices");
  const [visitorType, setVisitorType] = useState<string>(ALL);
  const [bookGroup, setBookGroup] = useState<string>(ALL);
  const [safetyMargin, setSafetyMargin] = useState<string>("75");

  type Mode = "aggregate" | "segmented";
  const [mode, setMode] = useState<Mode>(() => {
    if (typeof window === "undefined") return "aggregate";
    const v = localStorage.getItem("funnel.viewMode");
    return v === "segmented" ? "segmented" : "aggregate";
  });
  useEffect(() => {
    try { localStorage.setItem("funnel.viewMode", mode); } catch {}
  }, [mode]);

  // Test Configuration state — resets each session. Defaults: PSR, no lift.
  const [testStep, setTestStep] = useState<LiftStep>("ProjectStarted");
  const [testLift, setTestLift] = useState<string>("");


  // Per-segment baseline rate overrides keyed by "device|visitor|book".
  // Resets each session so baseline always shows on load.
  type RateKey = "pdpRate" | "psr" | "imageAddRate" | "addToCartRate" | "checkoutRate";
  type SegmentOverrides = Partial<Record<RateKey, string>>;
  const [segmentRates, setSegmentRates] = useState<Record<string, SegmentOverrides>>({});

  // Downstream behavior assumption overrides (absolute % strings) keyed by RateKey.
  const [downstreamOverrides, setDownstreamOverrides] = useState<Partial<Record<RateKey, string>>>({});

  // Aggregate-view baseline rate overrides (absolute % strings) keyed by RateKey.
  // Resets each session so baseline always shows on load.
  const [aggregateRateOverrides, setAggregateRateOverrides] = useState<Partial<Record<RateKey, string>>>({});


  const [sessionRows, setSessionRows] = useState<SessionRow[]>([]);
  const [aovRows, setAovRows] = useState<AovRow[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);

  const [sessionOk, setSessionOk] = useState(false);
  const [aovOk, setAovOk] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) navigate({ to: "/" });
    else setAuthReady(true);
  }, [navigate]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setDataLoading(true);
        const storedSession =
          typeof window !== "undefined"
            ? localStorage.getItem("funnel.sessionCsv")
            : null;
        const storedAov =
          typeof window !== "undefined"
            ? localStorage.getItem("funnel.aovCsv")
            : null;
        const aovText = storedAov ?? aovCsvRaw;
        const s = storedSession ? parseSessionCsv(storedSession) : [];
        const a = parseAovCsv(aovText);
        if (cancelled) return;
        setSessionRows(s);
        setAovRows(a);
        setDataError(null);
      } catch (err) {
        if (cancelled) return;
        setDataError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const baseline = useMemo(
    () => computeBaseline(sessionRows, aovRows, device, visitorType, bookGroup),
    [sessionRows, aovRows, device, visitorType, bookGroup],
  );

  // Build available segments (one per row in CSV) filtered by the current selectors.
  const segments = useMemo(() => {
    const list: Array<{
      key: string;
      device: string;
      visitorType: string;
      bookGroup: string;
      baseline: Baseline;
      defaultRates: Rates;
    }> = [];
    const matchDev = (d: string) =>
      device === "All Devices" || d.toLowerCase() === device.toLowerCase();
    const matchVis = (v: string) =>
      visitorType === ALL || v.toLowerCase() === visitorType.toLowerCase();
    const matchBook = (b: string) =>
      bookGroup === ALL || b.toLowerCase() === bookGroup.toLowerCase();
    for (const r of sessionRows) {
      if (!matchDev(r.device) || !matchVis(r.visitorType) || !matchBook(r.bookGroup)) continue;
      const b = computeBaseline(sessionRows, aovRows, r.device, r.visitorType, r.bookGroup);
      if (!b.pdpSessions && !b.sessions) continue;
      list.push({
        key: `${r.device}|${r.visitorType}|${r.bookGroup}`,
        device: r.device,
        visitorType: r.visitorType,
        bookGroup: r.bookGroup,
        baseline: b,
        defaultRates: ratesFromBaseline(b),
      });
    }
    return list;
  }, [sessionRows, aovRows, device, visitorType, bookGroup]);


  const liftMult = useMemo(() => {
    const n = parseFloat(testLift);
    return Number.isFinite(n) ? 1 + n / 100 : 1;
  }, [testLift]);

  const safetyMult = useMemo(() => {
    const n = parseFloat(safetyMargin);
    return Number.isFinite(n) ? n / 100 : 1;
  }, [safetyMargin]);

  // ---------- Aggregate mode chain ----------
  const aggregateDefaultRates = useMemo(() => ratesFromBaseline(baseline), [baseline]);
  const aggregateRates = useMemo<Rates>(() => {
    const out: Rates = { ...aggregateDefaultRates };
    (Object.keys(aggregateRateOverrides) as RateKey[]).forEach((k) => {
      const raw = aggregateRateOverrides[k];
      if (raw !== undefined && raw !== "") {
        const n = parseFloat(raw);
        if (Number.isFinite(n)) out[k] = n / 100;
      }
    });
    return out;
  }, [aggregateDefaultRates, aggregateRateOverrides]);

  // Baseline NEVER reflects overrides — overrides only affect the "with lift" line.
  const aggregateBaselineChain = useMemo(
    () => computeChain(baseline.sessions, baseline.pdpSessions, baseline.aov, aggregateDefaultRates, null, 1),
    [baseline, aggregateDefaultRates],
  );

  // Parse downstream overrides (string % -> decimal) for the currently active testStep.
  const parsedDownstream = useMemo<Partial<Record<RateKey, number>>>(() => {
    const out: Partial<Record<RateKey, number>> = {};
    for (const k of downstreamRateKeys(testStep)) {
      const raw = downstreamOverrides[k];
      if (raw !== undefined && raw !== "") {
        const n = parseFloat(raw);
        if (Number.isFinite(n)) out[k] = n / 100;
      }
    }
    return out;
  }, [downstreamOverrides, testStep]);

  const overriddenSet = useMemo(() => {
    const s = new Set<RateKey>();
    for (const k of Object.keys(parsedDownstream) as RateKey[]) s.add(k);
    return s;
  }, [parsedDownstream]);

  const aggregateLiftedChain = useMemo<ChainState>(() => {
    if (liftMult === 1) return aggregateBaselineChain;
    return computeChain(baseline.sessions, baseline.pdpSessions, baseline.aov, aggregateRates, testStep, liftMult, parsedDownstream);
  }, [aggregateBaselineChain, aggregateRates, baseline, liftMult, testStep, parsedDownstream]);

  const aggIncrementalMonthly = (aggregateLiftedChain.revenue - aggregateBaselineChain.revenue) * safetyMult;
  const aggIncrementalAnnual = aggIncrementalMonthly * 12;

  // Validate that no in-funnel rate exceeds 100%. Login is off-funnel so excluded.
  const rateBreaches = useMemo(() => {
    const r = aggregateDefaultRates;
    const checks: Array<{ key: RateKey; pct: number }> = [];
    (["pdpRate", "psr", "imageAddRate", "addToCartRate", "checkoutRate"] as RateKey[]).forEach((k) => {
      const v = r[k];
      if (Number.isFinite(v) && v > 1) checks.push({ key: k, pct: v * 100 });
    });
    return checks;
  }, [aggregateDefaultRates]);

  if (!authReady) return null;


  if (dataLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading data…
        </div>
      </div>
    );
  }

  if (dataError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-destructive">Failed to load data: {dataError}</p>
      </div>
    );
  }

  const handleUpload = async (file: File | undefined, kind: "session" | "aov") => {
    if (!file) return;
    try {
      const text = await file.text();
      if (kind === "session") {
        const rows = parseSessionCsv(text);
        if (!rows.length) throw new Error("No rows parsed");
        setSessionRows(rows);
        try { localStorage.setItem("funnel.sessionCsv", text); } catch {}
        setSessionOk(true);
        toast.success(`Session data updated (${rows.length} rows)`);
        setTimeout(() => setSessionOk(false), 2500);
      } else {
        const rows = parseAovCsv(text);
        if (!rows.length) throw new Error("No rows parsed");
        setAovRows(rows);
        try { localStorage.setItem("funnel.aovCsv", text); } catch {}
        setAovOk(true);
        toast.success(`AOV data updated (${rows.length} rows)`);
        setTimeout(() => setAovOk(false), 2500);
      }
    } catch (err) {
      toast.error(`Failed to parse CSV: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  };

  const handleDownload = () => {
    const liftPctNum = parseFloat(testLift) || 0;
    const stepLabel = LIFT_STEPS.find((s) => s.value === testStep)?.label ?? testStep;
    const headers = ["Funnel Step", "Baseline", "With Lift"];
    const fmt = (v: number, currency = false) =>
      Number.isFinite(v) ? (currency ? fmtUsd(v) : fmtInt(v)) : "";
    const rows: string[][] = [
      ["Test step", stepLabel, ""],
      ["Test lift %", `${liftPctNum}%`, ""],
      ["Sessions", fmt(aggregateBaselineChain.sessions), fmt(aggregateLiftedChain.sessions)],
      ["Product Viewed", fmt(aggregateBaselineChain.product_viewed), fmt(aggregateLiftedChain.product_viewed)],
      ["Project Started", fmt(aggregateBaselineChain.project_started), fmt(aggregateLiftedChain.project_started)],
      ["Product Added", fmt(aggregateBaselineChain.product_added), fmt(aggregateLiftedChain.product_added)],
      ["Order Completed", fmt(aggregateBaselineChain.order_completed), fmt(aggregateLiftedChain.order_completed)],
      ["AOV", fmt(baseline.aov, true), fmt(baseline.aov, true)],
      ["Total Monthly Revenue", fmt(aggregateBaselineChain.revenue, true), fmt(aggregateLiftedChain.revenue, true)],
      ["Incremental Monthly Revenue", "", fmt(aggIncrementalMonthly, true)],
      ["Annualized Incremental Revenue", "", fmt(aggIncrementalAnnual, true)],
    ];
    const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const safeDevice = device.replace(/\s+/g, "");
    const safeSeg = `${visitorType}_${bookGroup}`.replace(/\s+/g, "");
    link.href = url;
    link.download = `scenario_${safeDevice}_${safeSeg}.csv`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("Scenario downloaded");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b px-8 py-4">
        <div className="flex items-center gap-3">
          <h1 className="font-serif text-xl font-medium tracking-tight"><span className="underline underline-offset-4 decoration-1">Planning</span> Funnel Calculator</h1>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 ring-1 ring-emerald-500/20">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
            </span>
            Planning
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            logout();
            navigate({ to: "/" });
          }}
        >
          Log out
        </Button>
      </header>

      <div className="flex min-h-[calc(100vh-57px)] w-full">
        {/* INPUTS sidebar */}
        <aside className="w-80 shrink-0 border-r bg-muted/30 p-6">
          <h2 className="text-xs font-semibold tracking-widest text-muted-foreground">
            INPUTS
          </h2>

          <div className="mt-6 space-y-5">
            <div className="space-y-2">
              <Label>Device</Label>
              <Select value={device} onValueChange={setDevice}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["All Devices", "Desktop", "Mobile", "Tablet"].map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Visitor Type</Label>
              <Select value={visitorType} onValueChange={setVisitorType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VISITOR_TYPES.map((v) => (
                    <SelectItem key={v} value={v}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Book Group</Label>
              <Select value={bookGroup} onValueChange={setBookGroup}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BOOK_GROUPS.map((b) => (
                    <SelectItem key={b} value={b}>{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="safety">Safety Margin %</Label>
              <div className="relative">
                <Input
                  id="safety"
                  type="number"
                  inputMode="decimal"
                  step="1"
                  min="0"
                  max="100"
                  placeholder="75"
                  value={safetyMargin}
                  onChange={(e) => setSafetyMargin(e.target.value)}
                  className="pr-8"
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">%</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Applied to Incremental Monthly Revenue and Annualized.
              </p>
            </div>
          </div>

          <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
            No session, user, or timeline constraints applied. Each funnel step
            is counted independently based on the event date. Steps are not
            required to occur together, in sequence, or within any window; a
            step count reflects all qualifying events during the selected time
            period, regardless of who or what session generated them.
          </p>

          <div className="mt-8 border-t pt-6">
            <h2 className="text-xs font-semibold tracking-widest text-muted-foreground">
              DATA MANAGEMENT
            </h2>
            <div className="mt-4 space-y-4">
              <FileDrop
                id="session-upload"
                label="Upload Segmented Session CSV"
                ok={sessionOk}
                onFile={(f) => handleUpload(f, "session")}
              />
              <FileDrop
                id="aov-upload"
                label="Update AOV Data (CSV)"
                ok={aovOk}
                onFile={(f) => handleUpload(f, "aov")}
              />
            </div>
          </div>

        </aside>

        {/* OUTPUTS */}
        <main className="flex-1 p-6">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xs font-semibold tracking-widest text-muted-foreground">
              OUTPUTS
            </h2>
            <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
              <TabsList>
                <TabsTrigger value="aggregate">Aggregate</TabsTrigger>
                <TabsTrigger value="segmented">Segmented by Device × Visitor × Book</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {sessionRows.length === 0 && (
            <div className="mt-6 rounded-md border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
              Upload a segmented session CSV to populate the funnel.
              <div className="mt-1 text-xs">
                Expected columns: DEVICE_SEGMENT, VISITOR_TYPE, BOOK_GROUP, AVG_MONTHLY_TOTAL_SESSIONS, AVG_MONTHLY_PRODUCT_VIEWED, AVG_MONTHLY_LOGIN_STARTED, AVG_MONTHLY_LOGIN_COMPLETED, AVG_MONTHLY_PROJECT_STARTED, AVG_MONTHLY_IMAGE_ADDED, AVG_MONTHLY_PRODUCT_ADDED, AVG_MONTHLY_ORDER_COMPLETED.
              </div>
            </div>
          )}

          {rateBreaches.length > 0 && (
            <div className="mt-6 flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-semibold">Data looks like raw event counts, not session-deduped — re-run the source query.</p>
                <p className="mt-1 text-xs opacity-90">
                  These rates exceed 100%: {rateBreaches.map((b) => `${RATE_LABEL[b.key]} ${b.pct.toFixed(1)}%`).join(", ")}.
                </p>
              </div>
            </div>
          )}

          {/* Test Configuration panel */}
          <TestConfigPanel
            testStep={testStep}
            setTestStep={setTestStep}
            testLift={testLift}
            setTestLift={setTestLift}
          />


          {mode === "aggregate" ? (
            <div className="mt-6">
              <ChainView
                label="Aggregate"
                title="All traffic"
                baselineChain={aggregateBaselineChain}
                liftedChain={aggregateLiftedChain}
                aov={baseline.aov}
                affectedStep={testStep}
                liftActive={liftMult !== 1}
                overriddenSet={overriddenSet}
                incrementalMonthly={aggIncrementalMonthly}
                incrementalAnnual={aggIncrementalAnnual}
                assumptions={
                  <AssumptionsPanel
                    testStep={testStep}
                    liftPct={parseFloat(testLift) || 0}
                    trafficBase="All traffic"
                    overrides={(Object.keys(parsedDownstream) as RateKey[]).map((k) => ({
                      key: k,
                      overridePct: (parsedDownstream[k] as number) * 100,
                      baselinePct: aggregateDefaultRates[k] * 100,
                    }))}
                    aov={baseline.aov}
                    monthly={aggIncrementalMonthly}
                    annual={aggIncrementalAnnual}
                    sessions={baseline.sessions}
                    pdp={baseline.pdpSessions}
                    rates={aggregateRates}
                    liftMult={liftMult}
                    downstream={parsedDownstream}
                    safetyMult={safetyMult}
                  />
                }
                editableRates={{
                  defaults: aggregateDefaultRates,
                  values: aggregateRateOverrides,
                  onChange: (k, v) =>
                    setAggregateRateOverrides((prev) => {
                      const next = { ...prev };
                      if (v === "") delete next[k];
                      else next[k] = v;
                      return next;
                    }),
                  onReset: () => setAggregateRateOverrides({}),
                }}
              />
            </div>

          ) : (
            <div className="mt-6 space-y-6">
              {segments.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No segments with data for the selected filters.
                </p>
              ) : (
                segments.map((seg) => (
                  <SegmentFunnel
                    key={seg.key}
                    segmentKey={seg.key}
                    device={seg.device}
                    productLine={`${seg.visitorType} · ${seg.bookGroup}`}

                    baseline={seg.baseline}
                    defaultRates={seg.defaultRates}
                    overrides={segmentRates[seg.key] ?? {}}
                    onChange={(next) =>
                      setSegmentRates((prev) => ({ ...prev, [seg.key]: next }))
                    }
                    onReset={() =>
                      setSegmentRates((prev) => {
                        const { [seg.key]: _, ...rest } = prev;
                        return rest;
                      })
                    }
                    testStep={testStep}
                    liftMult={liftMult}
                    liftActive={liftMult !== 1}
                    safetyMult={safetyMult}
                    downstreamOverrides={parsedDownstream}
                    overriddenSet={overriddenSet}
                  />
                ))
              )}
            </div>

          )}

          <div className="mt-6 flex justify-end">
            <Button
              size="sm"
              onClick={handleDownload}
              className="bg-accent text-accent-foreground hover:bg-accent/90 rounded-sm"
              disabled={mode === "segmented"}
              title={mode === "segmented" ? "Download is available in Aggregate mode" : undefined}
            >
              <Download className="mr-2 h-4 w-4" />
              Download Scenario as CSV
            </Button>
          </div>
        </main>
      </div>
    </div>
  );
}

// ----------------------------- Test Config Panel -----------------------------

function TestConfigPanel({
  testStep,
  setTestStep,
  testLift,
  setTestLift,
}: {
  testStep: LiftStep;
  setTestStep: (v: LiftStep) => void;
  testLift: string;
  setTestLift: (v: string) => void;
}) {
  return (
    <section className="mt-4 rounded-md border bg-card p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Test Configuration
        </h3>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Step affected</Label>
          <Select value={testStep} onValueChange={(v) => setTestStep(v as LiftStep)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {LIFT_STEPS.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="testLift" className="text-xs">Lift %</Label>
          <div className="relative">
            <Input
              id="testLift"
              type="number"
              inputMode="decimal"
              step="0.01"
              placeholder="0.00"
              value={testLift}
              onChange={(e) => setTestLift(e.target.value)}
              className="pr-8"
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">%</span>
          </div>
        </div>

      </div>

    </section>
  );
}



// ----------------------------- Chain View (aggregate) -----------------------------

function ChainView({
  label,
  title,
  baselineChain,
  liftedChain,
  aov,
  affectedStep,
  liftActive,
  overriddenSet,
  incrementalMonthly,
  incrementalAnnual,
  assumptions,
  editableRates,
}: {
  label?: string;
  title?: string;
  baselineChain: ChainState;
  liftedChain: ChainState;
  aov: number;
  affectedStep: LiftStep;
  liftActive: boolean;
  overriddenSet?: Set<RateKey>;
  incrementalMonthly: number;
  incrementalAnnual: number;
  assumptions?: React.ReactNode;
  editableRates?: {
    defaults: Rates;
    values: Partial<Record<RateKey, string>>;
    onChange: (k: RateKey, v: string) => void;
    onReset: () => void;
  };
}) {
  const isOver = (k: RateKey) => liftActive && !!overriddenSet?.has(k);
  const hasRateOverrides =
    !!editableRates &&
    Object.values(editableRates.values).some((v) => v !== undefined && v !== "");

  const renderRateRow = (
    rateKey: RateKey,
    label: string,
    isAffected: boolean,
  ) => {
    if (editableRates) {
      return (
        <SegEditableRateRow
          label={label}
          rateKey={rateKey}
          defaultPct={editableRates.defaults[rateKey] * 100}
          value={editableRates.values[rateKey] ?? ""}
          onChangeInput={(v) => editableRates.onChange(rateKey, v)}
          baseline={baselineChain.rates[rateKey]}
          lifted={liftedChain.rates[rateKey]}
          isAffected={isAffected}
          liftActive={liftActive}
          isOverridden={isOver(rateKey)}
        />
      );
    }
    return (
      <ChainEdgeRow
        label={label}
        baseline={baselineChain.rates[rateKey]}
        lifted={liftedChain.rates[rateKey]}
        isAffected={isAffected}
        liftActive={liftActive}
        isOverridden={isOver(rateKey)}
      />
    );
  };

  return (
    <section className="rounded-md border bg-card">
      {(label || title) && (
        <header className="flex items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3">
          <div>
            {label && (
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {label}
              </p>
            )}
            {title && <h3 className="text-sm font-medium">{title}</h3>}
          </div>
          <div className="flex items-center gap-2">
            {liftActive && (
              <span className="rounded-sm bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                Lift applied
              </span>
            )}
            {hasRateOverrides && editableRates && (
              <Button variant="ghost" size="sm" onClick={editableRates.onReset}>
                Reset rates
              </Button>
            )}
          </div>
        </header>
      )}
      <div className="flex flex-col items-stretch gap-2 p-4">

        <ChainNodeRow
          label="Sessions"
          baseline={baselineChain.sessions}
          lifted={liftedChain.sessions}
          isAffected={affectedStep === "Sessions"}
          liftActive={liftActive}
        />
        <ChainArrow />
        {renderRateRow("pdpRate", "PDP Rate", affectedStep === "ProductViewed")}
        <ChainArrow />
        <ChainNodeRow
          label="Product Viewed"
          baseline={baselineChain.product_viewed}
          lifted={liftedChain.product_viewed}
          isAffected={affectedStep === "ProductViewed"}
          liftActive={liftActive}
        />
        <ChainArrow />
        {renderRateRow("psr", "PSR", affectedStep === "ProjectStarted")}
        <ChainArrow />
        <ChainNodeRow
          label="Project Started"
          baseline={baselineChain.project_started}
          lifted={liftedChain.project_started}
          isAffected={affectedStep === "ProjectStarted"}
          liftActive={liftActive}
        />
        <ChainArrow />
        {renderRateRow("imageAddRate", "Image Add Rate", affectedStep === "ImageAdded")}
        <ChainArrow />
        <ChainNodeRow
          label="Image Added"
          baseline={baselineChain.image_added}
          lifted={liftedChain.image_added}
          isAffected={affectedStep === "ImageAdded"}
          liftActive={liftActive}
        />
        <ChainArrow />
        {renderRateRow("addToCartRate", "Add to Cart Rate", affectedStep === "ProductAdded")}
        <ChainArrow />
        <ChainNodeRow
          label="Product Added"
          baseline={baselineChain.product_added}
          lifted={liftedChain.product_added}
          isAffected={affectedStep === "ProductAdded"}
          liftActive={liftActive}
        />
        <ChainArrow />
        {renderRateRow("checkoutRate", "Checkout Rate", affectedStep === "OrderCompleted")}
        <ChainArrow />
        <ChainNodeRow
          label="Order Completed"
          baseline={baselineChain.order_completed}
          lifted={liftedChain.order_completed}
          isAffected={affectedStep === "OrderCompleted"}
          liftActive={liftActive}
        />
        <ChainArrow />
        <ChainNodeRow
          label="AOV"
          baseline={aov}
          lifted={aov}
          isAffected={false}
          liftActive={liftActive}
          kind="currency"
          muted
        />
        <ChainArrow />
        <ChainNodeRow
          label="Total Monthly Revenue"
          baseline={baselineChain.revenue}
          lifted={liftedChain.revenue}
          isAffected={false}
          liftActive={liftActive}
          kind="currency"
          highlight
        />
      </div>
      <footer className="grid grid-cols-1 gap-3 border-t bg-muted/20 p-4 sm:grid-cols-2">
        <SummaryCard label="Incremental Monthly Revenue" value={incrementalMonthly} />
        <SummaryCard label="Annualized Incremental Revenue" value={incrementalAnnual} />
      </footer>
      {assumptions && <div className="border-t p-4">{assumptions}</div>}
    </section>
  );
}


function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-card p-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 font-mono text-lg font-semibold tabular-nums">
        {Number.isFinite(value) ? fmtUsd(value) : "—"}
      </p>
    </div>
  );
}

function AssumptionsPanel({
  testStep,
  liftPct,
  trafficBase,
  overrides,
  aov,
  monthly,
  annual,
  sessions,
  pdp,
  rates,
  liftMult,
  downstream,
  safetyMult,
}: {
  testStep: LiftStep;
  liftPct: number;
  trafficBase: string;
  overrides: Array<{ key: RateKey; overridePct: number; baselinePct: number }>;
  aov: number;
  monthly: number;
  annual: number;
  sessions: number;
  pdp: number;
  rates: Rates;
  liftMult: number;
  downstream: Partial<Record<RateKey, number>> | undefined;
  safetyMult: number;
}) {
  const text = buildAssumptionsText({ testStep, liftPct, trafficBase, overrides, aov, monthly, annual });
  const sens = computeSensitivity({ sessions, pdp, aov, rates, testStep, liftMult, downstream, safetyMult });
  const sensText = sensitivityLine(sens);
  const full = sensText ? `${text}\n\n${sensText}` : text;

  const copy = () => {
    navigator.clipboard?.writeText(full).then(
      () => toast.success("Assumptions copied"),
      () => toast.error("Copy failed"),
    );
  };

  return (
    <section className="mt-4 rounded-md border bg-card">
      <header className="flex items-center justify-between border-b bg-muted/30 px-4 py-2.5">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Assumptions Summary
        </h3>
        <Button variant="ghost" size="sm" onClick={copy} className="h-7 text-xs">
          Copy
        </Button>
      </header>
      <pre className="select-all whitespace-pre-wrap break-words p-4 font-mono text-xs leading-relaxed text-foreground">
{full}
      </pre>
    </section>
  );
}

function ChainArrow() {
  return (
    <div className="flex items-center justify-center text-muted-foreground">
      <ArrowDown className="h-4 w-4" />
    </div>
  );
}

function ChainNodeRow({
  label,
  baseline,
  lifted,
  isAffected,
  liftActive,
  kind = "volume",
  highlight,
  muted,
  badge,
}: {
  label: string;
  baseline: number;
  lifted: number;
  isAffected: boolean;
  liftActive: boolean;
  kind?: "volume" | "currency";
  highlight?: boolean;
  muted?: boolean;
  badge?: string;
}) {
  const fmt = kind === "currency" ? fmtUsd : fmtInt;
  return (
    <div
      className={cn(
        "grid grid-cols-[1fr_auto_auto] items-center gap-4 rounded-md border bg-card px-4 py-3",
        highlight && "border-accent/60 bg-accent/5",
        muted && "bg-muted/30",
        isAffected && "border-primary ring-1 ring-primary/40",
      )}
    >
      <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
        {badge && (
          <span className="ml-2 rounded-sm bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
            {badge}
          </span>
        )}
        {isAffected && (
          <span className="ml-2 rounded-sm bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold text-primary">
            LIFT
          </span>
        )}
      </span>
      <ValuePair
        baseline={Number.isFinite(baseline) ? fmt(baseline) : "—"}
        lifted={liftActive && Number.isFinite(lifted) ? fmt(lifted) : "—"}
        liftActive={liftActive}
      />
    </div>
  );
}


function ChainEdgeRow({
  label,
  baseline,
  lifted,
  isAffected,
  liftActive,
  isOverridden,
}: {
  label: string;
  baseline: number;
  lifted: number;
  isAffected: boolean;
  liftActive: boolean;
  isOverridden?: boolean;
}) {
  const fmt = (v: number) => (Number.isFinite(v) ? `${(v * 100).toFixed(2)}%` : "—");
  return (
    <div
      className={cn(
        "grid grid-cols-[1fr_auto_auto] items-center gap-4 rounded-md border border-dashed bg-muted/40 px-4 py-2.5",
        isAffected && "border-primary bg-primary/5 ring-1 ring-primary/30",
        !isAffected && isOverridden && "border-amber-500/60 bg-amber-500/10 ring-1 ring-amber-500/20",
      )}
    >
      <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        <span aria-hidden>×</span>
        <span>{label}</span>
        {isAffected && (
          <span className="ml-2 rounded-sm bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold text-primary">
            LIFT
          </span>
        )}
        {!isAffected && isOverridden && (
          <span className="ml-2 rounded-sm bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
            Override
          </span>
        )}
      </span>
      <ValuePair
        baseline={fmt(baseline)}
        lifted={liftActive ? fmt(lifted) : "—"}
        liftActive={liftActive}
        smaller
      />
    </div>
  );
}

function ValuePair({
  baseline,
  lifted,
  liftActive,
  smaller,
}: {
  baseline: string;
  lifted: string;
  liftActive: boolean;
  smaller?: boolean;
}) {
  const size = smaller ? "text-xs" : "text-sm";
  return (
    <Fragment>
      <div className="flex flex-col items-end">
        <span className="text-[9px] uppercase tracking-wider text-muted-foreground">Baseline</span>
        <span className={cn("font-mono tabular-nums", size)}>{baseline}</span>
      </div>
      <div className="flex flex-col items-end">
        <span className="text-[9px] uppercase tracking-wider text-muted-foreground">With lift</span>
        <span
          className={cn(
            "font-mono tabular-nums",
            size,
            liftActive ? "font-semibold text-foreground" : "text-muted-foreground",
          )}
        >
          {lifted}
        </span>
      </div>
    </Fragment>
  );
}

// ----------------------------- Segment Funnel -----------------------------

type SegRateKey = "pdpRate" | "psr" | "imageAddRate" | "addToCartRate" | "checkoutRate";
type SegOverrides = Partial<Record<SegRateKey, string>>;

function SegmentFunnel({
  segmentKey: _segmentKey,
  device,
  productLine,
  baseline,
  defaultRates,
  overrides,
  onChange,
  onReset,
  testStep,
  liftMult,
  liftActive,
  safetyMult,
  downstreamOverrides,
  overriddenSet,
}: {
  segmentKey: string;
  device: string;
  productLine: string;
  baseline: Baseline;
  defaultRates: Rates;
  overrides: SegOverrides;
  onChange: (next: SegOverrides) => void;
  onReset: () => void;
  testStep: LiftStep;
  liftMult: number;
  liftActive: boolean;
  safetyMult: number;
  downstreamOverrides?: Partial<Record<RateKey, number>>;
  overriddenSet?: Set<RateKey>;
}) {
  const rateOf = (k: SegRateKey): number => {
    const raw = overrides[k];
    if (raw !== undefined && raw !== "") {
      const n = parseFloat(raw);
      if (Number.isFinite(n)) return n / 100;
    }
    return defaultRates[k];
  };

  const effectiveRates: Rates = {
    pdpRate: rateOf("pdpRate"),
    psr: rateOf("psr"),
    imageAddRate: rateOf("imageAddRate"),
    addToCartRate: rateOf("addToCartRate"),
    checkoutRate: rateOf("checkoutRate"),
  };

  const baselineChain = computeChain(baseline.sessions, baseline.pdpSessions, baseline.aov, defaultRates, null, 1);
  const liftedChain = computeChain(baseline.sessions, baseline.pdpSessions, baseline.aov, effectiveRates, testStep, liftMult, downstreamOverrides);
  const isOver = (k: RateKey) => liftActive && !!overriddenSet?.has(k);

  const incrementalMonthly = (liftedChain.revenue - baselineChain.revenue) * safetyMult;
  const incrementalAnnual = incrementalMonthly * 12;

  const setOverride = (k: SegRateKey, v: string) => {
    const next = { ...overrides };
    if (v === "") delete next[k];
    else next[k] = v;
    onChange(next);
  };

  const hasOverrides = Object.values(overrides).some((v) => v !== undefined && v !== "");

  return (
    <section className="rounded-md border bg-card">
      <header className="flex items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            {device}
          </p>
          <h3 className="text-sm font-medium">{productLine}</h3>
        </div>
        <div className="flex items-center gap-2">
          {liftActive && (
            <span className="rounded-sm bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
              Lift applied
            </span>
          )}
          {hasOverrides && (
            <Button variant="ghost" size="sm" onClick={onReset}>
              Reset rates
            </Button>
          )}
        </div>
      </header>
      <div className="flex flex-col items-stretch gap-2 p-4">
        <ChainNodeRow
          label="Sessions"
          baseline={baselineChain.sessions}
          lifted={liftedChain.sessions}
          isAffected={testStep === "Sessions"}
          liftActive={liftActive}
        />
        <ChainArrow />
        <SegEditableRateRow
          label="PDP Rate"
          rateKey="pdpRate"
          defaultPct={defaultRates.pdpRate * 100}
          value={overrides.pdpRate ?? ""}
          onChangeInput={(v) => setOverride("pdpRate", v)}
          baseline={baselineChain.rates.pdpRate}
          lifted={liftedChain.rates.pdpRate}
          isAffected={testStep === "ProductViewed"}
          liftActive={liftActive}
          isOverridden={isOver("pdpRate")}
        />
        <ChainArrow />
        <ChainNodeRow
          label="Product Viewed"
          baseline={baselineChain.product_viewed}
          lifted={liftedChain.product_viewed}
          isAffected={testStep === "ProductViewed"}
          liftActive={liftActive}
        />
        <ChainArrow />
        <SegEditableRateRow
          label="PSR"
          rateKey="psr"
          defaultPct={defaultRates.psr * 100}
          value={overrides.psr ?? ""}
          onChangeInput={(v) => setOverride("psr", v)}
          baseline={baselineChain.rates.psr}
          lifted={liftedChain.rates.psr}
          isAffected={testStep === "ProjectStarted"}
          liftActive={liftActive}
          isOverridden={isOver("psr")}
        />
        <ChainArrow />
        <ChainNodeRow
          label="Project Started"
          baseline={baselineChain.project_started}
          lifted={liftedChain.project_started}
          isAffected={testStep === "ProjectStarted"}
          liftActive={liftActive}
        />
        <ChainArrow />
        <SegEditableRateRow
          label="Image Add Rate"
          rateKey="imageAddRate"
          defaultPct={defaultRates.imageAddRate * 100}
          value={overrides.imageAddRate ?? ""}
          onChangeInput={(v) => setOverride("imageAddRate", v)}
          baseline={baselineChain.rates.imageAddRate}
          lifted={liftedChain.rates.imageAddRate}
          isAffected={testStep === "ImageAdded"}
          liftActive={liftActive}
          isOverridden={isOver("imageAddRate")}
        />
        <ChainArrow />
        <ChainNodeRow
          label="Image Added"
          baseline={baselineChain.image_added}
          lifted={liftedChain.image_added}
          isAffected={testStep === "ImageAdded"}
          liftActive={liftActive}
        />
        <ChainArrow />
        <SegEditableRateRow
          label="Add to Cart Rate"
          rateKey="addToCartRate"
          defaultPct={defaultRates.addToCartRate * 100}
          value={overrides.addToCartRate ?? ""}
          onChangeInput={(v) => setOverride("addToCartRate", v)}
          baseline={baselineChain.rates.addToCartRate}
          lifted={liftedChain.rates.addToCartRate}
          isAffected={testStep === "ProductAdded"}
          liftActive={liftActive}
          isOverridden={isOver("addToCartRate")}
        />
        <ChainArrow />
        <ChainNodeRow
          label="Product Added"
          baseline={baselineChain.product_added}
          lifted={liftedChain.product_added}
          isAffected={testStep === "ProductAdded"}
          liftActive={liftActive}
        />
        <ChainArrow />
        <SegEditableRateRow
          label="Checkout Rate"
          rateKey="checkoutRate"
          defaultPct={defaultRates.checkoutRate * 100}
          value={overrides.checkoutRate ?? ""}
          onChangeInput={(v) => setOverride("checkoutRate", v)}
          baseline={baselineChain.rates.checkoutRate}
          lifted={liftedChain.rates.checkoutRate}
          isAffected={testStep === "OrderCompleted"}
          liftActive={liftActive}
          isOverridden={isOver("checkoutRate")}
        />
        <ChainArrow />
        <ChainNodeRow
          label="Order Completed"
          baseline={baselineChain.order_completed}
          lifted={liftedChain.order_completed}
          isAffected={testStep === "OrderCompleted"}
          liftActive={liftActive}
        />
        <ChainArrow />
        <ChainNodeRow
          label="AOV"
          baseline={baseline.aov}
          lifted={baseline.aov}
          isAffected={false}
          liftActive={liftActive}
          kind="currency"
          muted
        />
        <ChainArrow />
        <ChainNodeRow
          label="Total Monthly Revenue"
          baseline={baselineChain.revenue}
          lifted={liftedChain.revenue}
          isAffected={false}
          liftActive={liftActive}
          kind="currency"
          highlight
        />
      </div>
      <footer className="grid grid-cols-1 gap-3 border-t bg-muted/20 p-4 sm:grid-cols-2">
        <SummaryCard label="Incremental Monthly Revenue" value={incrementalMonthly} />
        <SummaryCard label="Annualized Incremental Revenue" value={incrementalAnnual} />
      </footer>
      <div className="border-t p-4">
        <AssumptionsPanel
          testStep={testStep}
          liftPct={(liftMult - 1) * 100}
          trafficBase={liftActive ? `${device} × ${productLine}` : "Not in test scope"}
          overrides={
            downstreamOverrides
              ? (Object.keys(downstreamOverrides) as RateKey[]).map((k) => ({
                  key: k,
                  overridePct: (downstreamOverrides[k] as number) * 100,
                  baselinePct: defaultRates[k] * 100,
                }))
              : []
          }
          aov={baseline.aov}
          monthly={incrementalMonthly}
          annual={incrementalAnnual}
          sessions={baseline.sessions}
          pdp={baseline.pdpSessions}
          rates={effectiveRates}
          liftMult={liftMult}
          downstream={downstreamOverrides}
          safetyMult={safetyMult}
        />
      </div>
    </section>
  );
}

function SegEditableRateRow({
  label,
  rateKey: _rateKey,
  defaultPct,
  value,
  onChangeInput,
  baseline,
  lifted,
  isAffected,
  liftActive,
  isOverridden,
}: {
  label: string;
  rateKey: SegRateKey;
  defaultPct: number;
  value: string;
  onChangeInput: (v: string) => void;
  baseline: number;
  lifted: number;
  isAffected: boolean;
  liftActive: boolean;
  isOverridden?: boolean;
}) {
  const placeholder = Number.isFinite(defaultPct) ? defaultPct.toFixed(2) : "0.00";
  const fmt = (v: number) => (Number.isFinite(v) ? `${(v * 100).toFixed(2)}%` : "—");
  return (
    <div
      className={cn(
        "grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 rounded-md border border-dashed bg-muted/40 px-4 py-2.5",
        isAffected && "border-primary bg-primary/5 ring-1 ring-primary/30",
        !isAffected && isOverridden && "border-amber-500/60 bg-amber-500/10 ring-1 ring-amber-500/20",
      )}
    >
      <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        <span aria-hidden>×</span>
        <span>{label}</span>
        {isAffected && (
          <span className="ml-2 rounded-sm bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold text-primary">
            LIFT
          </span>
        )}
        {!isAffected && isOverridden && (
          <span className="ml-2 rounded-sm bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
            Override
          </span>
        )}
      </span>
      <div className="relative w-24">
        <Input
          type="number"
          inputMode="decimal"
          step="0.01"
          placeholder={placeholder}
          value={value !== "" ? value : placeholder}
          onChange={(e) => onChangeInput(e.target.value)}
          className="h-8 pr-6 text-right font-mono text-xs tabular-nums"
        />
        <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-muted-foreground">%</span>
      </div>
      <div className="flex flex-col items-end">
        <span className="text-[9px] uppercase tracking-wider text-muted-foreground">Baseline</span>
        <span className="font-mono text-xs tabular-nums">{fmt(baseline)}</span>
      </div>
      <div className="flex flex-col items-end">
        <span className="text-[9px] uppercase tracking-wider text-muted-foreground">With lift</span>
        <span
          className={cn(
            "font-mono text-xs tabular-nums",
            liftActive ? "font-semibold text-foreground" : "text-muted-foreground",
          )}
        >
          {liftActive ? fmt(lifted) : "—"}
        </span>
      </div>
    </div>
  );
}

// ----------------------------- Misc -----------------------------

function FileDrop({
  id,
  label,
  ok,
  onFile,
}: {
  id: string;
  label: string;
  ok: boolean;
  onFile: (file: File | undefined) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="flex items-center gap-2">
        {label}
        {ok && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600">
            <Check className="h-3.5 w-3.5" /> Updated
          </span>
        )}
      </Label>
      <label
        htmlFor={id}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          onFile(e.dataTransfer.files?.[0]);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed bg-background px-3 py-4 text-center text-xs text-muted-foreground transition-colors hover:bg-muted/50",
          dragOver && "border-primary bg-muted/50",
          ok && "border-green-500/60",
        )}
      >
        <Upload className="h-4 w-4" />
        <span>Drop CSV here or click to browse</span>
      </label>
      <input
        id={id}
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}



