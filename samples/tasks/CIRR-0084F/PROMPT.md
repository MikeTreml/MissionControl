Provision a new IAM role for the staging ingest pipeline.

The current role has prod permissions which is too broad for staging.
Need a fresh role scoped to `s3:GetObject` on the staging bucket only.
