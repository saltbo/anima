"""Tests for the CLI app benchmark."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from pathlib import Path

from benchmarks.cli_app import (
    _COMMANDS,
    _TEST_FILES,
    check_argument_parsing,
    check_core_commands,
    check_data_model,
    check_entry_point,
    check_persistence,
    check_project_structure,
    check_test_coverage,
    check_type_annotations,
    validate,
)


def _setup_complete_project(base: Path) -> Path:
    """Create a complete CLI app project matching the spec.

    Args:
        base: Temporary directory to create the project in.

    Returns:
        Path to the project root.
    """
    project = base / "taskr"
    project.mkdir()

    # pyproject.toml
    (project / "pyproject.toml").write_text('[project]\nname = "taskr"\nversion = "0.1.0"\n')

    # Source package
    pkg = project / "src" / "taskr"
    pkg.mkdir(parents=True)
    (pkg / "__init__.py").write_text("")

    (pkg / "cli.py").write_text(
        "import argparse\n\n"
        "def main() -> None:\n"
        "    parser = argparse.ArgumentParser()\n"
        '    sub = parser.add_subparsers(dest="command")\n'
        '    sub.add_parser("add")\n'
        '    sub.add_parser("list")\n'
        '    sub.add_parser("complete")\n'
        '    sub.add_parser("remove")\n'
        "    args = parser.parse_args()\n"
    )

    (pkg / "models.py").write_text(
        "from dataclasses import dataclass\n\n"
        "@dataclass\n"
        "class Task:\n"
        "    id: int\n"
        "    title: str\n"
        "    completed: bool\n"
        "    created_at: str\n\n"
        "def new_task(id: int, title: str) -> Task:\n"
        "    from datetime import datetime, timezone\n"
        "    return Task(id=id, title=title, completed=False, "
        "created_at=datetime.now(tz=timezone.utc).isoformat())\n"
    )

    (pkg / "storage.py").write_text(
        "import json\nfrom pathlib import Path\n\n"
        "def load_tasks(path: Path) -> list[dict[str, object]]:\n"
        "    if path.exists():\n"
        "        return json.loads(path.read_text())  # type: ignore[no-any-return]\n"
        "    return []\n\n"
        "def save_tasks(path: Path, tasks: list[dict[str, object]]) -> None:\n"
        "    path.write_text(json.dumps(tasks))\n"
    )

    # Tests
    tests = project / "tests"
    tests.mkdir()
    (tests / "__init__.py").write_text("")
    (tests / "test_cli.py").write_text("def test_cli() -> None: pass\n")
    (tests / "test_models.py").write_text("def test_models() -> None: pass\n")
    (tests / "test_storage.py").write_text("def test_storage() -> None: pass\n")

    return project


def _setup_empty_project(base: Path) -> Path:
    """Create a minimal empty project directory.

    Args:
        base: Temporary directory.

    Returns:
        Path to the project root.
    """
    project = base / "empty"
    project.mkdir()
    return project


class TestCheckProjectStructure:
    """Tests for check_project_structure."""

    def test_complete(self, tmp_path: Path) -> None:
        """Complete project passes all structure checks."""
        project = _setup_complete_project(tmp_path)
        criteria = check_project_structure(project)
        assert all(c.passed for c in criteria)

    def test_no_pyproject(self, tmp_path: Path) -> None:
        """Missing pyproject.toml fails."""
        project = _setup_complete_project(tmp_path)
        (project / "pyproject.toml").unlink()
        criteria = check_project_structure(project)
        pyproject_crit = next(c for c in criteria if "pyproject" in c.name)
        assert not pyproject_crit.passed

    def test_empty_project(self, tmp_path: Path) -> None:
        """Empty project fails structure check."""
        project = _setup_empty_project(tmp_path)
        criteria = check_project_structure(project)
        assert not all(c.passed for c in criteria)


class TestCheckEntryPoint:
    """Tests for check_entry_point."""

    def test_has_main(self, tmp_path: Path) -> None:
        """CLI with main() passes."""
        project = _setup_complete_project(tmp_path)
        criteria = check_entry_point(project)
        assert all(c.passed for c in criteria)

    def test_no_main(self, tmp_path: Path) -> None:
        """CLI without main() fails."""
        project = _setup_complete_project(tmp_path)
        cli_path = project / "src" / "taskr" / "cli.py"
        cli_path.write_text("def run() -> None: pass\n")
        criteria = check_entry_point(project)
        assert not all(c.passed for c in criteria)

    def test_no_package(self, tmp_path: Path) -> None:
        """No package directory fails."""
        project = _setup_empty_project(tmp_path)
        criteria = check_entry_point(project)
        assert not all(c.passed for c in criteria)


class TestCheckDataModel:
    """Tests for check_data_model."""

    def test_complete_model(self, tmp_path: Path) -> None:
        """Task dataclass with all fields passes."""
        project = _setup_complete_project(tmp_path)
        criteria = check_data_model(project)
        assert all(c.passed for c in criteria)

    def test_missing_field(self, tmp_path: Path) -> None:
        """Task missing a field fails fields check."""
        project = _setup_complete_project(tmp_path)
        models_path = project / "src" / "taskr" / "models.py"
        models_path.write_text(
            "from dataclasses import dataclass\n\n"
            "@dataclass\n"
            "class Task:\n"
            "    id: int\n"
            "    title: str\n"
        )
        criteria = check_data_model(project)
        fields_crit = next(c for c in criteria if "fields" in c.name)
        assert not fields_crit.passed

    def test_no_dataclass(self, tmp_path: Path) -> None:
        """Plain class (no @dataclass) fails."""
        project = _setup_complete_project(tmp_path)
        models_path = project / "src" / "taskr" / "models.py"
        models_path.write_text("class Task:\n    pass\n")
        criteria = check_data_model(project)
        dc_crit = next(c for c in criteria if "dataclass" in c.name.lower())
        assert not dc_crit.passed


class TestCheckCoreCommands:
    """Tests for check_core_commands."""

    def test_all_commands(self, tmp_path: Path) -> None:
        """All commands present passes."""
        project = _setup_complete_project(tmp_path)
        criteria = check_core_commands(project)
        assert all(c.passed for c in criteria)
        assert len(criteria) == len(_COMMANDS)

    def test_missing_command(self, tmp_path: Path) -> None:
        """Missing a command fails that criterion."""
        project = _setup_complete_project(tmp_path)
        cli_path = project / "src" / "taskr" / "cli.py"
        cli_path.write_text(
            "import argparse\n\n"
            "def main() -> None:\n"
            "    parser = argparse.ArgumentParser()\n"
            '    sub = parser.add_subparsers(dest="command")\n'
            '    sub.add_parser("add")\n'
            '    sub.add_parser("list")\n'
        )
        criteria = check_core_commands(project)
        remove_crit = next(c for c in criteria if "remove" in c.name)
        assert not remove_crit.passed


class TestCheckPersistence:
    """Tests for check_persistence."""

    def test_json_storage(self, tmp_path: Path) -> None:
        """Storage with json passes."""
        project = _setup_complete_project(tmp_path)
        criteria = check_persistence(project)
        assert all(c.passed for c in criteria)

    def test_no_storage(self, tmp_path: Path) -> None:
        """Missing storage.py fails."""
        project = _setup_complete_project(tmp_path)
        (project / "src" / "taskr" / "storage.py").unlink()
        criteria = check_persistence(project)
        storage_crit = next(c for c in criteria if "exists" in c.name)
        assert not storage_crit.passed


class TestCheckArgumentParsing:
    """Tests for check_argument_parsing."""

    def test_has_argparse(self, tmp_path: Path) -> None:
        """CLI using argparse passes."""
        project = _setup_complete_project(tmp_path)
        criteria = check_argument_parsing(project)
        assert all(c.passed for c in criteria)

    def test_no_argparse(self, tmp_path: Path) -> None:
        """CLI without argparse fails."""
        project = _setup_complete_project(tmp_path)
        cli_path = project / "src" / "taskr" / "cli.py"
        cli_path.write_text("def main() -> None: pass\n")
        criteria = check_argument_parsing(project)
        assert not all(c.passed for c in criteria)


class TestCheckTestCoverage:
    """Tests for check_test_coverage."""

    def test_all_tests(self, tmp_path: Path) -> None:
        """All test files present passes."""
        project = _setup_complete_project(tmp_path)
        criteria = check_test_coverage(project)
        assert all(c.passed for c in criteria)
        assert len(criteria) == len(_TEST_FILES)

    def test_missing_test(self, tmp_path: Path) -> None:
        """Missing a test file fails that criterion."""
        project = _setup_complete_project(tmp_path)
        (project / "tests" / "test_storage.py").unlink()
        criteria = check_test_coverage(project)
        storage_test = next(c for c in criteria if "test_storage" in c.name)
        assert not storage_test.passed

    def test_no_tests_dir(self, tmp_path: Path) -> None:
        """No tests/ directory fails all."""
        project = _setup_empty_project(tmp_path)
        criteria = check_test_coverage(project)
        assert not any(c.passed for c in criteria)


class TestCheckTypeAnnotations:
    """Tests for check_type_annotations."""

    def test_annotated(self, tmp_path: Path) -> None:
        """Source files with annotations pass."""
        project = _setup_complete_project(tmp_path)
        criteria = check_type_annotations(project)
        assert all(c.passed for c in criteria)

    def test_no_annotations(self, tmp_path: Path) -> None:
        """Source without annotations fails."""
        project = _setup_complete_project(tmp_path)
        cli_path = project / "src" / "taskr" / "cli.py"
        cli_path.write_text("def main():\n    pass\n")
        criteria = check_type_annotations(project)
        cli_crit = next(c for c in criteria if "cli" in c.name)
        assert not cli_crit.passed


class TestValidate:
    """Tests for the top-level validate function."""

    def test_full_pass(self, tmp_path: Path) -> None:
        """Complete project passes benchmark."""
        project = _setup_complete_project(tmp_path)
        result = validate(project)
        failed = [c for c in result.criteria if not c.passed]
        fail_msg = "\n".join(f"  - {c.name}: {c.detail}" for c in failed)
        assert result.passed, f"CLI app benchmark failed:\n{fail_msg}"
        assert result.name == "cli-app"
        assert "PASS" in result.summary

    def test_empty_project_fails(self, tmp_path: Path) -> None:
        """Empty project fails benchmark."""
        project = _setup_empty_project(tmp_path)
        result = validate(project)
        assert not result.passed
        assert "FAIL" in result.summary

    def test_criteria_count(self, tmp_path: Path) -> None:
        """Validate produces expected number of criteria."""
        project = _setup_complete_project(tmp_path)
        result = validate(project)
        # Structure: 2 (pyproject + pkg) + 3 (source modules) = 5
        # Entry point: 1
        # Data model: 2 (dataclass + fields)
        # Commands: 4
        # Persistence: 2 (exists + json)
        # Argparse: 1
        # Tests: 3
        # Type annotations: 3
        # Total: 21
        assert len(result.criteria) == 21
