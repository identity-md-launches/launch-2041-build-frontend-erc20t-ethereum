# Delivery path budget

This assignment permits source, documentation and the required production export. The only ignore-file change in this revision includes the required `artifacts/` evidence directory despite the checkout's local exclusion.

| Path | Maximum bytes | Purpose |
| --- | ---: | --- |
| `.gitignore` | 1,024 | Preserve dependency/cache exclusions and include delivery evidence |
| `artifacts/` | 1,500,000 | Validation, screenshots, research, licenses and packaging audit |
| `dist/` | 1,500,000 | Complete production static export |
| Complete submission | 8,388,608 | Assignment ceiling, including unchanged source and lockfile |

No build configuration, dependency manifest, lockfile, `.git/`, `.github/`, `.env` or dependency directory is changed by this budget. The final inventory is in `package-check.json`.
