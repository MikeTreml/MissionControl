Add S3 retry-with-backoff to the ingest worker.

The worker dies on transient 503s during the AWS rate-limit hour. Add
exponential backoff (3 retries, 2s base, 5s max).
