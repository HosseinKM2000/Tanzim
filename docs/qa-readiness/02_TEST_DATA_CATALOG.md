# Gate 7-PREP — Test data catalog

All generated records use the stable namespace `qa-gate7`. Names, phones and addresses are synthetic. Catalog descriptions explicitly state that they are not licensed for publication.

| Profile | Stores | Users | Products | Counterparties | Posted invoices | Barcodes | Purpose |
|---|---:|---:|---:|---:|---:|---:|---|
| Smoke | 1 | 1 | 8 | 2 | 2 | 8 | fast login, inventory, invoice and barcode checks |
| Comprehensive | 3 | 4 | 72 | 6 | 6 | Free/Pro/VIP, owner/operator, dashboard and cross-tenant checks |
| Stress 1k | 1 | 1 | 1,000 | 2 | 2 | explicit opt-in list/load test |
| Stress 5k | 1 | 1 | 5,000 | 2 | 2 | pilot family ceiling and high-volume metadata |
| Stress 10k | 1 | 1 | 10,000 | 2 | 2 | service-level capacity test only when plan permits |

Stress is never seeded without both `--profile stress` and an allowed `--stress-size`. The 5,000-item/3 MiB offline-family pilot limits are unchanged.

Each store has three store-scoped categories and three labels. Product fixtures include zero stock, low stock, hidden records, short and long Persian labels, package metadata, sale/purchase price differences, manual Code 128 barcodes and records without image references. Purchase and sale invoices use authoritative store/user/membership references and line totals derived from quantity and unit price.

Not embedded in the core seed:

- malformed outbox rows, corrupt images and interrupted downloads: controlled tests/network fault injection only;
- reference publication media: Gate 6 isolated release fixtures, never represented as licensed content;
- real phones, addresses, tokens or production credentials: prohibited;
- payment states, proforma and cart data: corresponding domains are not implemented.
