# Copilot Instructions for AI Coding Agents

## Project Overview

- This project is a Bun + Hono web server scaffold.
- Main entry points: `src/app.ts` (application setup), `src/server.ts` (server bootstrap).
- Modular structure: features are grouped under `src/modules/` by domain (e.g., `strings`).
- Shared utilities and services are under `src/shared/` and `src/utils/`.

## Key Patterns & Architecture

- **Routing:**
  - Each feature module (e.g., `strings`) has its own `*.route.ts` and `*.controller.ts`.
  - Register routes in `src/app.ts` by importing the module's route.
- **Services:**
  - Business logic is in `*.service.ts` files within each module.
  - Shared services (e.g., `db.service.ts`) are in `src/shared/services/`.
- **Schemas:**
  - Validation schemas (e.g., Zod) are in `*.schema.ts` files within each module.
- **Utilities:**
  - Common utilities (e.g., logging) are in `src/utils/`.

## Developer Workflows

- **Install dependencies:** `bun install`
- **Run dev server:** `bun run dev` (default port: 3000)
- **Add packages:** `bun add <package>`
- **No explicit test or build scripts** are present by default; add as needed.

## Conventions

- Use TypeScript throughout (`.ts` files).
- Prefer modular, domain-driven structure for new features.
- Register new routes in `src/app.ts`.
- Place shared logic in `src/shared/` or `src/utils/`.

## Integration & Dependencies

- Uses Bun as runtime and package manager.
- Uses Hono as the web framework.
- API reference integration via `@scalar/hono-api-reference` (see `bun add @scalar/hono-api-reference`).

## Examples

- To add a new feature:
  1. Create a new folder in `src/modules/`.
  2. Add `*.route.ts`, `*.controller.ts`, `*.service.ts`, and `*.schema.ts` as needed.
  3. Register the route in `src/app.ts`.

Refer to `src/modules/strings/` for a complete example of the module pattern.


## Naming Conventions
- Use PascalCase for component names, interfaces, and type aliases
- Use camelCase for variables, functions, and methods
- Prefix private class members with underscore (_)
- Use ALL_CAPS for constants

## Error Handling
- Use try/catch blocks for async operations and implement proper error handling.
- Always log errors with contextual information
