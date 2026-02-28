"""Tests for the REST API benchmark."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from pathlib import Path

from benchmarks.rest_api import (
    _ENDPOINTS,
    _TEST_FILES,
    check_crud_endpoints,
    check_data_model,
    check_database,
    check_entry_point,
    check_framework,
    check_project_structure,
    check_test_coverage,
    check_type_annotations,
    validate,
)


def _setup_complete_project(base: Path) -> Path:
    """Create a complete REST API project matching the spec.

    Args:
        base: Temporary directory to create the project in.

    Returns:
        Path to the project root.
    """
    project = base / "linkr"
    project.mkdir()

    # pyproject.toml
    (project / "pyproject.toml").write_text(
        '[project]\nname = "linkr"\nversion = "0.1.0"\n'
        "dependencies = [\n"
        '    "fastapi",\n'
        '    "uvicorn",\n'
        "]\n"
    )

    # Source package
    pkg = project / "src" / "linkr"
    pkg.mkdir(parents=True)
    (pkg / "__init__.py").write_text("")

    (pkg / "app.py").write_text(
        "from fastapi import FastAPI\n"
        "from linkr.database import get_db\n\n"
        "def create_app() -> FastAPI:\n"
        '    app = FastAPI(title="linkr")\n\n'
        '    @app.post("/bookmarks")\n'
        "    def create_bookmark() -> dict[str, object]:\n"
        "        return {}\n\n"
        '    @app.get("/bookmarks")\n'
        "    def list_bookmarks() -> list[dict[str, object]]:\n"
        "        return []\n\n"
        '    @app.get("/bookmarks/{bookmark_id}")\n'
        "    def get_bookmark(bookmark_id: int) -> dict[str, object]:\n"
        "        return {}\n\n"
        '    @app.put("/bookmarks/{bookmark_id}")\n'
        "    def update_bookmark(bookmark_id: int) -> dict[str, object]:\n"
        "        return {}\n\n"
        '    @app.delete("/bookmarks/{bookmark_id}")\n'
        "    def delete_bookmark(bookmark_id: int) -> None:\n"
        "        return None\n\n"
        "    return app\n"
    )

    (pkg / "models.py").write_text(
        "from dataclasses import dataclass\n\n"
        "@dataclass\n"
        "class Bookmark:\n"
        "    id: int\n"
        "    url: str\n"
        "    title: str\n"
        "    created_at: str\n\n"
        "def new_bookmark(id: int, url: str, title: str) -> Bookmark:\n"
        "    from datetime import datetime, timezone\n"
        "    return Bookmark(id=id, url=url, title=title, "
        "created_at=datetime.now(tz=timezone.utc).isoformat())\n"
    )

    (pkg / "database.py").write_text(
        "import sqlite3\nfrom pathlib import Path\n\n"
        "def get_db(path: Path | None = None) -> sqlite3.Connection:\n"
        '    db_path = path or Path("linkr.db")\n'
        "    conn = sqlite3.connect(str(db_path))\n"
        "    conn.execute(\n"
        '        "CREATE TABLE IF NOT EXISTS bookmarks "\n'
        '        "(id INTEGER PRIMARY KEY, url TEXT, title TEXT, created_at TEXT)"\n'
        "    )\n"
        "    return conn\n\n"
        "def insert_bookmark(conn: sqlite3.Connection, url: str, title: str)"
        " -> int:\n"
        "    cur = conn.execute(\n"
        '        "INSERT INTO bookmarks (url, title, created_at) VALUES (?, ?, ?)",\n'
        "        (url, title, ''),\n"
        "    )\n"
        "    conn.commit()\n"
        "    return cur.lastrowid or 0\n"
    )

    # Tests
    tests = project / "tests"
    tests.mkdir()
    (tests / "__init__.py").write_text("")
    (tests / "test_app.py").write_text("def test_app() -> None: pass\n")
    (tests / "test_models.py").write_text("def test_models() -> None: pass\n")
    (tests / "test_database.py").write_text("def test_database() -> None: pass\n")

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

    def test_has_app(self, tmp_path: Path) -> None:
        """App module with create_app passes."""
        project = _setup_complete_project(tmp_path)
        criteria = check_entry_point(project)
        assert all(c.passed for c in criteria)

    def test_no_app_module(self, tmp_path: Path) -> None:
        """Missing app.py fails."""
        project = _setup_complete_project(tmp_path)
        (project / "src" / "linkr" / "app.py").unlink()
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
        """Bookmark dataclass with all fields passes."""
        project = _setup_complete_project(tmp_path)
        criteria = check_data_model(project)
        assert all(c.passed for c in criteria)

    def test_missing_field(self, tmp_path: Path) -> None:
        """Bookmark missing a field fails fields check."""
        project = _setup_complete_project(tmp_path)
        models_path = project / "src" / "linkr" / "models.py"
        models_path.write_text(
            "from dataclasses import dataclass\n\n"
            "@dataclass\n"
            "class Bookmark:\n"
            "    id: int\n"
            "    url: str\n"
        )
        criteria = check_data_model(project)
        fields_crit = next(c for c in criteria if "fields" in c.name)
        assert not fields_crit.passed

    def test_no_dataclass(self, tmp_path: Path) -> None:
        """Plain class (no @dataclass) fails."""
        project = _setup_complete_project(tmp_path)
        models_path = project / "src" / "linkr" / "models.py"
        models_path.write_text("class Bookmark:\n    pass\n")
        criteria = check_data_model(project)
        dc_crit = next(c for c in criteria if "dataclass" in c.name.lower())
        assert not dc_crit.passed


class TestCheckCrudEndpoints:
    """Tests for check_crud_endpoints."""

    def test_all_endpoints(self, tmp_path: Path) -> None:
        """All CRUD endpoints present passes."""
        project = _setup_complete_project(tmp_path)
        criteria = check_crud_endpoints(project)
        assert all(c.passed for c in criteria)
        assert len(criteria) == len(_ENDPOINTS)

    def test_missing_endpoint(self, tmp_path: Path) -> None:
        """Missing DELETE endpoint fails that criterion."""
        project = _setup_complete_project(tmp_path)
        app_path = project / "src" / "linkr" / "app.py"
        app_path.write_text(
            "from fastapi import FastAPI\n\n"
            "app = FastAPI()\n\n"
            '@app.post("/bookmarks")\n'
            "def create_bookmark() -> None: pass\n\n"
            '@app.get("/bookmarks")\n'
            "def list_bookmarks() -> None: pass\n\n"
            '@app.put("/bookmarks/{id}")\n'
            "def update_bookmark() -> None: pass\n"
        )
        criteria = check_crud_endpoints(project)
        delete_crit = next(c for c in criteria if "DELETE" in c.name)
        assert not delete_crit.passed


class TestCheckDatabase:
    """Tests for check_database."""

    def test_sqlite_database(self, tmp_path: Path) -> None:
        """Database module with sqlite3 passes."""
        project = _setup_complete_project(tmp_path)
        criteria = check_database(project)
        assert all(c.passed for c in criteria)

    def test_no_database(self, tmp_path: Path) -> None:
        """Missing database.py fails."""
        project = _setup_complete_project(tmp_path)
        (project / "src" / "linkr" / "database.py").unlink()
        criteria = check_database(project)
        exists_crit = next(c for c in criteria if "exists" in c.name)
        assert not exists_crit.passed

    def test_no_sqlite(self, tmp_path: Path) -> None:
        """Database module without sqlite fails."""
        project = _setup_complete_project(tmp_path)
        db_path = project / "src" / "linkr" / "database.py"
        db_path.write_text("def get_db() -> None:\n    pass\n")
        criteria = check_database(project)
        sqlite_crit = next(c for c in criteria if "SQLite" in c.name)
        assert not sqlite_crit.passed


class TestCheckFramework:
    """Tests for check_framework."""

    def test_fastapi(self, tmp_path: Path) -> None:
        """Project with FastAPI passes."""
        project = _setup_complete_project(tmp_path)
        criteria = check_framework(project)
        assert all(c.passed for c in criteria)

    def test_no_framework(self, tmp_path: Path) -> None:
        """Project without any framework fails."""
        project = _setup_complete_project(tmp_path)
        # Remove framework references
        (project / "pyproject.toml").write_text('[project]\nname = "linkr"\nversion = "0.1.0"\n')
        app_path = project / "src" / "linkr" / "app.py"
        app_path.write_text("def create_app() -> None:\n    pass\n")
        criteria = check_framework(project)
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
        (project / "tests" / "test_database.py").unlink()
        criteria = check_test_coverage(project)
        db_test = next(c for c in criteria if "test_database" in c.name)
        assert not db_test.passed

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
        app_path = project / "src" / "linkr" / "app.py"
        app_path.write_text("def create_app():\n    pass\n")
        criteria = check_type_annotations(project)
        app_crit = next(c for c in criteria if "app" in c.name)
        assert not app_crit.passed


class TestValidate:
    """Tests for the top-level validate function."""

    def test_full_pass(self, tmp_path: Path) -> None:
        """Complete project passes benchmark."""
        project = _setup_complete_project(tmp_path)
        result = validate(project)
        failed = [c for c in result.criteria if not c.passed]
        fail_msg = "\n".join(f"  - {c.name}: {c.detail}" for c in failed)
        assert result.passed, f"REST API benchmark failed:\n{fail_msg}"
        assert result.name == "rest-api"
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
        # CRUD endpoints: 4
        # Database: 2 (exists + sqlite)
        # Framework: 1
        # Tests: 3
        # Type annotations: 3
        # Total: 21
        assert len(result.criteria) == 21

    def test_has_no_metrics(self, tmp_path: Path) -> None:
        """REST API benchmark has no metrics."""
        project = _setup_complete_project(tmp_path)
        result = validate(project)
        assert result.metrics == ()
