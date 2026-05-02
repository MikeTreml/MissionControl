# GCP Icon Compatibility Reference

**Last Updated:** 2026-02-15
**Provider:** GCP
**Stencil Library:** mxgraph.gcp2
**Validation Status:** 94.3% (33/35 exact matches)

## Validation Summary

This skill's GCP icons have been validated against DrawIO's official `mxgraph.gcp2` stencil library.

### Results
- **Total services:** 35
- **Exact matches:** 33 (94.3%)
- **Fallback icons:** 2 (5.7%)
- **Broken icons:** 0 (0%)

## Validation Methodology

1. Extracted all shape names from DrawIO's gcp2.xml stencil
2. Cross-referenced with `gcp-icons.json`
3. Tested each icon in DrawIO Desktop to verify rendering
4. Documented any services requiring fallback icons

## Services with Fallback Icons

Two newer GCP services don't have dedicated icons in the mxgraph.gcp2 library:

| Service | Shape Name | Status | Fallback Used |
|---------|------------|--------|---------------|
| Workflows | `cloud_workflows` | Not in gcp2 | Generic workflow icon |
| Eventarc | `eventarc` | Not in gcp2 | Generic integration icon |

**Why?** These are newer GCP services (2021+) that weren't included in DrawIO's gcp2 stencil library. The fallback icons are generic but functional.

## Validated Services (33/35)

All of the following services render correctly with exact icon matches:

### Compute (5)
- Cloud Run â†’ `cloud_run`
- Compute Engine â†’ `compute_engine`
- Kubernetes Engine (GKE) â†’ `kubernetes_engine`
- Cloud Functions â†’ `cloud_functions`
- App Engine â†’ `app_engine`

### Database (6)
- BigQuery â†’ `bigquery`
- Cloud SQL â†’ `cloud_sql`
- Firestore â†’ `cloud_firestore`
- Spanner â†’ `cloud_spanner`
- Bigtable â†’ `cloud_bigtable`
- Memorystore â†’ `memorystore`

### Storage (3)
- Cloud Storage â†’ `cloud_storage`
- Filestore â†’ `filestore`
- Persistent Disk â†’ `persistent_disk`

### Networking (5)
- VPC â†’ `virtual_private_cloud`
- Load Balancing â†’ `cloud_load_balancing`
- Cloud CDN â†’ `cloud_cdn`
- Cloud DNS â†’ `cloud_dns`
- Cloud Armor â†’ `cloud_armor`

### AI/ML (5)
- Vertex AI â†’ `cloud_machine_learning`
- AI Platform â†’ `ai_platform`
- Vision API â†’ `vision_api`
- Natural Language API â†’ `natural_language_api`
- Speech-to-Text â†’ `speech_api`

### Integration (3)
- Pub/Sub â†’ `cloud_pubsub`
- Cloud Tasks â†’ `cloud_tasks`
- Cloud Scheduler â†’ `cloud_scheduler`

### Operations (4)
- Cloud Logging â†’ `logging`
- Cloud Monitoring â†’ `monitoring`
- Cloud Trace â†’ `trace`
- Error Reporting â†’ `error_reporting`

### API Management (2)
- Apigee â†’ `apigee_api_platform`
- API Gateway â†’ `api_gateway`

## Naming Convention

GCP uses **snake_case** for shape names:
- âœ… `cloud_run`
- âœ… `cloud_sql`
- âœ… `bigquery`
- âŒ NOT `cloud-run` (hyphens)
- âŒ NOT `CloudRun` (CamelCase)

## Validation Scripts

### Validate Icon Database
```bash
python scripts/validate-gcp-icons.py
```

Expected output:
```
Validating GCP icons against mxgraph.gcp2 library...
âœ“ 33/35 icons validated (94.3%)
âš  2 services use fallback icons
âœ— 0 broken icons
```

### Validate Generated Diagram
```bash
python scripts/validate-drawio.py output.drawio
```

Checks:
- XML structure validity
- All shape references exist
- Connection IDs are valid
- Geometry is properly formatted

## Troubleshooting

### Icon Shows as Broken/Missing
1. Check shape name spelling: `mxgraph.gcp2.cloud_run` (underscores!)
2. Verify `vertex="1"` is present
3. Check geometry has width/height (50x50 for GCP)
4. Look up correct name in `gcp-icons.json`

### Wrong Icon Displayed
- Check service_id in `gcp-icons.json`
- Verify you're using the correct shape_name
- Some services have similar icons (e.g., compute_engine for both VM and GKE)

### Icon Too Small/Large
- GCP standard: 50x50 pixels
- Check `<mxGeometry>` width and height attributes
- Containers can be larger (e.g., VPC-SC: 700x400)

## Future Updates

As DrawIO updates its gcp2 stencil library, we'll validate new icons:
- Monitor DrawIO releases for gcp2.xml updates
- Re-run validation scripts
- Update fallback icons to exact matches when available
- Target: 100% exact matches

## References

- DrawIO gcp2 stencil: Built-in to DrawIO Desktop
- Validation source: Manual testing in DrawIO Desktop v22+
- Icon database: `gcp-icons.json`
- Validation script: `scripts/validate-gcp-icons.py`

