# Firefox Performance Portal

The frontend for [performance.mozilla.org](https://performance.mozilla.org/).
Built with SvelteKit and Chart.js as a static site; data is fetched in the browser
from Treeherder, Taskcluster, Bugzilla, and Redash.

## Development

Use Node.js 22 or later.

```sh
npm ci
npm run dev          # http://localhost:5173
```

```sh
npm run format       # format source with Prettier
npm run lint         # check correctness with oxlint
npm run check        # check types and Svelte components
npm test             # unit and component tests
npm run test:e2e     # browser tests; builds and serves the site automatically
```

Install Chromium before the first browser test run: `npx playwright install chromium`.
Browser tests stub upstream services in `e2e/fixtures.ts`.

## Code layout

- `src/routes/`: dashboard pages and the shared layout.
- `src/lib/<dashboard>/`: dashboard configuration, data loading, and calculations.
- `src/lib/components/`: shared charts, tables, and controls.
- `src/lib/api/`: API clients and data parsers.
- `queries/`: SQL for the Redash data sources.

View state lives in URL query parameters. Controls use the dashboard's state
helpers to change selected fields while preserving the rest. `src/hooks.ts`
maps `.html` URLs onto routes, and `src/lib/param-aliases.ts` normalizes query
parameter aliases.

Use `resource()` from `src/lib/resource.svelte.ts` for reactive async data.
Read individual `$derived` fields synchronously in its callback, before any
`await`, so unrelated URL changes do not trigger a fetch. Pass its abort signal
to data loaders; results from cancelled runs are discarded. Shared cached JSON
requests finish independently of any one caller's cancellation.

Tests live next to their subjects; browser tests live in `e2e/`.

## Deployment

`npm run build` produces static files in `build/`. Use `npm run preview` to
inspect the build locally. Routes support both `/speedometer` and
`/speedometer.html` spellings; `/index.html` opens the home page.

The Pages workflow checks formatting, lint, types, unit tests, and the build on
pull requests to `main` and pushes to `main`. Lint warnings fail the check; browser
tests run locally. Successful builds on `main` deploy `build/`.
In the repository's Pages settings, select
**GitHub Actions** as the publishing source.

Leave `BASE_PATH` unset for deployment: the same build serves
`performance.mozilla.org/` and `mozilla.github.io/performance/` using relative
asset paths.
