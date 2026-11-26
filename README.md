# سلتنا · Basketna

Plan a week of Egyptian meals and see where the whole basket is cheapest, using dated prices from Cairo shops.

Stack: MongoDB Atlas (Mongoose) · Express · React 18 + Redux Toolkit · Node 22.9+ · Vite

## Status

Parts 1–3: project configuration, Cairo reference data, price and basket calculations, feature services, and Redux state with RTK Query and client helpers.
HTTP routes and React pages are added in Parts 4–5.

## Setup

1. Copy `backend/.env.example` to `backend/.env` and put your MongoDB Atlas connection string in `MONGO_URI`.
2. Install the packages:

```bash
cd backend
npm install
```

```bash
cd client
npm install
```

## Load the Cairo data

After setting `MONGO_URI`, run `npm run seed` from `backend/`. A new database receives 12 shops, 44 staples, 53 meals and 654 observations. Running it again updates the catalog and skips existing observations.

## Tests

Run `npm test` in both `backend/` and `client/`. Backend integration tests also run when `TEST_MONGO_URI` is set to a dedicated database whose name ends in `_test`; that database is cleared by the tests. CI supplies an isolated MongoDB service and runs both suites.

Part 3 provides services and state modules. The API endpoints configured in RTK Query become available when Part 4 adds the HTTP routes.
