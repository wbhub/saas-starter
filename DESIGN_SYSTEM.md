# Design System

How this codebase approaches layout, UI, responsiveness, and extension work.

This file exists so a new developer can clone the repo, open a few shared components, and quickly understand the system instead of reverse-engineering it from one-off classes.

## Goals

- Feel polished out of the box on laptop, desktop, and mobile.
- Prefer shared layout rules over page-specific tuning.
- Keep the UI consistent with the existing shadcn/base-nova style.
- Make design decisions obvious in code, not just visible in screenshots.

## Core Principles

### 1. System over one-offs

If a layout rule exists in more than one place, it belongs in a shared primitive or token.

Current examples:

- `lib/site-layout.ts` owns shared shell widths and dashboard rail tokens.
- `components/site-header.tsx`, `components/site-footer.tsx`, and `components/dashboard-shell.tsx` compose those shared rules instead of redefining them inline.

### 2. Public and dashboard shells are different on purpose

Public pages and signed-in app pages have different jobs, so they do not share the same maximum width.

- Public shell: controlled and editorial.
- Dashboard shell: roomier and more product-oriented.

### 3. Inner content rails matter as much as outer shells

A wide shell does not mean every page should expand edge to edge.

- Dashboard pages use a wider outer container for presence and breathing room.
- The main dashboard content still sits on an inner rail so cards, forms, and AI surfaces do not feel stretched.

### 4. Responsive behavior should feel native, not merely “shrunk”

Mobile UI should not be the desktop layout compressed into less space.

Examples in this repo:

- Dashboard navigation becomes a `Sheet` on smaller screens.
- The AI page moves recents into a mobile sheet instead of leaving a permanently cramped split view.
- Header account controls simplify on smaller screens.

## Layout System

Shared layout tokens live in [lib/site-layout.ts](/Users/hub/webdev/nextjs/saas-starter/lib/site-layout.ts).
Shared shell components live in [layout-shells.tsx](/Users/hub/webdev/nextjs/saas-starter/components/layout-shells.tsx).
Shared dashboard page primitives live in [dashboard-page-header.tsx](/Users/hub/webdev/nextjs/saas-starter/components/dashboard-page-header.tsx).

### Public shell

Use `publicContainerClassName` for:

- landing page
- pricing sections
- auth pages
- legal pages
- public header/footer

Current width:

- `max-w-[1440px]`

Use this when the page is marketing, editorial, legal, or task-focused around a single form.

In component code, prefer `PublicShell` over manually applying the public container class in page files.
For auth-style centered pages, prefer `PublicCenteredContent` instead of repeating ad hoc centering wrappers.

### Dashboard shell

Use `siteContainerClassName` for the signed-in application shell.

Current width:

- `max-w-[1680px]`

This gives the product more room on laptop and desktop screens without pushing content to literal screen edges on very large monitors.

In component code, prefer `DashboardShellFrame` for the outer shell and `DashboardShellSection` for the inner content rail.
For dashboard page intros and page spacing, prefer `DashboardPageHeader` and `DashboardPageStack` instead of rewriting the same eyebrow/title/description block.

### Dashboard columns

Use `dashboardShellColumnsClassName` when composing the signed-in shell:

- left nav column
- main content column

Current structure:

- `240px` sidebar at `lg`
- `260px` sidebar at `xl`
- fluid main column

### Dashboard content rail

Use `dashboardContentRailClassName` for the main dashboard content area and any dashboard header/footer alignment that should visually match it.

Current widths:

- base: `56rem`
- `xl`: `64rem`
- `2xl`: `72rem`

This is what keeps the app feeling intentional instead of overextended.

## Shared Shell Rules

### Header

The header should follow the shell of the surface it belongs to.

- Public header uses the public shell.
- Dashboard header uses the wide dashboard shell plus the dashboard content rail for right-side controls.

That is why the signed-in user dropdown aligns with the main content rail instead of floating beyond it.

### Footer

The footer follows the same rule as the header.

- Public footer uses the public shell.
- Dashboard footer uses the dashboard shell and aligns legal links to the dashboard content rail.

If header, footer, and page body do not agree on width, the product feels unstructured immediately.

## Responsive Patterns

### Navigation

- Desktop dashboard nav is a sticky left sidebar.
- Mobile dashboard nav is a `Sheet` opened from the header hamburger.
- Navigation data should be shared between desktop and mobile render paths.

Do not create separate nav structures for different breakpoints unless the information architecture actually changes.

### Modals, sheets, and panels

- Prefer `Sheet` for mobile navigation and off-canvas supporting UI.
- Keep critical actions visible within the viewport on laptop-height screens.
- Avoid fixed heights that hide primary inputs or send buttons.

### Forms and readable content

Purpose-built narrow content should stay narrow:

- auth forms
- legal/article text
- short informational intros

Do not widen these just because the outer shell is wider.

## Component System

### Prefer shadcn primitives

When adding or adjusting UI:

- start with existing shadcn primitives in `components/ui/`
- extend existing patterns before inventing a new visual language
- preserve the current tone of rounded corners, soft borders, restrained shadows, and clean spacing

### Reuse the shared composition points

Before adding a layout class, check whether the right place is:

- `lib/site-layout.ts`
- `components/layout-shells.tsx`
- `components/dashboard-page-header.tsx`
- a shared shell component
- an existing `components/ui/` primitive

### Avoid style drift

Do not:

- hardcode new max-width values in random pages without a system reason
- create multiple spacing philosophies across the app
- add “just for this screen” fixes if the real issue belongs in the shared shell

## AI Surface Rules

The AI area is product UI, not marketing UI.

That means:

- it should live inside the dashboard shell, not the public shell
- its primary input must remain visible on shorter laptop screens
- mobile should prioritize reachability over maintaining the desktop split layout

If AI surfaces need special layout behavior, prefer a shared rule in the AI component layer over page-only hacks.

## Extension Checklist

Before merging a UI/layout change, ask:

1. Is this a public shell change or a dashboard shell change?
2. Should this width or spacing rule live in `lib/site-layout.ts`?
3. Does header/footer alignment still match the page body?
4. Does this still work on small mobile, laptop-height screens, and large external monitors?
5. Am I preserving the shadcn/base-nova visual language?
6. Is there a focused test that protects this behavior from drifting later?

## Testing Expectations

Responsive behavior is part of the system, not optional polish.

For shared layout work, prefer:

- unit tests for shared shell/container usage
- smoke tests for major breakpoints and critical flows
- explicit assertions around widths, visibility, and mobile navigation behavior

If a layout rule is important enough to standardize, it is important enough to test.

## Good Changes vs. Drift

Good changes:

- extracting repeated width logic into `lib/site-layout.ts`
- aligning header/footer with the same rail as page content
- moving mobile-only supporting UI into sheets instead of cramming desktop layouts

Drift:

- adding a one-off `max-w-*` because a single page “looks weird”
- widening public pages to match the app shell without considering their role
- letting header, body, and footer each follow different alignment rules

## First Files to Read

If you are new to the repo, start here:

- [lib/site-layout.ts](/Users/hub/webdev/nextjs/saas-starter/lib/site-layout.ts)
- [components/site-header.tsx](/Users/hub/webdev/nextjs/saas-starter/components/site-header.tsx)
- [components/site-footer.tsx](/Users/hub/webdev/nextjs/saas-starter/components/site-footer.tsx)
- [components/dashboard-shell.tsx](/Users/hub/webdev/nextjs/saas-starter/components/dashboard-shell.tsx)
- [components/ai-chat-card.tsx](/Users/hub/webdev/nextjs/saas-starter/components/ai-chat-card.tsx)

Those files define most of the layout intent a new contributor needs to understand before extending the app.
