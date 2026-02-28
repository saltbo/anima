"""Shared test fixtures."""

from pathlib import Path

import pytest

from anima.domain.models import AnimaState, FeatureState, FeatureStatus, MilestoneState


@pytest.fixture
def tmp_project(tmp_path: Path) -> Path:
    """Create a temporary project directory."""
    return tmp_path


@pytest.fixture
def sample_milestone() -> MilestoneState:
    """Create a sample milestone state."""
    return MilestoneState(
        milestone_id="v0.1",
        branch_name="milestone/v0.1",
        base_commit="abc123",
        features=[
            FeatureState(name="TUI"),
            FeatureState(name="Scheduler"),
            FeatureState(name="Agent", status=FeatureStatus.COMPLETED),
        ],
    )


@pytest.fixture
def sample_state(sample_milestone: MilestoneState) -> AnimaState:
    """Create a sample anima state."""
    state = AnimaState(current_milestone="v0.1")
    state.set_milestone(sample_milestone)
    return state
