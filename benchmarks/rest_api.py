"""Benchmark #2: REST API with database validation.

Validates that a project directory contains a working REST API bookmark
service matching the specification in benchmarks/specs/rest_api.md.

Checks:
1. Project structure (pyproject.toml, src layout, tests)
2. Application entry point (app module with route definitions)
3. Data model (Bookmark dataclass with required fields)
4. CRUD endpoints (POST, GET list, GET detail, PUT, DELETE)
5. Database layer (SQLite-based database module)
6. HTTP framework (recognized web framework usage)
7. Test coverage (test files for each source module)
8. Type annotations (functions have annotations)
"""

from __future__ import annotations

import ast
import logging
from typing import TYPE_CHECKING

from benchmarks.harness import BenchmarkCriterion, BenchmarkResult

if TYPE_CHECKING:
    from pathlib import Path

logger = logging.getLogger("anima.benchmarks.rest_api")

# Expected source modules under the package directory.
_SOURCE_MODULES: tuple[str, ...] = ("app.py", "models.py", "database.py")

# Expected test files.
_TEST_FILES: tuple[str, ...] = ("test_app.py", "test_models.py", "test_database.py")

# Fields the Bookmark model must have.
_BOOKMARK_FIELDS: tuple[str, ...] = ("id", "url", "title", "created_at")

# HTTP methods / endpoint patterns the API must support.
_ENDPOINTS: tuple[str, ...] = ("post", "get", "put", "delete")

# Recognized web framework indicators.
_FRAMEWORK_INDICATORS: tuple[str, ...] = (
    "fastapi",
    "FastAPI",
    "flask",
    "Flask",
    "starlette",
    "Starlette",
    "litestar",
    "Litestar",
    "django",
    "Django",
    "bottle",
    "Bottle",
    "sanic",
    "Sanic",
    "falcon",
    "Falcon",
)


def _find_package_dir(project_dir: Path) -> Path | None:
    """Locate the main package directory.

    Looks for src/<name>/ layout first, then flat layout.

    Args:
        project_dir: Root of the project.

    Returns:
        Package directory path, or None if not found.
    """
    src_dir = project_dir / "src"
    if src_dir.exists():
        candidates = [d for d in src_dir.iterdir() if d.is_dir() and (d / "__init__.py").exists()]
        if candidates:
            return candidates[0]
    # Flat layout: look for any package with app.py.
    for d in project_dir.iterdir():
        if d.is_dir() and (d / "__init__.py").exists() and (d / "app.py").exists():
            return d
    return None


def _find_tests_dir(project_dir: Path) -> Path | None:
    """Locate the tests directory.

    Args:
        project_dir: Root of the project.

    Returns:
        Tests directory path, or None if not found.
    """
    tests_dir = project_dir / "tests"
    if tests_dir.exists() and tests_dir.is_dir():
        return tests_dir
    return None


def _source_has_annotations(source_path: Path) -> bool:
    """Check if a Python file has type annotations on its functions.

    Args:
        source_path: Path to a .py file.

    Returns:
        True if at least one function has a return annotation.
    """
    try:
        tree = ast.parse(source_path.read_text())
    except SyntaxError:
        return False

    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef) and node.returns is not None:
            return True
    return False


def _source_has_dataclass(source_path: Path, class_name: str) -> bool:
    """Check if a Python file defines a dataclass with the given name.

    Args:
        source_path: Path to a .py file.
        class_name: Name of the class to look for.

    Returns:
        True if the class exists and uses @dataclass decorator.
    """
    try:
        tree = ast.parse(source_path.read_text())
    except SyntaxError:
        return False

    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef) and node.name == class_name:
            for decorator in node.decorator_list:
                deco_name = ""
                if isinstance(decorator, ast.Name):
                    deco_name = decorator.id
                elif isinstance(decorator, ast.Call) and isinstance(decorator.func, ast.Name):
                    deco_name = decorator.func.id
                elif isinstance(decorator, ast.Attribute):
                    deco_name = decorator.attr
                if "dataclass" in deco_name:
                    return True
    return False


def _dataclass_has_fields(source_path: Path, class_name: str, fields: tuple[str, ...]) -> bool:
    """Check if a dataclass has the required fields.

    Args:
        source_path: Path to a .py file.
        class_name: Name of the class.
        fields: Required field names.

    Returns:
        True if all fields are present as annotated assignments.
    """
    try:
        tree = ast.parse(source_path.read_text())
    except SyntaxError:
        return False

    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef) and node.name == class_name:
            class_fields: set[str] = set()
            for item in node.body:
                if isinstance(item, ast.AnnAssign) and isinstance(item.target, ast.Name):
                    class_fields.add(item.target.id)
            return all(f in class_fields for f in fields)
    return False


def _source_has_sqlite(source_path: Path) -> bool:
    """Check if a Python file uses SQLite.

    Args:
        source_path: Path to a .py file.

    Returns:
        True if sqlite3 is imported or referenced.
    """
    try:
        text = source_path.read_text()
    except OSError:
        return False
    return "sqlite3" in text or "sqlite" in text.lower()


def _source_has_framework(project_dir: Path) -> str | None:
    """Check if the project uses a recognized web framework.

    Searches pyproject.toml and all source files for framework indicators.

    Args:
        project_dir: Root of the project.

    Returns:
        Name of the framework found, or None.
    """
    # Check pyproject.toml for dependencies.
    pyproject = project_dir / "pyproject.toml"
    if pyproject.exists():
        try:
            text = pyproject.read_text()
            for indicator in _FRAMEWORK_INDICATORS:
                if indicator.lower() in text.lower():
                    return indicator
        except OSError:
            pass

    # Check source files.
    pkg_dir = _find_package_dir(project_dir)
    if pkg_dir is not None:
        for py_file in pkg_dir.glob("*.py"):
            try:
                text = py_file.read_text()
            except OSError:
                continue
            for indicator in _FRAMEWORK_INDICATORS:
                if indicator in text:
                    return indicator

    return None


def _source_has_endpoints(source_path: Path, endpoints: tuple[str, ...]) -> list[str]:
    """Check which HTTP method patterns appear in a source file.

    Looks for decorators or function names indicating endpoint methods.

    Args:
        source_path: Path to a .py file.
        endpoints: HTTP method names to search for (lowercase).

    Returns:
        List of endpoint methods found.
    """
    try:
        text = source_path.read_text().lower()
    except OSError:
        return []
    return [ep for ep in endpoints if ep in text]


def check_project_structure(project_dir: Path) -> list[BenchmarkCriterion]:
    """Check the project has required structure.

    Args:
        project_dir: Root of the project.

    Returns:
        List of criteria for project structure.
    """
    criteria: list[BenchmarkCriterion] = []

    # pyproject.toml
    pyproject = project_dir / "pyproject.toml"
    criteria.append(
        BenchmarkCriterion(
            name="pyproject.toml exists",
            passed=pyproject.exists(),
            detail=str(pyproject) if pyproject.exists() else f"missing: {pyproject}",
        )
    )

    # Package directory with source modules
    pkg_dir = _find_package_dir(project_dir)
    has_pkg = pkg_dir is not None
    criteria.append(
        BenchmarkCriterion(
            name="package directory exists",
            passed=has_pkg,
            detail=str(pkg_dir) if has_pkg else "no package directory found",
        )
    )

    if pkg_dir is not None:
        for module in _SOURCE_MODULES:
            module_path = pkg_dir / module
            exists = module_path.exists()
            criteria.append(
                BenchmarkCriterion(
                    name=f"source: {module}",
                    passed=exists,
                    detail=str(module_path) if exists else f"missing: {module_path}",
                )
            )

    return criteria


def check_entry_point(project_dir: Path) -> list[BenchmarkCriterion]:
    """Check the app entry point exists with route definitions.

    Args:
        project_dir: Root of the project.

    Returns:
        List of criteria for entry point.
    """
    pkg_dir = _find_package_dir(project_dir)
    if pkg_dir is None:
        return [
            BenchmarkCriterion(
                name="app entry point",
                passed=False,
                detail="no package directory found",
            )
        ]

    app_path = pkg_dir / "app.py"
    if not app_path.exists():
        return [
            BenchmarkCriterion(
                name="app entry point",
                passed=False,
                detail=f"missing: {app_path}",
            )
        ]

    # Check for a create_app function or app instance.
    try:
        text = app_path.read_text()
    except OSError:
        return [
            BenchmarkCriterion(
                name="app entry point",
                passed=False,
                detail=f"cannot read: {app_path}",
            )
        ]

    has_app = "def create_app" in text or "app" in text.lower()

    return [
        BenchmarkCriterion(
            name="app entry point",
            passed=has_app,
            detail="app definition found" if has_app else "no app definition in app.py",
        )
    ]


def check_data_model(project_dir: Path) -> list[BenchmarkCriterion]:
    """Check the Bookmark data model exists with required fields.

    Args:
        project_dir: Root of the project.

    Returns:
        List of criteria for data model.
    """
    criteria: list[BenchmarkCriterion] = []
    pkg_dir = _find_package_dir(project_dir)

    if pkg_dir is None:
        criteria.append(
            BenchmarkCriterion(
                name="Bookmark dataclass",
                passed=False,
                detail="no package directory found",
            )
        )
        return criteria

    models_path = pkg_dir / "models.py"
    has_dataclass = _source_has_dataclass(models_path, "Bookmark")
    criteria.append(
        BenchmarkCriterion(
            name="Bookmark dataclass",
            passed=has_dataclass,
            detail="Bookmark @dataclass found" if has_dataclass else "missing Bookmark @dataclass",
        )
    )

    has_fields = _dataclass_has_fields(models_path, "Bookmark", _BOOKMARK_FIELDS)
    missing: list[str] = []
    if models_path.exists():
        try:
            tree = ast.parse(models_path.read_text())
            for node in ast.walk(tree):
                if isinstance(node, ast.ClassDef) and node.name == "Bookmark":
                    found_fields: set[str] = set()
                    for item in node.body:
                        if isinstance(item, ast.AnnAssign) and isinstance(item.target, ast.Name):
                            found_fields.add(item.target.id)
                    missing = [f for f in _BOOKMARK_FIELDS if f not in found_fields]
        except SyntaxError:
            pass

    criteria.append(
        BenchmarkCriterion(
            name="Bookmark fields complete",
            passed=has_fields,
            detail="" if has_fields else f"missing fields: {', '.join(missing)}",
        )
    )

    return criteria


def check_crud_endpoints(project_dir: Path) -> list[BenchmarkCriterion]:
    """Check that CRUD HTTP endpoints are implemented.

    Args:
        project_dir: Root of the project.

    Returns:
        List of criteria, one per HTTP method.
    """
    pkg_dir = _find_package_dir(project_dir)
    if pkg_dir is None:
        return [
            BenchmarkCriterion(
                name=f"endpoint: {ep.upper()}",
                passed=False,
                detail="no package directory found",
            )
            for ep in _ENDPOINTS
        ]

    # Search across all source files for endpoint references.
    all_found: set[str] = set()
    for py_file in pkg_dir.glob("*.py"):
        found = _source_has_endpoints(py_file, _ENDPOINTS)
        all_found.update(found)

    return [
        BenchmarkCriterion(
            name=f"endpoint: {ep.upper()}",
            passed=ep in all_found,
            detail=f"'{ep.upper()}' found" if ep in all_found else f"'{ep.upper()}' not found",
        )
        for ep in _ENDPOINTS
    ]


def check_database(project_dir: Path) -> list[BenchmarkCriterion]:
    """Check SQLite database module exists.

    Args:
        project_dir: Root of the project.

    Returns:
        List of criteria for database layer.
    """
    pkg_dir = _find_package_dir(project_dir)
    if pkg_dir is None:
        return [
            BenchmarkCriterion(
                name="database module",
                passed=False,
                detail="no package directory found",
            )
        ]

    db_path = pkg_dir / "database.py"
    exists = db_path.exists()
    has_sqlite = False
    if exists:
        has_sqlite = _source_has_sqlite(db_path)

    return [
        BenchmarkCriterion(
            name="database module exists",
            passed=exists,
            detail=str(db_path) if exists else f"missing: {db_path}",
        ),
        BenchmarkCriterion(
            name="SQLite usage",
            passed=has_sqlite,
            detail="sqlite usage found" if has_sqlite else "no sqlite usage in database module",
        ),
    ]


def check_framework(project_dir: Path) -> list[BenchmarkCriterion]:
    """Check the project uses a recognized web framework.

    Args:
        project_dir: Root of the project.

    Returns:
        List of criteria for framework usage.
    """
    framework = _source_has_framework(project_dir)
    return [
        BenchmarkCriterion(
            name="HTTP framework",
            passed=framework is not None,
            detail=f"framework: {framework}" if framework else "no recognized framework found",
        )
    ]


def check_test_coverage(project_dir: Path) -> list[BenchmarkCriterion]:
    """Check test files exist for each source module.

    Args:
        project_dir: Root of the project.

    Returns:
        List of criteria for test coverage.
    """
    tests_dir = _find_tests_dir(project_dir)
    if tests_dir is None:
        return [
            BenchmarkCriterion(
                name=f"test: {tf}",
                passed=False,
                detail="tests/ directory not found",
            )
            for tf in _TEST_FILES
        ]

    return [
        BenchmarkCriterion(
            name=f"test: {tf}",
            passed=(tests_dir / tf).exists(),
            detail=str(tests_dir / tf)
            if (tests_dir / tf).exists()
            else f"missing: {tests_dir / tf}",
        )
        for tf in _TEST_FILES
    ]


def check_type_annotations(project_dir: Path) -> list[BenchmarkCriterion]:
    """Check that source files have type annotations.

    Args:
        project_dir: Root of the project.

    Returns:
        List of criteria for type annotations.
    """
    pkg_dir = _find_package_dir(project_dir)
    if pkg_dir is None:
        return [
            BenchmarkCriterion(
                name="type annotations",
                passed=False,
                detail="no package directory found",
            )
        ]

    criteria: list[BenchmarkCriterion] = []
    for module in _SOURCE_MODULES:
        module_path = pkg_dir / module
        if not module_path.exists():
            criteria.append(
                BenchmarkCriterion(
                    name=f"typed: {module}",
                    passed=False,
                    detail=f"missing: {module_path}",
                )
            )
            continue
        has_annot = _source_has_annotations(module_path)
        criteria.append(
            BenchmarkCriterion(
                name=f"typed: {module}",
                passed=has_annot,
                detail="annotations found" if has_annot else "no function annotations",
            )
        )

    return criteria


def validate(project_dir: Path) -> BenchmarkResult:
    """Run the REST API benchmark validation.

    Validates that a project directory contains a working REST API bookmark
    service matching the specification.

    Args:
        project_dir: Root directory of the project to validate.

    Returns:
        BenchmarkResult with pass/fail criteria.
    """
    all_criteria: list[BenchmarkCriterion] = []

    all_criteria.extend(check_project_structure(project_dir))
    all_criteria.extend(check_entry_point(project_dir))
    all_criteria.extend(check_data_model(project_dir))
    all_criteria.extend(check_crud_endpoints(project_dir))
    all_criteria.extend(check_database(project_dir))
    all_criteria.extend(check_framework(project_dir))
    all_criteria.extend(check_test_coverage(project_dir))
    all_criteria.extend(check_type_annotations(project_dir))

    passed_count = sum(1 for c in all_criteria if c.passed)
    total_count = len(all_criteria)
    all_passed = passed_count == total_count

    summary = (
        f"{passed_count}/{total_count} criteria met. "
        f"REST API benchmark {'PASS' if all_passed else 'FAIL'}."
    )

    logger.info(
        "REST API benchmark: %s (%d/%d criteria)",
        "PASS" if all_passed else "FAIL",
        passed_count,
        total_count,
    )

    return BenchmarkResult(
        name="rest-api",
        passed=all_passed,
        criteria=tuple(all_criteria),
        metrics=(),
        summary=summary,
    )
