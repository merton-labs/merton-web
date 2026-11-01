# Changelog

All notable changes to merton-web are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Dividends page, modelled on Snowball Analytics' Analytics → Dividends:
  "Dividends received" by period (all time, year to date, 12 trailing
  months or a year), monthly or annual; an all-time breakdown by holding,
  class or currency; a table by holding; and "Dividend growth" (each month,
  one bar per year, for the last three years). Payments without an FX rate
  are listed. Needs the merton-api `dividends` endpoint.

### Changed

- The dashboard's income card and chart now show dividends and interest
  received after tax and fees, in the portfolio currency, from the API
  (they were before tax, per currency, and computed in the browser).
- In the transaction dialog, "Update cash balance" now behaves like Snowball
  Analytics across trades, dividends and expenses: it sits below Note, starts
  unticked, shows the current cash balance above the checkbox, and reveals the
  cash account selector when ticked.
- The Holdings table follows Snowball Analytics' columns: cost basis with
  average cost, current value with price, Div. received, Capital gain and
  its %, Realized P&L, and Total profit and its % with a breakdown on hover,
  all from the merton-api `returns` endpoint in each holding's currency. A
  "Show sold" switch lists sold positions. (The unrealized gain was computed
  in the browser before.)

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
