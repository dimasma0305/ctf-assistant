# CTF Assistant Architecture - AI Agent Instructions

Welcome! If you are an AI agent working on this codebase, please follow these guidelines and structural rules.

## Frontend Architecture (`ui/`)
This is a Next.js (App Router) project providing the main web dashboard for the CTF Assistant bot.

- **Stack**: Next.js, React, Tailwind CSS, Shadcn UI, Radix Primitives, `next-themes`.
- **Data Fetching**: Use the custom hooks in `ui/hooks/useAPI.ts` (e.g., `useScoreboard`, `useCTFs`). These hooks wrap server actions from `ui/lib/actions.ts`. The API layer includes a global cache deduplication mechanism (`DataCache`) and built-in polling.
- **Styling**: The UI uses a premium aesthetic governed by `ui/app/globals.css`, heavily utilizing the `oklch` color space. Never use plain generic colors; always stick to the defined variants or use `getCategoryColor` in `ui/lib/utils.ts`.
- **Shared Helpers**: UI components should rely on `ui/lib/format-helpers.ts` for consistent formatting functions like `getStatusColor`, `formatDate`, `getRankIcon`, `getUserInitials`, and `getUserDisplayName`. Do not duplicate these inline.
- **Window Management**: The dashboard uses a robust, custom desktop-like window manager (`ui/components/ui/window.tsx`). This allows opening user profiles and CTF details in draggable, minimizable windows managed by a context provider.

## Backend Architecture (`api/` & `src/`)
- **Web API**: The Express application in `api/` provides endpoints for scoreboard, profiles, and CTF data, returning aggregated data from MongoDB. It uses optional pre-caching (`WARM_CACHE_ON_STARTUP`).
- **Discord Bot**: The core Discord bot functionality lives in the `src/` directory.

## Testing & Automation
- Testing is done via `bun:test`. 
- Running tests: `bun test` in the root directory.
- There are tests for API utilities, parser normalization, and frontend achievement handling. Ensure you run these to prevent regressions after refactoring.

## Code Quality Rules
1. **No Any Types**: Maintain strict TypeScript typing. Do not use `any`. Use defined interfaces in `lib/types.ts`.
2. **No Orphan Logs**: Remove debug `console.log` statements before finalizing changes. Use the UI `Toaster` component for user-facing errors.
3. **DRY Principle**: When building new views, check if UI elements or format helpers already exist in the shared libraries. 
4. **MANDATORY DOCKER UPDATE**: After making *ANY* changes to the frontend (`ui/`) or backend (`api/`, `src/`), you **MUST** rebuild and restart the Docker containers to apply the updates. The changes will not take effect otherwise. run `docker compose build <service> && docker compose up -d <service>`.

## Key Commands
- Start frontend locally (dev mode): `cd ui && bun run dev`
- Apply changes/Rebuild (MANDATORY AFTER EDITS): `docker compose build ui ctf-assistant && docker compose up -d`
