"""Docgen — generate documentation from the system's own specs.

Reads CONTRACT.md, SPEC.md, VISION.md, SOUL.md, and domain sources,
then renders structured Markdown documentation.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

# ---------------------------------------------------------------------------
# Data types (module-local, not domain types)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ModuleDoc:
    """Documentation for a single module."""

    name: str
    contract: str
    spec: str


@dataclass(frozen=True)
class DocBundle:
    """Bundle of all documentation content collected from the project."""

    vision: str
    soul: str
    modules: tuple[ModuleDoc, ...]
    domain_models_source: str
    domain_ports_source: str


# ---------------------------------------------------------------------------
# Collection
# ---------------------------------------------------------------------------


def _read_file(path: Path) -> str:
    """Read a file's text content, returning empty string if missing."""
    if path.is_file():
        return path.read_text(encoding="utf-8")
    return ""


def generate(project_root: str) -> DocBundle:
    """Collect documentation sources from the project.

    Scans modules/ for CONTRACT.md and SPEC.md, reads VISION.md,
    SOUL.md, and domain source files.

    Args:
        project_root: Absolute path to the project root.

    Returns:
        A DocBundle with all collected content.
    """
    root = Path(project_root)

    vision = _read_file(root / "VISION.md")
    soul = _read_file(root / "SOUL.md")

    # Scan modules
    modules_dir = root / "modules"
    module_docs: list[ModuleDoc] = []
    if modules_dir.is_dir():
        for entry in sorted(modules_dir.iterdir()):
            if not entry.is_dir():
                continue
            if entry.name.startswith(".") or entry.name.startswith("__"):
                continue
            contract = _read_file(entry / "CONTRACT.md")
            spec = _read_file(entry / "SPEC.md")
            module_docs.append(ModuleDoc(name=entry.name, contract=contract, spec=spec))

    domain_models = _read_file(root / "domain" / "models.py")
    domain_ports = _read_file(root / "domain" / "ports.py")

    return DocBundle(
        vision=vision,
        soul=soul,
        modules=tuple(module_docs),
        domain_models_source=domain_models,
        domain_ports_source=domain_ports,
    )


# ---------------------------------------------------------------------------
# Rendering
# ---------------------------------------------------------------------------


def _extract_heading(markdown: str) -> str:
    """Extract the first top-level heading from markdown text."""
    for line in markdown.splitlines():
        stripped = line.strip()
        if stripped.startswith("# "):
            return stripped[2:].strip()
    return "Anima"


def _extract_section(markdown: str, heading: str) -> str:
    """Extract a section by heading from markdown.

    Returns the content between the given heading and the next
    heading of equal or higher level, or end of text.

    Args:
        markdown: Full markdown text.
        heading: Section heading to find (without '#' prefix).

    Returns:
        Section content (excluding the heading line itself),
        or empty string if not found.
    """
    lines = markdown.splitlines()
    capturing = False
    captured: list[str] = []
    heading_level = 0

    for line in lines:
        stripped = line.strip()
        match = re.match(r"^(#{1,6})\s+(.+)$", stripped)
        if match:
            level = len(match.group(1))
            title = match.group(2).strip()
            if not capturing and title.lower() == heading.lower():
                capturing = True
                heading_level = level
                continue
            elif capturing and level <= heading_level:
                break
        if capturing:
            captured.append(line)

    return "\n".join(captured).strip()


def _extract_classes(source: str) -> list[tuple[str, str]]:
    """Extract class names and their docstrings from Python source.

    Args:
        source: Python source code.

    Returns:
        List of (class_name, docstring) tuples.
    """
    results: list[tuple[str, str]] = []
    lines = source.splitlines()
    i = 0
    while i < len(lines):
        match = re.match(r"^class\s+(\w+)", lines[i])
        if match:
            class_name = match.group(1)
            docstring = ""
            # Look for docstring in next few lines
            for j in range(i + 1, min(i + 5, len(lines))):
                stripped = lines[j].strip()
                if stripped.startswith('"""') or stripped.startswith("'''"):
                    quote = stripped[:3]
                    if stripped.count(quote) >= 2:
                        # Single-line docstring
                        docstring = stripped.strip(quote).strip('"').strip("'").strip()
                    else:
                        # Multi-line docstring
                        doc_lines = [stripped[3:]]
                        for k in range(j + 1, len(lines)):
                            if quote in lines[k]:
                                doc_lines.append(lines[k].strip().rstrip(quote).strip())
                                break
                            doc_lines.append(lines[k].strip())
                        docstring = " ".join(dl for dl in doc_lines if dl)
                    break
                elif stripped and not stripped.startswith("#") and not stripped.startswith("@"):
                    break
            results.append((class_name, docstring))
        i += 1
    return results


def render(bundle: DocBundle) -> dict[str, str]:
    """Render a DocBundle into documentation files.

    Args:
        bundle: Collected documentation content.

    Returns:
        Dict mapping relative file paths to markdown content.
    """
    files: dict[str, str] = {}
    files["docs/index.md"] = _render_index(bundle)
    files["docs/architecture.md"] = _render_architecture(bundle)
    files["docs/modules.md"] = _render_modules(bundle)
    return files


def _render_index(bundle: DocBundle) -> str:
    """Render the index/overview page."""
    title = _extract_heading(bundle.vision) if bundle.vision else "Anima"
    identity_section = _extract_section(bundle.vision, "Identity") if bundle.vision else ""

    lines: list[str] = [
        f"# {title}",
        "",
    ]

    if identity_section:
        lines.extend([identity_section, ""])

    # Module table
    if bundle.modules:
        lines.extend(
            [
                "## Modules",
                "",
                "| Module | Contract | Spec |",
                "|--------|----------|------|",
            ]
        )
        for mod in bundle.modules:
            contract_mark = "yes" if mod.contract else "-"
            spec_mark = "yes" if mod.spec else "-"
            lines.append(f"| {mod.name} | {contract_mark} | {spec_mark} |")
        lines.append("")

    lines.extend(
        [
            "## Documentation",
            "",
            "- [Architecture](architecture.md)",
            "- [Module Reference](modules.md)",
            "",
            "---",
            "",
            "*Generated from system specs by Anima docgen.*",
            "",
        ]
    )

    return "\n".join(lines)


def _render_architecture(bundle: DocBundle) -> str:
    """Render the architecture reference page."""
    lines: list[str] = ["# Architecture", ""]

    # Architecture section from VISION.md
    arch_section = _extract_section(bundle.vision, "Architecture") if bundle.vision else ""
    if arch_section:
        lines.extend([arch_section, ""])

    # Domain models
    if bundle.domain_models_source:
        classes = _extract_classes(bundle.domain_models_source)
        if classes:
            lines.extend(["## Domain Models", ""])
            for name, docstring in classes:
                if docstring:
                    lines.append(f"- **{name}** — {docstring}")
                else:
                    lines.append(f"- **{name}**")
            lines.append("")

    # Domain ports
    if bundle.domain_ports_source:
        classes = _extract_classes(bundle.domain_ports_source)
        if classes:
            lines.extend(["## Domain Ports", ""])
            for name, docstring in classes:
                if docstring:
                    lines.append(f"- **{name}** — {docstring}")
                else:
                    lines.append(f"- **{name}**")
            lines.append("")

    lines.extend(
        [
            "---",
            "",
            "*Generated from system specs by Anima docgen.*",
            "",
        ]
    )

    return "\n".join(lines)


def _render_modules(bundle: DocBundle) -> str:
    """Render the module reference page."""
    lines: list[str] = [
        "# Module Reference",
        "",
    ]

    if not bundle.modules:
        lines.extend(["No modules found.", ""])
        return "\n".join(lines)

    # Table of contents
    lines.append("## Contents")
    lines.append("")
    for mod in bundle.modules:
        anchor = mod.name.replace("_", "-")
        lines.append(f"- [{mod.name}](#{anchor})")
    lines.extend(["", "---", ""])

    # Module details
    for mod in bundle.modules:
        lines.append(f"## {mod.name}")
        lines.append("")

        if mod.contract:
            lines.extend(["### Contract", "", mod.contract, ""])

        if mod.spec:
            lines.extend(["### Spec", "", mod.spec, ""])

        if not mod.contract and not mod.spec:
            lines.append("*No documentation available.*")
            lines.append("")

        lines.extend(["---", ""])

    lines.extend(
        [
            "*Generated from system specs by Anima docgen.*",
            "",
        ]
    )

    return "\n".join(lines)
