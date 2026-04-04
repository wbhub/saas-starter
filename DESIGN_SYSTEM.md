# Design System

How the UI in this codebase is currently structured, and why it was shaped this way.

This repo does not treat the design system as a separate theme layer sitting above the app. Most of the system lives in layout rails, shared shell primitives, and a small number of components that make those decisions easy to recognize in code. The goal has been to make the product feel orderly and extensible, not to turn the docs into a style guide with a long list of rules.

`ARCHITECTURE.md` explains how the application is assembled. `CONVENTIONS.md` explains how contributors usually extend it. This document is narrower than both: it describes the visual and responsive structure that the current codebase already expresses.

## Visual Language

The interface is built from shadcn/ui primitives, Tailwind CSS 4, and a restrained product UI vocabulary. Most surfaces use light borders, moderate corner radii, low-contrast backgrounds, and limited shadow. The palette and component styling are intentionally quiet; the layout and spacing are doing most of the work.

That choice was deliberate. The app is trying to read as a polished SaaS foundation rather than a branded marketing site. It needed to feel calm in the dashboard, predictable when new pages are added, and easy to adapt without every feature author inventing a new visual pattern.

## Shell Model

The most important layout decision in the repo is the split between public surfaces and signed-in product surfaces. Those two groups were pushed apart after it became clear they had different width and reading needs.

### Public surfaces

Public pages use the narrower container defined in `lib/site-layout.ts` as `publicContainerClassName`. It currently resolves to a centered shell with `max-w-[1440px]` and shared horizontal padding.

That width is used by the landing page, pricing, auth flows, onboarding, and legal pages. These pages generally contain a mix of reading, explanation, and forms, so they benefit from a more editorial outer frame. Earlier iterations reused the wider app shell everywhere, but that made public pages feel loose and slightly detached from their actual content density.

Public layouts often introduce a second, tighter measure inside that shell. Auth flows, for example, use `PublicCenteredContent` to keep forms centered and narrow without making the whole page feel cramped.

### Dashboard surfaces

The signed-in application uses `siteContainerClassName`, also defined in `lib/site-layout.ts`. That shell currently tops out at `max-w-[1680px]`.

The wider frame exists because the dashboard has persistent chrome that public pages do not: a left navigation column, page headers, data cards, and product surfaces like AI chat. On a 14-inch laptop the narrower public shell left too much usable space on the table, while on large monitors an unconstrained dashboard felt pinned to the outer edges of the screen. The current shell is a compromise between those two extremes.

The dashboard shell is intentionally not the same thing as the dashboard content width. The shell provides room for navigation and overall composition, while the page body sits on a separate inner rail so the main column does not stretch indefinitely just because more viewport width is available.

### Dashboard columns and rail

The dashboard shell is structured as a fixed sidebar plus a flexible content column. In `lib/site-layout.ts`, `dashboardShellColumnsClassName` currently maps to a `240px` sidebar at `lg`, widening to `260px` at `xl`, with a fluid main column beside it.

Inside that main column, `dashboardContentRailClassName` constrains the readable working area to `56rem`, then `64rem` at `xl`, and `72rem` at `2xl`. That inner rail is what keeps dashboard pages from feeling overextended after the outer shell widens. It is also the reason the signed-in header controls and footer links now align with the page body instead of drifting farther right than the main content.

## Shared Layout Primitives

Most of the layout intent in the repo now lives in a small set of shared components rather than scattered one-off class strings.

`components/layout-shells.tsx` holds the shell primitives:

- `PublicShell`
- `PublicCenteredContent`
- `DashboardShellFrame`
- `DashboardShellColumns`
- `DashboardShellSection`

These are deliberately thin wrappers. Their job is not to abstract Tailwind away; it is to make the shell choice visible in component code. Reading a page file should make it obvious whether that page belongs to the public surface, the dashboard frame, or a centered auth-style composition.

`components/dashboard-page-header.tsx` plays a similar role at the page level. It captures the repeated dashboard intro pattern of eyebrow, title, description, and optional actions, while `DashboardPageStack` normalizes the vertical rhythm between that intro block and the sections below it. The benefit there is not just visual consistency. It also means the intent of a dashboard page is legible before anyone reads the individual card content.

Supporting components such as `components/dashboard-page-section.tsx` and `components/dashboard-detail-field.tsx` carry some of the same system work farther down the tree. Those components centralize the spacing, wrapping, and dense metadata behavior that used to be re-authored page by page.

## Header, Footer, and Body Alignment

One of the more important refinements in this codebase was aligning the header and footer to the same underlying rails as the page body.

That mismatch became obvious once the dashboard shell widened. The main content had one visual alignment, while the user dropdown and footer links appeared to belong to a wider, unrelated frame. The current setup fixes that by letting the header and footer select their shell based on context: public surfaces use the public container, while dashboard surfaces use the wider shell and align their right-side content to the same inner rail as the main column.

This is a small detail in code, but it changes how the product reads. The sidebar, page body, user menu, and footer now look like parts of the same layout system instead of separate layers that happen to share a screen.

## Responsive Structure

The responsive work in this repo is based less on shrinking a desktop layout and more on changing presentation when the interaction model actually changes.

The dashboard navigation is the clearest example. On larger screens it lives as a sticky left sidebar. On smaller screens the same navigation moves into a `Sheet`. The information architecture stays the same, but the delivery changes because a permanent sidebar stops being useful once it begins to crowd the page body.

The AI surface was the other major forcing function. It had to remain usable on shorter laptop screens, narrow mobile screens, and desktop layouts with a recent-threads column. That is why the current implementation keeps the composer visible on shorter viewports, moves recents behind a sheet on smaller screens, and lets the AI card follow the dashboard content rail instead of stretching to the full shell width. The AI page behaves more like a product tool than a static marketing composition, so its responsive strategy is more structural than decorative.

Public pages follow a different pattern. They keep the narrower public shell, then add tighter inner measures only where the content type clearly benefits from it. Auth flows stay centered and compact. Legal pages keep article-like reading widths. Landing and pricing sections have more horizontal room than auth or legal, but they still remain more controlled than the signed-in dashboard.

## Why the System Landed Here

The current layout model came out of a few concrete tensions rather than an abstract desire to have a design system:

- The dashboard needed to use more of a laptop screen.
- The same dashboard could not feel pinned to the extreme edges of a large monitor.
- Public pages needed a different width story than signed-in product pages.
- Header, footer, sidebar, and body needed to agree on the same rails.
- Mobile navigation and AI interaction needed alternate presentations, not just smaller versions of desktop layouts.

Most of the recent UI work has been about turning those tensions into shared primitives and naming them clearly enough that the reasoning survives in the codebase.

## Stability and Drift

The layout system is also reflected in tests, not just components. Shell selection, shared layout primitives, and responsive behavior now have focused coverage so that the overall structure is harder to accidentally erode during feature work.

That matters because the design system here is mostly structural. If those rails move silently, the app starts to feel inconsistent long before any single component looks obviously broken. Keeping the shells, page primitives, and responsive breakpoints covered makes the system more durable than a purely visual review process would.

## Key Files

The files below define most of the layout intent a new contributor will run into first:

- `lib/site-layout.ts`
- `components/layout-shells.tsx`
- `components/site-header.tsx`
- `components/site-footer.tsx`
- `components/dashboard-shell.tsx`
- `components/dashboard-page-header.tsx`
- `components/dashboard-page-section.tsx`
- `components/dashboard-detail-field.tsx`
- `components/ai-chat-card.tsx`

Taken together, those files describe the current UI more accurately than a standalone style guide would. The design system in this repo is not a parallel document to the implementation; it is the implementation, with a few shared rails and abstractions doing most of the heavy lifting.
