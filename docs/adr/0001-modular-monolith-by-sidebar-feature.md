# ADR-0001: Use Sidebar Feature Modules

## Status
Accepted

## Context
The product is a single HR recruiting application with a React/Vite frontend and
a Flask backend. New work currently tends to touch central files at the same
time: root routes, sidebar navigation, shared frontend types, shared API client,
backend route modules, and shared database models.

This makes each sidebar feature feel risky to change. For example, improving the
resume library can require edits in app routing, navigation, API types, page
code, and backend candidate routes. The desired workflow is that changing one
sidebar feature should usually stay inside that feature's boundary.

## Decision
Keep the system as a modular monolith, not microservices or micro-frontends.
Organize product code by sidebar feature, with each feature owning its own
navigation item, routes, API wrapper, types, pages, and local components.

Frontend feature modules should follow this shape:

```text
frontend/src/features/<feature>/
  index.ts
  nav.ts
  routes.tsx
  api.ts
  types.ts
  pages/
  components/
```

The root app should only aggregate feature exports through a registry. Shared
frontend code is reserved for cross-feature infrastructure such as auth, HTTP,
UI primitives, formatting, and layout.

Backend code should evolve toward domain modules:

```text
backend/app/domains/<domain>/
  routes.py
  service.py
  repository.py
  schemas.py
  rules.py
```

Database models can stay centralized at first to avoid a risky migration. Shared
business rules, especially pipeline stage rules, should be moved behind a single
domain service before being reused by BI, AI assistant tools, candidate journey,
and workflow APIs.

## Consequences

### Positive
- Sidebar features become easier to change independently.
- The app root becomes a composition layer instead of a feature knowledge hub.
- Tests can enforce that new features register themselves through the feature
  registry.
- The project avoids the operational complexity of microservices while still
  gaining clearer boundaries.

### Negative
- The migration will be incremental, so old and new structures will coexist for
  a while.
- Some shared contracts will need temporary re-export files to avoid a large
  one-shot rewrite.
- Strict module boundaries require discipline in reviews and future work.

### Neutral
- Deployment stays unchanged: one frontend app and one Flask backend.
- Database schema ownership can be improved later without blocking the first
  frontend boundary cleanup.

## Alternatives Considered

**Keep current layered structure**
- Rejected because central route, navigation, API, and type files keep growing
  and cause unrelated features to be edited together.

**Micro-frontends**
- Rejected because the product and team size do not justify the build,
  deployment, routing, and shared-session complexity.

**Microservices**
- Rejected because the backend domains are still small and share one database.
  Splitting services now would add operational cost without solving the current
  frontend change-boundary pain.

## References
- `README.md`
- `docs/README.md`
- `docs/SDD-智聘招聘系统-v1.0.md`
