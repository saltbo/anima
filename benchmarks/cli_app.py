"""Benchmark #1: Simple CLI app validation.

Validates that a project directory contains a working CLI todo app
matching the specification in benchmarks/specs/cli_app.md.

Checks:
1. Project structure (pyproject.toml, src layout, tests)
2. Entry point (CLI module with main/argument parsing)
3. Data model (Task dataclass with required fields)
4. Core commands (add, list, complete, remove)
5. Persistence (JSON storage module)
6. Argument parsing (argparse usage)
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

logger = logging.getLogger("anima.benchmarks.cli_app")

# Expected source modules under the package directory.
_SOURCE_MODULES: tuple[str, ...] = ("cli.py", "models.py", "storage.py")

# Expected test files.
_TEST_FILES: tuple[str, ...] = ("test_cli.py", "test_models.py", "test_storage.py")

# Fields the Task model must have.
_TASK_FIELDS: tuple[str, ...] = ("id", "title", "completed", "created_at")

# Command names the CLI must support.
_COMMANDS: tuple[str, ...] = ("add", "list", "complete", "remove")


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
    # Flat layout: look for any package with cli.py.
    for d in project_dir.iterdir():
        if d.is_dir() and (d / "__init__.py").exists() and (d / "cli.py").exists():
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


def _source_has_argparse(source_path: Path) -> bool:
    """Check if a Python file uses argparse.

    Args:
        source_path: Path to a .py file.

    Returns:
        True if argparse is imported or ArgumentParser is referenced.
    """
    try:
        text = source_path.read_text()
    except OSError:
        return False
    return "argparse" in text or "ArgumentParser" in text


def _source_has_commands(source_path: Path, commands: tuple[str, ...]) -> list[str]:
    """Check which command names appear in a source file.

    Looks for string literals or function names matching commands.

    Args:
        source_path: Path to a .py file.
        commands: Command names to search for.

    Returns:
        List of commands found.
    """
    try:
        text = source_path.read_text()
    except OSError:
        return []
    return [cmd for cmd in commands if cmd in text]


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
    """Check the CLI entry point exists and has a main function.

    Args:
        project_dir: Root of the project.

    Returns:
        List of criteria for entry point.
    """
    pkg_dir = _find_package_dir(project_dir)
    if pkg_dir is None:
        return [
            BenchmarkCriterion(
                name="CLI entry point",
                passed=False,
                detail="no package directory found",
            )
        ]

    cli_path = pkg_dir / "cli.py"
    if not cli_path.exists():
        return [
            BenchmarkCriterion(
                name="CLI entry point",
                passed=False,
                detail=f"missing: {cli_path}",
            )
        ]

    # Check for a main function.
    try:
        tree = ast.parse(cli_path.read_text())
    except SyntaxError:
        return [
            BenchmarkCriterion(
                name="CLI entry point",
                passed=False,
                detail=f"syntax error in {cli_path}",
            )
        ]

    has_main = any(
        isinstance(node, ast.FunctionDef) and node.name == "main" for node in ast.walk(tree)
    )

    return [
        BenchmarkCriterion(
            name="CLI entry point (main function)",
            passed=has_main,
            detail="main() found" if has_main else "no main() function",
        )
    ]


def check_data_model(project_dir: Path) -> list[BenchmarkCriterion]:
    """Check the Task data model exists with required fields.

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
                name="Task dataclass",
                passed=False,
                detail="no package directory found",
            )
        )
        return criteria

    models_path = pkg_dir / "models.py"
    has_dataclass = _source_has_dataclass(models_path, "Task")
    criteria.append(
        BenchmarkCriterion(
            name="Task dataclass",
            passed=has_dataclass,
            detail="Task @dataclass found" if has_dataclass else "missing Task @dataclass",
        )
    )

    has_fields = _dataclass_has_fields(models_path, "Task", _TASK_FIELDS)
    missing = []
    if models_path.exists():
        try:
            tree = ast.parse(models_path.read_text())
            for node in ast.walk(tree):
                if isinstance(node, ast.ClassDef) and node.name == "Task":
                    found_fields: set[str] = set()
                    for item in node.body:
                        if isinstance(item, ast.AnnAssign) and isinstance(item.target, ast.Name):
                            found_fields.add(item.target.id)
                    missing = [f for f in _TASK_FIELDS if f not in found_fields]
        except SyntaxError:
            pass

    criteria.append(
        BenchmarkCriterion(
            name="Task fields complete",
            passed=has_fields,
            detail="" if has_fields else f"missing fields: {', '.join(missing)}",
        )
    )

    return criteria


def check_core_commands(project_dir: Path) -> list[BenchmarkCriterion]:
    """Check that core CLI commands are implemented.

    Args:
        project_dir: Root of the project.

    Returns:
        List of criteria, one per command.
    """
    pkg_dir = _find_package_dir(project_dir)
    if pkg_dir is None:
        return [
            BenchmarkCriterion(
                name=f"command: {cmd}",
                passed=False,
                detail="no package directory found",
            )
            for cmd in _COMMANDS
        ]

    # Search across all source files for command references.
    all_found: set[str] = set()
    for py_file in pkg_dir.glob("*.py"):
        found = _source_has_commands(py_file, _COMMANDS)
        all_found.update(found)

    return [
        BenchmarkCriterion(
            name=f"command: {cmd}",
            passed=cmd in all_found,
            detail=f"'{cmd}' found" if cmd in all_found else f"'{cmd}' not found in source",
        )
        for cmd in _COMMANDS
    ]


def check_persistence(project_dir: Path) -> list[BenchmarkCriterion]:
    """Check JSON persistence module exists.

    Args:
        project_dir: Root of the project.

    Returns:
        List of criteria for persistence.
    """
    pkg_dir = _find_package_dir(project_dir)
    if pkg_dir is None:
        return [
            BenchmarkCriterion(
                name="persistence module",
                passed=False,
                detail="no package directory found",
            )
        ]

    storage_path = pkg_dir / "storage.py"
    exists = storage_path.exists()
    has_json = False
    if exists:
        try:
            text = storage_path.read_text()
            has_json = "json" in text
        except OSError:
            pass

    return [
        BenchmarkCriterion(
            name="storage module exists",
            passed=exists,
            detail=str(storage_path) if exists else f"missing: {storage_path}",
        ),
        BenchmarkCriterion(
            name="JSON persistence",
            passed=has_json,
            detail="json usage found" if has_json else "no json usage in storage",
        ),
    ]


def check_argument_parsing(project_dir: Path) -> list[BenchmarkCriterion]:
    """Check CLI uses argparse for argument handling.

    Args:
        project_dir: Root of the project.

    Returns:
        List of criteria for argument parsing.
    """
    pkg_dir = _find_package_dir(project_dir)
    if pkg_dir is None:
        return [
            BenchmarkCriterion(
                name="argument parsing",
                passed=False,
                detail="no package directory found",
            )
        ]

    cli_path = pkg_dir / "cli.py"
    has_argparse = _source_has_argparse(cli_path)
    return [
        BenchmarkCriterion(
            name="argparse usage",
            passed=has_argparse,
            detail="argparse found" if has_argparse else "no argparse in cli.py",
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
    """Run the CLI app benchmark validation.

    Validates that a project directory contains a working CLI todo app
    matching the specification.

    Args:
        project_dir: Root directory of the project to validate.

    Returns:
        BenchmarkResult with pass/fail criteria.
    """
    all_criteria: list[BenchmarkCriterion] = []

    all_criteria.extend(check_project_structure(project_dir))
    all_criteria.extend(check_entry_point(project_dir))
    all_criteria.extend(check_data_model(project_dir))
    all_criteria.extend(check_core_commands(project_dir))
    all_criteria.extend(check_persistence(project_dir))
    all_criteria.extend(check_argument_parsing(project_dir))
    all_criteria.extend(check_test_coverage(project_dir))
    all_criteria.extend(check_type_annotations(project_dir))

    passed_count = sum(1 for c in all_criteria if c.passed)
    total_count = len(all_criteria)
    all_passed = passed_count == total_count

    summary = (
        f"{passed_count}/{total_count} criteria met. "
        f"CLI app benchmark {'PASS' if all_passed else 'FAIL'}."
    )

    logger.info(
        "CLI app benchmark: %s (%d/%d criteria)",
        "PASS" if all_passed else "FAIL",
        passed_count,
        total_count,
    )

    return BenchmarkResult(
        name="cli-app",
        passed=all_passed,
        criteria=tuple(all_criteria),
        metrics=(),
        summary=summary,
    )
