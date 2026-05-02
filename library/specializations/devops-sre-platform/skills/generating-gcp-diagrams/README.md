# GCP DrawIO Diagram Generator

Generate professional DrawIO architecture diagrams for Google Cloud Platform.

## Features

- **35 GCP service icons** (94.3% validated against mxgraph.gcp2 library)
- **9 container types** (VPC-SC, Region, Zone, Project, and more)
- **Snake_case naming** (`cloud_run`, `cloud_sql`, `bigquery`)
- Supports analyzing existing diagrams
- Generates diagrams from text descriptions or images
- Validates against DrawIO's built-in gcp2 stencil library

## Quick Start

### Generate from Description

```
Create a GCP serverless architecture with:
- Cloud Run service
- BigQuery for analytics
- Cloud Storage for data
- Pub/Sub for messaging
- All inside a VPC-SC container
```

The skill will generate a valid `.drawio` file with proper GCP icons and layout.

### Analyze Existing Diagram

Provide a path to an existing `.drawio` file to extract:
- All GCP service shapes
- Container hierarchy
- Connection patterns
- Style information

### Convert from Image

Upload a GCP architecture diagram image and the skill will:
- Identify GCP service icons
- Match to validated shape names
- Recreate as editable DrawIO XML
- Provide confidence report

## Service Coverage

### Compute (5 services)
- Cloud Run (`cloud_run`)
- Compute Engine (`compute_engine`)
- GKE (`kubernetes_engine`)
- Cloud Functions (`cloud_functions`)
- App Engine (`app_engine`)

### Database (6 services)
- BigQuery (`bigquery`)
- Cloud SQL (`cloud_sql`)
- Firestore (`cloud_firestore`)
- Spanner (`cloud_spanner`)
- Bigtable (`cloud_bigtable`)
- Memorystore (`memorystore`)

### Storage (3 services)
- Cloud Storage (`cloud_storage`)
- Filestore (`filestore`)
- Persistent Disk (`persistent_disk`)

### Networking (5 services)
- VPC (`virtual_private_cloud`)
- Load Balancing (`cloud_load_balancing`)
- CDN (`cloud_cdn`)
- Cloud DNS (`cloud_dns`)
- Cloud Armor (`cloud_armor`)

### AI/ML (5 services)
- Vertex AI (`cloud_machine_learning`)
- AI Platform (`ai_platform`)
- Vision API (`vision_api`)
- Natural Language API (`natural_language_api`)
- Speech-to-Text (`speech_api`)

### Integration (5 services)
- Pub/Sub (`cloud_pubsub`)
- Cloud Tasks (`cloud_tasks`)
- Workflows (`cloud_workflows`)* - fallback icon
- Eventarc (`eventarc`)* - fallback icon
- Cloud Scheduler (`cloud_scheduler`)

### Operations (4 services)
- Cloud Logging (`logging`)
- Cloud Monitoring (`monitoring`)
- Cloud Trace (`trace`)
- Error Reporting (`error_reporting`)

### API Management (2 services)
- Apigee (`apigee_api_platform`)
- API Gateway (`api_gateway`)

**Full list:** See `assets\gcp-icons.json` for all services with shape names and keywords.

## Container Types

| Container | Description | Border Style |
|-----------|-------------|--------------|
| `gcp_project` | Main project boundary with GCP logo | Gray |
| `gcp_vpc_sc` | VPC Service Controls perimeter | Green (#2E7D32) |
| `gcp_region` | Regional grouping | Teal |
| `gcp_zone` | Zone grouping | Blue |
| `logical_group_dashed` | Dashed logical grouping | Gray dashed |
| `logical_group_solid` | Solid logical grouping | Gray solid |
| `subnet` | Subnet boundary | Blue |
| `firewall_rules` | Firewall rules container | Red |
| `instance_group` | Instance group | Orange |

## Known Limitations

### Fallback Icons (2/35 services)

Two newer GCP services don't have exact icon matches in DrawIO's mxgraph.gcp2 library:
- **Workflows** - Uses generic workflow icon
- **Eventarc** - Uses generic integration icon

These services are still fully functional but won't display the official GCP icons.

### Validation Status

- **33/35 services** (94.3%) have exact shape matches
- All 35 services validated against official DrawIO gcp2 stencil
- See `assets\ICON-COMPATIBILITY.md` for complete validation details

## Design Guidelines

### Icon Specifications
- **Size:** 50x50 pixels (standard)
- **Spacing:** 100px between icons
- **Font color:** `#424242` for service labels
- **Stencil library:** `mxgraph.gcp2`

### Best Practices
- Use VPC-SC container for security boundaries
- Group related services by region or zone
- Apply consistent connection styles (1pt standard, 2pt for emphasis)
- Use dashed containers for logical groupings
- Keep diagrams focused (max 15-20 icons per diagram)

**Complete guidelines:** See `references\DIAGRAM-BEST-PRACTICES.md`

## Validation & Export

### Validate Generated Diagrams
```bash
python scripts\validate-drawio.py output.drawio --verbose
```

### Check Icon Compatibility
```bash
python scripts\validate-gcp-icons.py
```

### Export to PNG/PDF
```bash
./scripts/export-diagram.sh output.drawio png
```

### Open in DrawIO Desktop
```bash
./scripts/open-diagram.sh output.drawio
```

Requires DrawIO Desktop: `brew install drawio`

## File Structure

```
generating-gcp-diagrams/
â”œâ”€â”€ SKILL.md                    # Main skill instructions
â”œâ”€â”€ README.md                   # This file
â”œâ”€â”€ assets/
â”‚   â”œâ”€â”€ assets\gcp-icons.json          # 35 GCP services
â”‚   â”œâ”€â”€ assets\containers.json         # 9 container types
â”‚   â”œâ”€â”€ assets\ICON-COMPATIBILITY.md   # Validation reference
â”‚   â””â”€â”€ templates/              # XML templates
â”œâ”€â”€ references/
â”‚   â”œâ”€â”€ references\DIAGRAM-BEST-PRACTICES.md
â”‚   â”œâ”€â”€ references\xml-examples.md
â”‚   â”œâ”€â”€ references\xml-parser-guide.md
â”‚   â”œâ”€â”€ references\coordinate-system.md
â”‚   â””â”€â”€ references\style-guide.md
â””â”€â”€ scripts/
    â”œâ”€â”€ scripts\validate-drawio.py      # Generic validation
    â”œâ”€â”€ scripts\validate-gcp-icons.py   # GCP-specific validation
    â”œâ”€â”€ scripts\fix-gcp-icons.py        # Auto-fix shape names
    â”œâ”€â”€ scripts\analyze-existing.py     # Extract shapes/connections
    â””â”€â”€ ...
```

## Examples

Example diagrams are available in the parent project's `assets/examples/` directory:
- `sample-gcp-simple.drawio` - Basic 3-tier architecture
- `sample-gcp-complex.drawio` - Multi-region deployment

## Support

- **Icon issues:** Check `assets\ICON-COMPATIBILITY.md`
- **Validation errors:** Run `python scripts\validate-drawio.py`
- **Layout help:** See `references\coordinate-system.md`
- **Style questions:** See `references\style-guide.md`

## Version

- **Current:** 2.0
- **Provider:** GCP
- **Stencil library:** mxgraph.gcp2
- **Services:** 35 (8 categories)
- **Validation:** 94.3% (33 exact, 2 fallback)


