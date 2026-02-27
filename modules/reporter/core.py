"""Reporter module — persists iteration records as structured JSON files.

Writes IterationRecord instances to iterations/ and provides read access
to recent records for the planner to learn from history.

This module depends only on domain/ types and has zero external imports beyond stdlib.
"""

from __future__ import annotations

import dataclasses
import json
from typing import TYPE_CHECKING, Any

from domain.models import (
    ExecutionResult,
    FileChange,
    Gap,
    IterationOutcome,
    IterationPlan,
    IterationRecord,
    PlannedAction,
    Priority,
    StageResult,
    VerificationReport,
    VerificationStatus,
)

if TYPE_CHECKING:
    from domain.ports import FileSystemPort

_ITERATIONS_DIR = "iterations"


class _EnumEncoder(json.JSONEncoder):
    """JSON encoder that serializes Enum values as their .value strings."""

    def default(self, o: object) -> str:
        """Serialize enum members to their value string."""
        if isinstance(o, (Priority, IterationOutcome, VerificationStatus)):
            return str(o.value)
        result: str = super().default(o)
        return result


def _record_to_dict(record: IterationRecord) -> dict[str, object]:
    """Convert an IterationRecord to a JSON-serializable dict.

    Enum values are stored as their string values (e.g., "high", "success").
    """
    raw: dict[str, object] = dataclasses.asdict(record)
    return raw


def _dict_to_record(data: dict[str, Any]) -> IterationRecord:
    """Reconstruct an IterationRecord from a deserialized JSON dict.

    Enum fields are reconstructed from their string values.
    """
    gap_addressed = Gap(
        category=data["gap_addressed"]["category"],
        description=data["gap_addressed"]["description"],
        priority=Priority(data["gap_addressed"]["priority"]),
        roadmap_version=data["gap_addressed"]["roadmap_version"],
        evidence=data["gap_addressed"]["evidence"],
    )

    plan_gap = Gap(
        category=data["plan"]["gap"]["category"],
        description=data["plan"]["gap"]["description"],
        priority=Priority(data["plan"]["gap"]["priority"]),
        roadmap_version=data["plan"]["gap"]["roadmap_version"],
        evidence=data["plan"]["gap"]["evidence"],
    )
    actions = [
        PlannedAction(
            description=a["description"],
            target_files=a["target_files"],
            action_type=a["action_type"],
        )
        for a in data["plan"]["actions"]
    ]
    plan = IterationPlan(
        iteration_id=data["plan"]["iteration_id"],
        gap=plan_gap,
        actions=actions,
        acceptance_criteria=data["plan"]["acceptance_criteria"],
        estimated_risk=data["plan"]["estimated_risk"],
    )

    exec_data = data["execution"]
    exec_plan_gap = Gap(
        category=exec_data["plan"]["gap"]["category"],
        description=exec_data["plan"]["gap"]["description"],
        priority=Priority(exec_data["plan"]["gap"]["priority"]),
        roadmap_version=exec_data["plan"]["gap"]["roadmap_version"],
        evidence=exec_data["plan"]["gap"]["evidence"],
    )
    exec_actions = [
        PlannedAction(
            description=a["description"],
            target_files=a["target_files"],
            action_type=a["action_type"],
        )
        for a in exec_data["plan"]["actions"]
    ]
    exec_plan = IterationPlan(
        iteration_id=exec_data["plan"]["iteration_id"],
        gap=exec_plan_gap,
        actions=exec_actions,
        acceptance_criteria=exec_data["plan"]["acceptance_criteria"],
        estimated_risk=exec_data["plan"]["estimated_risk"],
    )
    files_changed = [
        FileChange(
            path=f["path"],
            change_type=f["change_type"],
            diff_summary=f["diff_summary"],
        )
        for f in exec_data["files_changed"]
    ]
    execution = ExecutionResult(
        iteration_id=exec_data["iteration_id"],
        plan=exec_plan,
        files_changed=files_changed,
        agent_output=exec_data["agent_output"],
        success=exec_data["success"],
        error_message=exec_data["error_message"],
    )

    ver_data = data["verification"]
    stages = [
        StageResult(
            stage=s["stage"],
            status=VerificationStatus(s["status"]),
            output=s["output"],
            details=s["details"],
        )
        for s in ver_data["stages"]
    ]
    verification = VerificationReport(
        iteration_id=ver_data["iteration_id"],
        stages=stages,
        all_passed=ver_data["all_passed"],
        summary=ver_data["summary"],
    )

    return IterationRecord(
        iteration_id=data["iteration_id"],
        timestamp=data["timestamp"],
        gap_addressed=gap_addressed,
        plan=plan,
        execution=execution,
        verification=verification,
        outcome=IterationOutcome(data["outcome"]),
        duration_seconds=data["duration_seconds"],
        notes=data["notes"],
    )


class Reporter:
    """Persists iteration records and retrieves recent history.

    Constructor-injected FileSystemPort handles all file I/O.
    This class contains only serialization, deserialization, and path logic.
    """

    def __init__(self, fs: FileSystemPort) -> None:
        self._fs = fs

    def save_record(self, record: IterationRecord) -> str:
        """Serialize an IterationRecord to JSON and write to iterations/.

        Returns the file path where the record was saved.
        Raises ValueError if a record with the same iteration_id already exists.
        """
        self._fs.make_directory(_ITERATIONS_DIR)

        file_path = f"{_ITERATIONS_DIR}/{record.iteration_id}.json"

        if self._fs.file_exists(file_path):
            msg = f"Record already exists: {record.iteration_id}"
            raise ValueError(msg)

        data = _record_to_dict(record)
        content = json.dumps(data, indent=2, ensure_ascii=False, cls=_EnumEncoder) + "\n"
        self._fs.write_file(file_path, content)

        return file_path

    def load_recent_records(self, count: int) -> list[IterationRecord]:
        """Load up to `count` recent iteration records, newest first.

        Silently skips files that fail to deserialize.
        Returns an empty list if the iterations/ directory doesn't exist or is empty.
        """
        if count <= 0:
            return []

        try:
            file_infos = self._fs.list_files(_ITERATIONS_DIR, "*.json")
        except (FileNotFoundError, OSError):
            return []

        if not file_infos:
            return []

        records: list[IterationRecord] = []
        for fi in file_infos:
            try:
                content = self._fs.read_file(fi.path)
                data: dict[str, Any] = json.loads(content)
                record = _dict_to_record(data)
                records.append(record)
            except (json.JSONDecodeError, KeyError, ValueError, TypeError):
                # Skip corrupted or invalid files.
                continue

        # Sort by timestamp descending (newest first).
        records.sort(key=lambda r: r.timestamp, reverse=True)

        return records[:count]
