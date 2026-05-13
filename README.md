# HACS Compatibility Auditor Card

[![HACS Card](https://img.shields.io/badge/HACS-Card-orange.svg)](https://hacs.xyz)
[![Build](https://github.com/RmG152/hacs-compatibility-auditor-card/actions/workflows/build.yml/badge.svg)](https://github.com/RmG152/hacs-compatibility-auditor-card/actions/workflows/build.yml)
[![Release](https://github.com/RmG152/hacs-compatibility-auditor-card/actions/workflows/release.yml/badge.svg)](https://github.com/RmG152/hacs-compatibility-auditor-card/actions/workflows/release.yml)

Custom Lovelace card for [HACS Compatibility Auditor](https://github.com/RmG152/hacs-compatibility-auditor). Displays HACS package compatibility status with filters, search, expandable details, quick actions and a visual editor.

## Installation

### Via HACS (recommended)

1. Add this repository as a **custom repository** in HACS:
   - HACS → Frontend → Menú (⋮) → Custom repositories
   - URL: `https://github.com/RmG152/hacs-compatibility-auditor-card`
   - Categoría: **Lovelace**
2. Search for "HACS Compatibility Auditor Card" in HACS → Frontend.
3. Click **Install**.
4. Add the card to your dashboard.

### Manual

1. Copy `www/community/hacs-compatibility-auditor-card/hacs-compatibility-auditor-card.js` to your HA `www/` directory.
2. Add as a Lovelace resource:

   ```yaml
   resources:
     - url: /local/community/hacs-compatibility-auditor-card/hacs-compatibility-auditor-card.js
       type: module
   ```

## Standard HA Implementation

This card follows the [Home Assistant custom card standard](https://developers.home-assistant.io/docs/frontend/custom-ui/custom-card/):

| Method | Support |
|--------|---------|
| `setConfig()` | ✅ |
| `getCardSize()` | ✅ Dynamic sizing based on content |
| `getStubConfig()` | ✅ Default configuration |
| `getConfigElement()` | ✅ Built-in visual editor |
| `getLayoutOptions()` | ✅ Responsive layout (4 columns) |
| `window.customCards` | ✅ Registered in card picker |

## Visual Editor

The card includes a built-in visual editor that opens automatically when adding/editing the card from the Lovelace UI. No YAML required.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| Title | Text | `"HACS Compatibility Auditor"` | Card title |
| Show summary | Switch | `true` | Show version and count summary |
| Show filters | Switch | `true` | Show status and type filters |
| Show issues | Switch | `true` | Show relevant issues in package detail |
| Compact | Switch | `false` | Compact mode (less padding) |

## YAML Configuration

```yaml
type: custom:hacs-compatibility-auditor-card
title: "HACS Compatibility Auditor"
show_summary: true    # Show version and count summary
show_filters: true    # Show status and type filters
show_issues: true     # Show relevant issues in package detail
compact: false        # Compact mode (less padding)
```

## Features

- **Summary**: Shows current and next HA version, package counts by status.
- **Filters**: Filter by status (compatible, warning, incompatible) and type (integration, card, theme).
- **Search**: Search packages by name or repository.
- **Expandable details**: Click a package to see full details: installed/latest version, compatibility flags, manifest requirement, last check, errors.
- **Relevant issues**: Lists GitHub issues related to compatibility, with labels and open/closed status.
- **Quick actions**:
  - Open repository on GitHub
  - Ignore package (dimmed with reduced opacity)
  - Mark as reviewed
  - Report issue (opens pre-filled template)
- **Force re-check**: Refresh button in the header calls the `check_now` service.

## Development

```bash
npm install
npm run dev          # Watch mode (webpack --mode development --watch)
npm run build        # Production build
npm run type-check   # TypeScript type checking
```

Build output goes to `www/community/hacs-compatibility-auditor-card/`:
- `hacs-compatibility-auditor-card.js` — bundled card
- `hacs-compatibility-auditor-card.js.gz` — gzip'd version
- `hacs-compatibility-auditor-card.js.LICENSE.txt` — license

## Requirements

- Home Assistant >= 2024.1.0
- [HACS Compatibility Auditor](https://github.com/RmG152/hacs-compatibility-auditor) integration installed

## License

MIT
