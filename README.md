# Merton Web

SvelteKit frontend for [Merton Labs](https://github.com/merton-labs), a self-hosted,
multi-user investment portfolio tracker. The REST backend is
[merton-api](https://github.com/merton-labs/merton-api).

> **Status:** 0.1.0, the MVP (see [CHANGELOG.md](CHANGELOG.md)). Every screen reads and writes merton-api; CSV import
> and export are in the backlog (merton-api `docs/PROJECT_PLAN.md` §4).

## Stack

- SvelteKit (Svelte 5 runes, TypeScript), `adapter-node` on Node 24; `adapter-static`
  for Cloudflare Workers
- [Bun](https://bun.sh) as the package manager (`bun.lock`); scripts still run on Node
- Tailwind CSS v4
- [shadcn-svelte](https://shadcn-svelte.com) components (neutral theme) on bits-ui
- [LayerChart](https://layerchart.com) for charts, [Lucide](https://lucide.dev) icons

## Development

```sh
bun install
bun run dev         # http://localhost:5173
```

The dev server proxies `/api` to `http://127.0.0.1:18080`, so run merton-api
alongside it (18080 is its default port). If the API listens elsewhere, set
`MERTON_API_URL`, for example `MERTON_API_URL=http://127.0.0.1:8080`, in the
environment or in `.env`. The browser sends `Origin: http://localhost:5173`, so
the API must trust that origin, for example `APP_TRUSTED_ORIGINS=http://localhost:5173` for
`cargo run`, or `APP_TRUSTED_ORIGINS=http://localhost:18080,http://localhost:5173`
in `.env` when the Compose stack serves the API. In production the app and the
API are served from the same origin behind a reverse proxy (no CORS).

## Data flow

Stores in `src/lib/*.svelte.ts` hold what the API returned, in camelCase:
portfolios and instruments load after sign-in (`workspace.svelte.ts`), then
the selected portfolio's cash accounts and transactions. A write sends the
request and stores the API's answer; the API's 409 or 422 problem is shown as
a toast. Holdings, valuation, allocation, cash balances and dividends always
come from the server (`valuation.svelte.ts` and `dividends.ts`, refetched
through `live.svelte.ts` after any write). Everything is cleared on sign-out.

## Authentication

Pages render in the browser only (`ssr = false` in `src/routes/+layout.ts`):
the session is an HttpOnly cookie that only the API can read, and there is no
BFF. On load the layout asks `GET /api/v1/auth/me`; without a session every
page except `/login` and `/register` redirects to `/login`.

`src/lib/api.ts` is the API client. It sends the session-bound
`X-CSRF-Token` on every mutation (fetched from `/auth/csrf` and cached until
login or logout), turns Problem Details into `ApiError`, and reports a lost
session so the app returns to the sign-in page.

## Running with Docker Compose

`compose.yaml` starts the full stack behind a Caddy reverse proxy on
`http://localhost:18080` (`/` routes to `web:3000`, `/api/*` routes to `api:18080`
on the same origin):

```sh
cp .env.example .env
# Set APP_SECRET_KEY in .env, e.g. to the output of: openssl rand -base64 48
docker compose up --build
```

By default, `api` builds from `../merton-api` (override with
`MERTON_API_CONTEXT`). SQLite data is stored on the `merton-data` named volume.
To use PostgreSQL (for example Neon) instead, set `DATABASE_URL` in `.env` to
its direct connection string with `sslmode=require`; the API creates the tables
on startup. Data already in SQLite is not copied over.

- `APP_TRUSTED_ORIGINS` and `ORIGIN` default to `http://localhost:18080`.
- To publish on another host port, set `MERTON_HTTP_PORT` in `.env`, and set
  `ORIGIN` and `APP_TRUSTED_ORIGINS` to the matching URL. The default is 18080
  because Hyper-V/WSL on Windows often reserve 8080 (see
  `netsh int ipv4 show excludedportrange protocol=tcp`).
- `TRUSTED_PROXIES` is set to the proxy container's static IP (`172.28.0.10`) on
  the compose bridge network (`172.28.0.0/24`), because `merton-api` accepts
  exact proxy IPs only.
- `SESSION_COOKIE_SECURE` stays at its default (`true`), issuing the
  `__Host-merton_session` cookie (modern browsers and `curl` treat
  `http://localhost` as a secure context).

Podman works too: run `podman compose up --build` with `docker-compose`
installed as the compose provider. On Windows, the Podman 5 machine needs a
WSL with cgroup v2 (run `wsl --update` if `podman machine start` fails).

### Full-stack smoke test

With the Compose stack running on `http://localhost:18080`:

```sh
./scripts/smoke.sh
```

The script checks `GET /` (HTML), `GET /api/v1/health`, and
`GET /api/v1/openapi.json`, then runs an end-to-end authentication and CSRF
round-trip (`register` → `login` → `csrf` → `me` → `logout`) through the
reverse proxy.

## Deploying to Cloudflare Workers

The app can also run as a Cloudflare Worker, with merton-api hosted elsewhere
(for example Railway, Fly.io or a VPS) and the database on Neon:

- `bun run build:cloudflare` (`vite build --mode cloudflare`) uses
  `adapter-static` and writes a static SPA to `build/`, with `index.html` as
  the fallback for client-side routes. Plain `bun run build` still makes the
  Node server for the Docker image.
- `cloudflare/worker.js` takes the reverse proxy's place: `/api/*` is forwarded
  to `API_ORIGIN`, and every other path is a file from `build/`. The browser
  sees a single origin, so the session cookie and CSRF Origin check work as
  they do behind Caddy, without CORS.
- `wrangler.jsonc` configures the Worker; `keep_vars` keeps variables set in
  the dashboard across deploys.

To deploy:

1. Deploy merton-api and note its public URL. Set its
   `APP_TRUSTED_ORIGINS` to the Worker's URL (for example
   `https://merton-web.<account>.workers.dev`, or a custom domain).
2. Deploy the Worker, either with `bun run deploy:cloudflare` (runs
   `wrangler login` the first time) or by connecting this repository in
   Workers Builds with build command `bun run build:cloudflare` and deploy
   command `npx wrangler@4 deploy`.
3. In the Worker's Settings → Variables, set `API_ORIGIN` to merton-api's URL
   (for example `https://merton-api.up.railway.app`, with no trailing path).
   Until it is set, `/api/*` answers `503`.

Then run the smoke test against the Worker:
`BASE_URL=https://merton-web.<account>.workers.dev ./scripts/smoke.sh`.

Known limit: merton-api sees the Worker's and the host's proxy addresses, not
the browser's, and `TRUSTED_PROXIES` accepts exact IPs only. Its per-IP login
and registration limit (20 per 15 minutes) is therefore shared by all users.

## Checks and CI

```sh
bun run check   # svelte-check (types)
bun run lint    # prettier + eslint
bun run build
```

GitHub Actions (`.github/workflows/ci.yml`) runs on every push to `main` and on
pull requests:

- `check`: `bun install --frozen-lockfile`, `bun run check`, `bun run lint`,
  `bun run build`.
- `docker`: builds the production `Dockerfile`, starts the container, and
  verifies `GET /` returns `200`.

## Conventions

- Decimal values from the API stay strings. Format them with `src/lib/format.ts`
  (Intl.NumberFormat accepts decimal strings exactly). Previews and summaries
  may add or multiply them with `src/lib/decimal.ts` (exact, BigInt-based);
  never use JS numbers, and never divide or round in the browser. The API is
  authoritative.
- UI components in `src/lib/components/ui/` are generated by the shadcn-svelte
  CLI (`bunx shadcn-svelte@latest add <name>`). Re-add rather than hand-edit;
  they are excluded from ESLint.

## License

Apache-2.0
