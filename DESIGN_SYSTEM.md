# Design System

How layout, shared UI, and responsive behavior are organized in this codebase.

This document covers the current UI structure. `ARCHITECTURE.md` covers application structure and data flow. `CONVENTIONS.md` covers implementation patterns contributors are expected to follow. This file is narrower than both. It describes the layout tokens, shared shell components, and page primitives that currently shape the UI.

## UI Stack

- **Styling**: Tailwind CSS 4
- **Primitives**: shadcn/ui components in `components/ui/`
- **Layout tokens**: `lib/site-layout.ts`
- **Shared shell components**: `components/layout-shells.tsx`
- **Shared dashboard page primitives**: `components/dashboard-page-header.tsx`, `components/dashboard-page-section.tsx`, `components/dashboard-detail-field.tsx`

## Layout Tokens

The shared layout tokens live in `lib/site-layout.ts`.

| Token                            | Current value                                                               | Purpose                                                                        |
| -------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `publicContainerClassName`       | `mx-auto w-full max-w-[1440px] px-4 sm:px-6 lg:px-10`                       | Outer shell for public pages                                                   |
| `siteContainerClassName`         | `mx-auto w-full max-w-[1680px] px-4 sm:px-6 lg:px-10`                       | Outer shell for signed-in dashboard pages                                      |
| `dashboardShellColumnsClassName` | `lg:grid-cols-[240px_minmax(0,1fr)] ... xl:grid-cols-[260px_minmax(0,1fr)]` | Sidebar/content column layout for the dashboard shell                          |
| `dashboardContentRailClassName`  | `w-full max-w-[56rem] xl:max-w-[64rem] 2xl:max-w-[72rem]`                   | Inner content rail for dashboard page bodies, header actions, and footer links |

The current layout uses two outer shells rather than one:

- Public pages use the `1440px` shell.
- Signed-in dashboard pages use the `1680px` shell.

The dashboard shell is wider, but the page body still sits on `dashboardContentRailClassName`. The content rail is narrower than the shell and is what keeps dashboard pages, header controls, and footer links aligned.

## Shell Components

The shared shell components live in `components/layout-shells.tsx`.

| Component               | Purpose                                                         |
| ----------------------- | --------------------------------------------------------------- |
| `PublicShell`           | Wraps public pages in `publicContainerClassName`                |
| `PublicCenteredContent` | Centers and constrains narrow public content such as auth forms |
| `DashboardShellFrame`   | Wraps dashboard pages in `siteContainerClassName`               |
| `DashboardShellColumns` | Applies the dashboard sidebar/content column layout             |
| `DashboardShellSection` | Applies the dashboard content rail                              |

These components are thin wrappers over the shared tokens. Their main job is to make shell selection explicit in page and layout code.

## Header and Footer

The shared header and footer select their shell based on page type.

### Header

`components/site-header.tsx` uses:

- `PublicShell` for public pages
- `DashboardShellFrame` for dashboard pages
- `DashboardShellSection` to align dashboard right-side controls with the main content rail

On dashboard pages, the header also reuses `dashboardShellColumnsClassName` so the brand area and the right-side user controls sit on the same column structure as the page body.

### Footer

`components/site-footer.tsx` follows the same split:

- `PublicShell` for public pages
- `DashboardShellFrame` for dashboard pages
- `DashboardShellSection` for dashboard legal-link alignment

This is the reason header controls, footer links, and dashboard content now share the same inner rail.

## Dashboard Shell

The signed-in dashboard shell lives in `components/dashboard-shell.tsx`.

The current structure is:

1. `SiteHeader`
2. `DashboardShellFrame`
3. `DashboardShellColumns`
4. `DashboardSidebar`
5. `DashboardShellSection`
6. `SiteFooter dashboard`

That composition gives the dashboard three separate layers:

- an outer shell for the overall page width
- a two-column shell for sidebar plus content
- an inner content rail for the page body

## Page Primitives

The dashboard page primitives are split across three components.

### `components/dashboard-page-header.tsx`

This file exports:

- `DashboardPageHeader`
- `DashboardPageStack`

`DashboardPageHeader` is the standard dashboard intro block: eyebrow, title, description, and optional actions. `DashboardPageStack` sets the vertical spacing between the page header and the sections below it.

### `components/dashboard-page-section.tsx`

`DashboardPageSection` is the standard section card for dashboard pages. It handles:

- section container styling
- icon tile styling
- section title and description layout
- optional bordered headers with right-side content
- standard content spacing

### `components/dashboard-detail-field.tsx`

`DashboardDetailField` is the standard label/value primitive for dashboard metadata. It also exports the shared class names used for:

- labels
- values
- monospaced values
- detail grids
- stacked text blocks

This component is where long values such as IDs and email addresses are wrapped consistently.

## Public Pages

Public pages use the narrower outer shell. The current public surface includes:

- landing page
- pricing sections
- auth pages
- onboarding
- legal pages
- public header and footer

Some public pages add a second inner constraint. Auth pages use `PublicCenteredContent` to keep forms at `max-w-md`. Legal pages keep their article text on a narrower content width inside the broader public shell.

## Dashboard Pages

Dashboard pages use the wider outer shell and the narrower inner content rail. The current dashboard surface includes:

- persistent left navigation
- page headers
- section cards
- billing, settings, support, team, and overview pages
- AI chat and thread navigation

The left navigation occupies the fixed sidebar column defined by `dashboardShellColumnsClassName`. The page body occupies the second column and is then constrained again by `dashboardContentRailClassName`.

## Responsive Behavior

The responsive behavior is split between shared shell structure and component-level changes.

### Navigation

Dashboard navigation has two presentations:

- desktop: sticky left sidebar
- small screens: `Sheet`-based navigation opened from the header

The navigation items are shared between both presentations.

### Header controls

The header keeps the same shell split on all screen sizes. On dashboard pages, the user dropdown stays on the dashboard rail rather than following the full outer shell width.

### AI chat

`components/ai-chat-card.tsx` uses a different responsive structure from the rest of the dashboard because it combines conversation history, recents, message composition, and file/image attachments in one surface.

The current AI behavior includes:

- a two-pane layout on larger screens
- recents moved into a `Sheet` on smaller screens
- a composer that remains visible on shorter laptop-height viewports
- safe-area-aware spacing around the input area

## Testing

The layout system is covered by focused component tests and smoke tests.

Current coverage includes:

- `components/layout-shells.test.tsx`
- `components/dashboard-shell.test.tsx`
- `components/site-header.test.tsx`
- `components/site-footer.test.tsx`
- `e2e/smoke-public-layout.spec.ts`
- `e2e/smoke-auth-layout.spec.ts`
- `e2e/smoke-sidebar-nav.spec.ts`
- `e2e/smoke-ai-chat.spec.ts`

These tests cover shell selection, shared layout primitives, public/auth shell behavior, dashboard navigation, and AI chat responsiveness.

## File Map

The files below define most of the current UI structure:

- `lib/site-layout.ts`
- `components/layout-shells.tsx`
- `components/site-header.tsx`
- `components/site-footer.tsx`
- `components/dashboard-shell.tsx`
- `components/dashboard-page-header.tsx`
- `components/dashboard-page-section.tsx`
- `components/dashboard-detail-field.tsx`
- `components/ai-chat-card.tsx`

Those files hold the shared width tokens, shell composition, page-level primitives, and responsive behavior that the rest of the UI builds on.
