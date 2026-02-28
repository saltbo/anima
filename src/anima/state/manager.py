"""State persistence via YAML."""

from pathlib import Path
from typing import Any

import yaml

from anima.config import state_file
from anima.domain.models import (
    AnimaState,
    FeatureState,
    FeatureStatus,
    MilestoneState,
    MilestoneStatus,
)


def _feature_to_dict(f: FeatureState) -> dict[str, str | None]:
    d: dict[str, str | None] = {"name": f.name, "status": f.status.value}
    if f.skip_reason is not None:
        d["skip_reason"] = f.skip_reason
    return d


def _milestone_to_dict(ms: MilestoneState) -> dict[str, object]:
    return {
        "milestone_id": ms.milestone_id,
        "status": ms.status.value,
        "branch_name": ms.branch_name,
        "base_commit": ms.base_commit,
        "current_feature_index": ms.current_feature_index,
        "features": [_feature_to_dict(f) for f in ms.features],
        "retry_count": ms.retry_count,
    }


def _state_to_dict(state: AnimaState) -> dict[str, object]:
    return {
        "current_milestone": state.current_milestone,
        "milestones": {k: _milestone_to_dict(v) for k, v in state.milestones.items()},
    }


def _feature_from_dict(d: dict[str, Any]) -> FeatureState:
    return FeatureState(
        name=str(d["name"]),
        status=FeatureStatus(d["status"]),
        skip_reason=d.get("skip_reason"),
    )


def _milestone_from_dict(d: dict[str, Any]) -> MilestoneState:
    features_raw: list[dict[str, Any]] = d.get("features", [])
    return MilestoneState(
        milestone_id=str(d["milestone_id"]),
        status=MilestoneStatus(d.get("status", "pending")),
        branch_name=str(d.get("branch_name", "")),
        base_commit=str(d.get("base_commit", "")),
        current_feature_index=int(d.get("current_feature_index", 0)),
        features=[_feature_from_dict(f) for f in features_raw],
        retry_count=int(d.get("retry_count", 0)),
    )


def _state_from_dict(d: dict[str, Any]) -> AnimaState:
    milestones_raw: dict[str, dict[str, Any]] = d.get("milestones", {})
    state = AnimaState(current_milestone=str(d.get("current_milestone", "")))
    for key, ms_data in milestones_raw.items():
        ms_data.setdefault("milestone_id", key)
        state.milestones[key] = _milestone_from_dict(ms_data)
    return state


class StateManager:
    """Manages persisting and loading AnimaState to/from YAML."""

    def load(self, project_dir: Path) -> AnimaState:
        """Load state from .anima/state.yaml."""
        sf = state_file(project_dir)
        if not sf.exists():
            return AnimaState()
        text = sf.read_text()
        data: dict[str, Any] = yaml.safe_load(text) or {}
        return _state_from_dict(data)

    def save(self, project_dir: Path, state: AnimaState) -> None:
        """Save state to .anima/state.yaml."""
        sf = state_file(project_dir)
        sf.parent.mkdir(parents=True, exist_ok=True)
        data = _state_to_dict(state)
        sf.write_text(yaml.dump(data, default_flow_style=False, allow_unicode=True))
