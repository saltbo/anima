"""Tests for the vision_templates module."""

from __future__ import annotations

import pytest

from modules.vision_templates.core import get_template, list_templates

# ---------------------------------------------------------------------------
# list_templates
# ---------------------------------------------------------------------------


class TestListTemplates:
    """Tests for list_templates()."""

    def test_returns_tuple(self) -> None:
        result = list_templates()
        assert isinstance(result, tuple)

    def test_excludes_generic(self) -> None:
        result = list_templates()
        assert "generic" not in result

    def test_contains_expected_names(self) -> None:
        result = list_templates()
        assert "web-app" in result
        assert "cli-tool" in result
        assert "library" in result

    def test_sorted(self) -> None:
        result = list_templates()
        assert result == tuple(sorted(result))


# ---------------------------------------------------------------------------
# get_template — basic retrieval
# ---------------------------------------------------------------------------


class TestGetTemplate:
    """Tests for get_template()."""

    def test_none_returns_generic(self) -> None:
        result = get_template(None)
        assert "<YOUR_PROJECT_NAME>" in result

    def test_generic_explicit(self) -> None:
        result = get_template("generic")
        assert result == get_template(None)

    def test_web_app(self) -> None:
        result = get_template("web-app")
        assert "web application" in result.lower()

    def test_cli_tool(self) -> None:
        result = get_template("cli-tool")
        assert "command-line" in result.lower()

    def test_library(self) -> None:
        result = get_template("library")
        assert "library" in result.lower()

    def test_case_insensitive(self) -> None:
        assert get_template("Web-App") == get_template("web-app")
        assert get_template("CLI-TOOL") == get_template("cli-tool")
        assert get_template("LIBRARY") == get_template("library")
        assert get_template("GENERIC") == get_template("generic")

    def test_unknown_raises_value_error(self) -> None:
        with pytest.raises(ValueError, match="Unknown template"):
            get_template("nonexistent")

    def test_unknown_lists_available(self) -> None:
        with pytest.raises(ValueError, match="cli-tool"):
            get_template("bad-name")


# ---------------------------------------------------------------------------
# Template content validation
# ---------------------------------------------------------------------------


class TestTemplateContent:
    """Validate structural properties of all templates."""

    @pytest.fixture(params=["generic", "web-app", "cli-tool", "library"])
    def template(self, request: pytest.FixtureRequest) -> str:
        name: str = request.param
        return get_template(name)

    def test_starts_with_vision_header(self, template: str) -> None:
        assert template.startswith("# VISION:")

    def test_has_identity_section(self, template: str) -> None:
        assert "## Identity" in template

    def test_has_principles_section(self, template: str) -> None:
        assert "## Core Principles" in template

    def test_has_architecture_section(self, template: str) -> None:
        assert "## Architecture" in template

    def test_has_quality_section(self, template: str) -> None:
        assert "## Quality Assurance Pipeline" in template

    def test_has_roadmap_section(self, template: str) -> None:
        assert "## Version Roadmap" in template

    def test_has_project_name_placeholder(self, template: str) -> None:
        assert "<YOUR_PROJECT_NAME>" in template

    def test_has_description_placeholder(self, template: str) -> None:
        assert "<YOUR_ONE_LINE_DESCRIPTION>" in template

    def test_has_directory_structure(self, template: str) -> None:
        assert "Directory Structure" in template

    def test_has_architecture_rules(self, template: str) -> None:
        assert "Architecture Rules" in template

    def test_not_empty(self, template: str) -> None:
        assert len(template.strip()) > 100


# ---------------------------------------------------------------------------
# Template uniqueness
# ---------------------------------------------------------------------------


class TestTemplateUniqueness:
    """Each template should have distinct content."""

    def test_all_templates_differ(self) -> None:
        names = ["generic", "web-app", "cli-tool", "library"]
        contents = [get_template(n) for n in names]
        assert len(set(contents)) == len(names)

    def test_web_app_has_backend_frontend(self) -> None:
        t = get_template("web-app")
        assert "backend" in t.lower()
        assert "frontend" in t.lower()

    def test_cli_tool_has_commands(self) -> None:
        t = get_template("cli-tool")
        assert "command" in t.lower()

    def test_library_has_api(self) -> None:
        t = get_template("library")
        assert "api" in t.lower()
