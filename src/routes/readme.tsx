import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { isAuthenticated, logout } from "@/lib/auth";

export const Route = createFileRoute("/readme")({
  head: () => ({
    meta: [
      { title: "README — Planning Funnel Calculator" },
      {
        name: "description",
        content:
          "Business logic reference for the Planning Funnel Calculator: what each number represents and how it's produced.",
      },
      { property: "og:title", content: "README — Planning Funnel Calculator" },
      {
        property: "og:description",
        content:
          "Business logic reference for the Planning Funnel Calculator.",
      },
    ],
  }),
  component: ReadmePage,
});

function ReadmePage() {
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
              activeProps={{ className: "rounded-md px-3 py-1.5 bg-nav-active text-nav-active-foreground" }}
            >
              Calculator
            </Link>
            <Link
              to="/readme"
              className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              activeProps={{ className: "rounded-md px-3 py-1.5 bg-nav-active text-nav-active-foreground" }}
            >
              README
            </Link>
            <Link
              to="/aov-readme"
              className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              activeProps={{ className: "rounded-md px-3 py-1.5 bg-nav-active text-nav-active-foreground" }}
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
              Planning Funnel Calculator
            </h1>
            <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <dt className="font-medium text-foreground">Prepared by</dt>
              <dd>Analytics</dd>
              <dt className="font-medium text-foreground">Audience</dt>
              <dd>Finance and senior leadership</dd>
              <dt className="font-medium text-foreground">Purpose</dt>
              <dd>
                Documents what each number in the Planning Funnel Calculator represents
                and how it is produced.
              </dd>
            </dl>
          </header>

          <Section title="What the Calculator Is">
            <p>
              The Planning Funnel Calculator estimates the revenue impact of improving a
              specific step in the customer purchase journey. You input a proposed
              improvement (e.g.{" "}
              <em>&ldquo;5% more visitors start a project&rdquo;</em>), and the
              calculator projects how that flows through to additional orders and monthly
              revenue.
            </p>
          </Section>

          <Section title="Time Window">
            <p>
              All numbers reflect a <strong>trailing 12-month average</strong>. The total
              activity over the past 12 months is divided by 12 to produce a monthly
              figure, smoothing seasonal peaks and providing a stable planning baseline.
            </p>
          </Section>

          <Section title="The Funnel Steps">
            <dl className="space-y-4">
              <FunnelStep name="Sessions">
                The number of visits to the website per month. Each visit counts once.
              </FunnelStep>
              <FunnelStep name="Product Viewed">
                Sessions in which the visitor viewed at least one product page. Each
                session counts once.
              </FunnelStep>
              <FunnelStep name="Login Started / Login Completed">
                Sessions in which the visitor initiated or completed a login. These are
                shown for context but sit outside the main purchase funnel. A visitor can
                log in without ever viewing a product, so these figures are not directly
                comparable to the steps above or below them.
              </FunnelStep>
              <FunnelStep name="Project Started">
                Sessions in which the visitor opened the editor and began building a
                project. Each session counts once.
              </FunnelStep>
              <FunnelStep name="Image Added">
                Sessions in which the visitor added at least one photo to their project.{" "}
                <strong>This step is an estimate</strong>: the underlying data does not
                directly tie photo activity to a specific session, so it is reconstructed
                from timing patterns. It is a reliable indicator of relative scale, not a
                precise count.
              </FunnelStep>
              <FunnelStep name="Product Added">
                Sessions in which the visitor added a product to their cart. Each session
                counts once.
              </FunnelStep>
              <FunnelStep name="Order Completed">
                Paid B2C orders placed per month. Each order counts once.
              </FunnelStep>
            </dl>
          </Section>

          <Section title="The Single-Session Rule">
            <p>
              Every step is counted <strong>once per visit</strong>. A customer building a
              photo book in a single session places dozens of photos and may click
              &ldquo;add to cart&rdquo; multiple times. Without this rule those actions
              would each count separately, making the funnel appear far larger than it is
              and making the rates between steps meaningless. Counting each behavior once
              per visit ensures the funnel reflects the number of customer visits that
              included that behavior, which is the right unit for measuring conversion.
            </p>
          </Section>

          <Section title="The Three Segments">
            <div className="space-y-6">
              <Segment title="Device: Mobile vs. Desktop">
                <p>
                  <strong>Mobile</strong> includes phones and tablets.{" "}
                  <strong>Desktop</strong> is desktop browsers only.
                </p>
              </Segment>
              <Segment title="Book Group: Books vs. Non-Books">
                <p>
                  <strong>Books</strong> include all photo book products.{" "}
                  <strong>Non-Books</strong> include everything else: cards, prints,
                  frames, calendars, and ornaments. When a session or order involves both
                  a book and a non-book product, it is counted as Books.
                </p>
              </Segment>
              <Segment title="Visitor Type: New vs. Returning">
                <p>
                  <strong>New</strong> visitors are on their first-ever visit to the site.{" "}
                  <strong>Returning</strong> visitors have been to the site at least once
                  before. This is based on visit history, not purchase history. A loyal
                  customer visiting from a new device would be counted as New.
                </p>
                <Callout>
                  <strong>Note on orders:</strong> An order is classified as New or
                  Returning based on the visit in which the customer started their
                  project, not the visit in which they placed the order. Because many
                  customers build a project in one visit and return to purchase later, the
                  Orders count can exceed the Add to Cart count within the New segment.
                  This is expected, not an error.
                </Callout>
              </Segment>
            </div>
          </Section>

          <Section title="What Is Excluded from Orders">
            <p>Only genuine paid B2C transactions are included. Excluded:</p>
            <ul className="ml-6 list-disc space-y-1.5 marker:text-muted-foreground">
              <li>Canceled orders</li>
              <li>B2B customer orders</li>
              <li>Orders using employee, sample, or test discount codes</li>
              <li>Unpaid or $0 orders</li>
            </ul>
          </Section>

          <Section title="Key Limitations">
            <div className="space-y-5">
              <Limitation title="Sessions and Login do not split by Book Group.">
                A session starts before a visitor has expressed any product preference,
                so there is no way to classify it as Books or Non-Books at that point.
                When the calculator is filtered to Books or Non-Books, the Sessions and
                Login figures are the same in both views. They should not be added
                together across the two book rows, as that would double-count the same
                visits.
              </Limitation>
              <Limitation title="Login can exceed Product Viewed.">
                Many visitors log in from the homepage or account page without viewing a
                product. This is expected.
              </Limitation>
              <Limitation title="The funnel steps are independent counts, not a strict cascade.">
                Each step counts the visits in which that behavior occurred. A visitor
                does not need to appear in one step to be counted in another. The rates
                between steps are historical averages used as planning approximations,
                not guaranteed conversion rates. The safety margin input exists to
                account for this uncertainty.
              </Limitation>
            </div>
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

function FunnelStep({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-4">
      <dt className="font-semibold text-foreground">{name}</dt>
      <dd className="mt-1 text-[15px] leading-relaxed text-foreground/85">{children}</dd>
    </div>
  );
}

function Segment({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <div className="space-y-2 text-[15px] leading-relaxed text-foreground/85">
        {children}
      </div>
    </div>
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

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-foreground/85">
      {children}
    </div>
  );
}
