# Changelog

All notable changes to merton-web are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-11-01

The first release: the MVP frontend. It needs
[merton-api 0.1.0](https://github.com/merton-labs/merton-api/releases/tag/v0.1.0).

### Added

- SvelteKit app (Svelte 5, Tailwind CSS v4, shadcn-svelte) that reads and
  writes merton-api for every screen. Amounts, holdings, valuation and
  cash balances always come from the API; the browser does no money math.
- Sign up, sign in and sign out, with CSRF handling.
- Portfolios: create, rename, archive, restore and delete, and a portfolio
  switcher.
- Instruments and cash accounts, including cash operations.
- Transactions in Trades, Incomes, Expenses and Cash tabs, with forms
  modelled on Snowball Analytics: total received and payout per share for
  dividends, and Fee, Tax, Tax return and Other expense with an optional
  instrument and an optional cash update that shows the current balance.
  Number fields accept `,` thousands separators.
- Holdings, valuation and allocation charts at any date, and manually
  entered prices and FX rates.
- Dockerfile, a Compose stack with Caddy that serves the app and the API
  on one origin, a smoke-test script, and CI that runs typecheck, lint,
  build and the Docker smoke test.

### Not included

- CSV import and export (after the MVP).

[0.1.0]: https://github.com/merton-labs/merton-web/releases/tag/v0.1.0
