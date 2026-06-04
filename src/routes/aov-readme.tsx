import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { isAuthenticated, logout } from "@/lib/auth";

export const Route = createFileRoute("/aov-readme")({
  head: () => ({
    meta: [
      { title: "AOV README — Planning Funnel Calculator" },
      {
        name: "description",
        content:
          "Business logic reference for AOV data in the Planning Funnel Calculator: how average order value is calculated.",
      },
      { property: "og:title", content: "AOV README — Planning Funnel Calculator" },
      {
        property: "og:description",
        content:
          "Business logic reference for AOV data in the Planning Funnel Calculator.",
      },
    ],
  }),
  component: AovReadmePage,
});

function AovReadmePage() {
  const navigate = useNavigate();
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) navigate({ to: "/" });
    else setAuthReady(true);
  }, [navigate]);

  if (!authReady) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b px-8 py-4">
        <div className="flex items-center gap-6">
          <h1 className="font-serif text-xl font-medium tracking-tight">
            <span className="underline underline-offset-4 decoration-1">Planning</span>{" "}
            Funnel Calculator
          </h1>
          <nav className="flex items-center gap-1 text-sm">
            <Link
              to="/dashboard"
              className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              activeProps={{ className: "rounded-md px-3 py-1.5 bg-accent text-foreground" }}
            >
              Calculator
            </Link>
            <Link
              to="/readme"
              className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              activeProps={{ className: "rounded-md px-3 py-1.5 bg-accent text-foreground" }}
            >
              README
            </Link>
            <Link
              to="/aov-readme"
              className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              activeProps={{ className: "rounded-md px-3 py-1.5 bg-accent text-foreground" }}
            >
              AOV README
            </Link>
          </nav>
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

      <main className="mx-auto max-w-3xl px-8 py-12">
        <article className="space-y-10">
          <header className="space-y-3 border-b pb-8">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Business Logic Reference
            </p>
            <h1 className="font-serif text-4xl font-medium tracking-tight">
              AOV Data
            </h1>
            <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <dt className="font-medium text-foreground">Prepared by</dt>
              <dd>Analytics</dd>
              <dt className="font-medium text-foreground">Purpose</dt>
              <dd>
                Documents how average order value is calculated for use as an input in the Testing Funnel Calculator.
              </dd>
            </dl>
          </header>

          <Section title="What AOV Represents">
            <p>
              AOV (Average Order Value) is the average revenue generated per order, broken out by device and product line. It is the final multiplier in the calculator that converts an incremental order count into incremental revenue.
            </p>
          </Section>

          <Section title="How It Is Calculated">
            <p>
              Total net revenue is divided by the number of distinct orders within each device and product line combination. Net revenue reflects actual charged amounts after discounts.
            </p>
          </Section>

          <Section title="Time Window">
            <p>
              All numbers reflect a <strong>trailing 12-month average</strong>. The total activity over the past 12 months is divided by 12 to produce a monthly figure, smoothing seasonal peaks and providing a stable planning baseline.
            </p>
          </Section>

          <Section title="What Is Counted">
            <p>An order is included when all of the following are true:</p>
            <ul className="ml-6 list-disc space-y-1.5 marker:text-muted-foreground">
              <li>The order fired an order completion event on the website during the trailing 12-month window</li>
              <li>The session that generated the event was not a bot</li>
              <li>The order was not canceled</li>
              <li>The order was not placed by a B2B customer</li>
              <li>The order's product line is a known, classified product</li>
            </ul>
            <p className="mt-3">Each order is counted once.</p>
          </Section>

          <Section title="Device Attribution">
            <p>
              Device comes from the session in which the order completion event fired. Mobile includes phones and tablets. Desktop is desktop browsers only.
            </p>
          </Section>

          <Section title="Key Limitations">
            <Limitation title="AOV is session-attributed, not customer-attributed.">
              It reflects the value of orders placed in a specific type of session, not the lifetime value of the customer who placed them.
            </Limitation>
          </Section>
        </article>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="font-serif text-2xl font-medium tracking-tight">{title}</h2>
      <div className="space-y-3 text-[15px] leading-relaxed text-foreground/90">
        {children}
      </div>
    </section>
  );
}

function Limitation({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-l-2 border-border pl-4">
      <p className="font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-[15px] leading-relaxed text-foreground/80">{children}</p>
    </div>
  );
}
