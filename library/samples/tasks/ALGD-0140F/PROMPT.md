Migrate the options-chain loader to Polars.

Current loader is Pandas + per-row Python loops; cold-start is 4.2s
on the dev box. Target: < 1s. Keep the public API (`load_chain`)
unchanged so callers don't need updates.
