"""Tests for the docgen module."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

if TYPE_CHECKING:
    from pathlib import Path

from modules.docgen.core import DocBundle, generate, render


@pytest.fixture()
def project_dir(tmp_path: Path) -> Path:
    """Create a minimal project structure for testing."""
    # VISION.md
    (tmp_path / "VISION.md").write_text(
        "# VISION: TestProject\n\n"
        "## Identity\n\n"
        "A test project for docgen.\n\n"
        "## Architecture\n\n"
        "Clean architecture with modules.\n\n"
        "## Quality\n\n"
        "All tests must pass.\n",
        encoding="utf-8",
    )

    # SOUL.md
    (tmp_path / "SOUL.md").write_text(
        "# Soul\n\n## Principles\n\n1. Test everything.\n",
        encoding="utf-8",
    )

    # domain/
    domain_dir = tmp_path / "domain"
    domain_dir.mkdir()
    (domain_dir / "models.py").write_text(
        '"""Core models."""\n\n'
        "from dataclasses import dataclass\n\n\n"
        "@dataclass(frozen=True)\n"
        "class Foo:\n"
        '    """A foo thing."""\n\n'
        "    name: str\n",
        encoding="utf-8",
    )
    (domain_dir / "ports.py").write_text(
        '"""Domain ports."""\n\n\n'
        "class BarPort:\n"
        '    """Port for bar operations."""\n\n'
        "    def do_bar(self) -> None: ...\n",
        encoding="utf-8",
    )

    # modules/
    modules_dir = tmp_path / "modules"
    modules_dir.mkdir()

    # Module with both CONTRACT and SPEC
    alpha = modules_dir / "alpha"
    alpha.mkdir()
    (alpha / "CONTRACT.md").write_text("# Alpha Contract\n\nDoes alpha things.\n")
    (alpha / "SPEC.md").write_text("# Alpha Spec\n\nAlpha implementation.\n")
    (alpha / "core.py").write_text("")

    # Module with only CONTRACT
    beta = modules_dir / "beta"
    beta.mkdir()
    (beta / "CONTRACT.md").write_text("# Beta Contract\n\nDoes beta things.\n")

    # Hidden and __pycache__ dirs should be skipped
    (modules_dir / ".hidden").mkdir()
    (modules_dir / "__pycache__").mkdir()

    return tmp_path


class TestGenerate:
    """Tests for the generate() function."""

    def test_reads_vision(self, project_dir: Path) -> None:
        """Generate reads VISION.md content."""
        bundle = generate(str(project_dir))
        assert "TestProject" in bundle.vision

    def test_reads_soul(self, project_dir: Path) -> None:
        """Generate reads SOUL.md content."""
        bundle = generate(str(project_dir))
        assert "Principles" in bundle.soul

    def test_reads_domain_models(self, project_dir: Path) -> None:
        """Generate reads domain/models.py."""
        bundle = generate(str(project_dir))
        assert "class Foo" in bundle.domain_models_source

    def test_reads_domain_ports(self, project_dir: Path) -> None:
        """Generate reads domain/ports.py."""
        bundle = generate(str(project_dir))
        assert "class BarPort" in bundle.domain_ports_source

    def test_discovers_modules(self, project_dir: Path) -> None:
        """Generate discovers module directories."""
        bundle = generate(str(project_dir))
        names = [m.name for m in bundle.modules]
        assert "alpha" in names
        assert "beta" in names

    def test_modules_sorted(self, project_dir: Path) -> None:
        """Modules are sorted alphabetically."""
        bundle = generate(str(project_dir))
        names = [m.name for m in bundle.modules]
        assert names == sorted(names)

    def test_reads_contract(self, project_dir: Path) -> None:
        """Generate reads CONTRACT.md for each module."""
        bundle = generate(str(project_dir))
        alpha = next(m for m in bundle.modules if m.name == "alpha")
        assert "Alpha Contract" in alpha.contract

    def test_reads_spec(self, project_dir: Path) -> None:
        """Generate reads SPEC.md for each module."""
        bundle = generate(str(project_dir))
        alpha = next(m for m in bundle.modules if m.name == "alpha")
        assert "Alpha Spec" in alpha.spec

    def test_missing_spec_empty(self, project_dir: Path) -> None:
        """Missing SPEC.md results in empty string."""
        bundle = generate(str(project_dir))
        beta = next(m for m in bundle.modules if m.name == "beta")
        assert beta.spec == ""

    def test_skips_hidden_dirs(self, project_dir: Path) -> None:
        """Hidden directories are not included."""
        bundle = generate(str(project_dir))
        names = [m.name for m in bundle.modules]
        assert ".hidden" not in names

    def test_skips_dunder_dirs(self, project_dir: Path) -> None:
        """__pycache__ and similar directories are not included."""
        bundle = generate(str(project_dir))
        names = [m.name for m in bundle.modules]
        assert "__pycache__" not in names

    def test_missing_vision(self, tmp_path: Path) -> None:
        """Missing VISION.md returns empty string."""
        bundle = generate(str(tmp_path))
        assert bundle.vision == ""

    def test_empty_project(self, tmp_path: Path) -> None:
        """Empty project returns empty DocBundle."""
        bundle = generate(str(tmp_path))
        assert bundle.vision == ""
        assert bundle.soul == ""
        assert bundle.modules == ()
        assert bundle.domain_models_source == ""
        assert bundle.domain_ports_source == ""


class TestRender:
    """Tests for the render() function."""

    def test_produces_three_files(self, project_dir: Path) -> None:
        """Render produces index, architecture, and modules files."""
        bundle = generate(str(project_dir))
        files = render(bundle)
        assert "docs/index.md" in files
        assert "docs/architecture.md" in files
        assert "docs/modules.md" in files

    def test_index_has_title(self, project_dir: Path) -> None:
        """Index page includes the project title."""
        bundle = generate(str(project_dir))
        files = render(bundle)
        assert "VISION: TestProject" in files["docs/index.md"]

    def test_index_has_module_table(self, project_dir: Path) -> None:
        """Index page includes a module table."""
        bundle = generate(str(project_dir))
        files = render(bundle)
        assert "alpha" in files["docs/index.md"]
        assert "beta" in files["docs/index.md"]

    def test_architecture_has_section(self, project_dir: Path) -> None:
        """Architecture page includes VISION.md architecture section."""
        bundle = generate(str(project_dir))
        files = render(bundle)
        assert "Clean architecture" in files["docs/architecture.md"]

    def test_architecture_has_models(self, project_dir: Path) -> None:
        """Architecture page lists domain models."""
        bundle = generate(str(project_dir))
        files = render(bundle)
        assert "Foo" in files["docs/architecture.md"]

    def test_architecture_has_ports(self, project_dir: Path) -> None:
        """Architecture page lists domain ports."""
        bundle = generate(str(project_dir))
        files = render(bundle)
        assert "BarPort" in files["docs/architecture.md"]

    def test_modules_has_contracts(self, project_dir: Path) -> None:
        """Modules page includes contract content."""
        bundle = generate(str(project_dir))
        files = render(bundle)
        assert "Alpha Contract" in files["docs/modules.md"]
        assert "Beta Contract" in files["docs/modules.md"]

    def test_modules_has_specs(self, project_dir: Path) -> None:
        """Modules page includes spec content."""
        bundle = generate(str(project_dir))
        files = render(bundle)
        assert "Alpha Spec" in files["docs/modules.md"]

    def test_modules_has_toc(self, project_dir: Path) -> None:
        """Modules page has table of contents."""
        bundle = generate(str(project_dir))
        files = render(bundle)
        content = files["docs/modules.md"]
        assert "## Contents" in content

    def test_empty_bundle_renders(self) -> None:
        """Empty DocBundle renders without errors."""
        bundle = DocBundle(
            vision="",
            soul="",
            modules=(),
            domain_models_source="",
            domain_ports_source="",
        )
        files = render(bundle)
        assert len(files) == 3

    def test_generated_marker(self, project_dir: Path) -> None:
        """All generated files include a generation marker."""
        bundle = generate(str(project_dir))
        files = render(bundle)
        for content in files.values():
            assert "Generated from system specs by Anima docgen" in content

    def test_deterministic(self, project_dir: Path) -> None:
        """Two generate+render passes produce identical output."""
        bundle1 = generate(str(project_dir))
        bundle2 = generate(str(project_dir))
        files1 = render(bundle1)
        files2 = render(bundle2)
        assert files1 == files2
