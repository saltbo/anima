# Vision Templates — Spec v1

## Overview

Provides four VISION.md templates: generic, web-app, cli-tool, library.
Each template follows the same structure (Identity, Core Principles,
Architecture, Quality, Roadmap) with content tailored to the project type.

## Template Structure

All templates include these sections:

1. **Identity** — project name, purpose, one-line description
2. **Core Principles** — 3-5 guiding principles for autonomous iteration
3. **Architecture** — high-level directory structure and rules
4. **Quality Assurance** — verification pipeline definition
5. **Roadmap** — starter version milestones

## Placeholders

Templates use `<YOUR_...>` markers where humans fill in specifics:

- `<YOUR_PROJECT_NAME>` — project name
- `<YOUR_ONE_LINE_DESCRIPTION>` — brief project description
- `<YOUR_PRINCIPLE_N>` — project-specific principles
- `<YOUR_ARCHITECTURE_DESCRIPTION>` — architecture overview

## Implementation

- `_TEMPLATES` dict maps names to template strings
- `get_template()` does case-insensitive lookup with None→"generic" fallback
- `list_templates()` returns sorted tuple of non-generic names
