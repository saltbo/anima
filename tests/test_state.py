"""Tests for state initializer and manager."""

from pathlib import Path

from anima.domain.models import (
    AnimaState,
    FeatureState,
    FeatureStatus,
    MilestoneState,
    MilestoneStatus,
)
from anima.state.initializer import initialize, is_initialized
from anima.state.manager import StateManager


class TestInitializer:
    def test_initialize_creates_structure(self, tmp_project: Path) -> None:
        assert not is_initialized(tmp_project)
        result = initialize(tmp_project)
        assert result == tmp_project / ".anima"
        assert is_initialized(tmp_project)
        assert (tmp_project / ".anima" / "config.yaml").exists()
        assert (tmp_project / ".anima" / "state.yaml").exists()
        assert (tmp_project / ".anima" / "milestones").is_dir()
        assert (tmp_project / ".anima" / "logs").is_dir()
        assert (tmp_project / ".anima" / ".gitignore").exists()

    def test_initialize_idempotent(self, tmp_project: Path) -> None:
        initialize(tmp_project)
        # Write custom config
        config = tmp_project / ".anima" / "config.yaml"
        config.write_text("custom: true\n")
        # Re-initialize should not overwrite
        initialize(tmp_project)
        assert config.read_text() == "custom: true\n"

    def test_gitignore_content(self, tmp_project: Path) -> None:
        initialize(tmp_project)
        content = (tmp_project / ".anima" / ".gitignore").read_text()
        assert "logs/" in content


class TestStateManager:
    def test_load_empty(self, tmp_project: Path) -> None:
        manager = StateManager()
        state = manager.load(tmp_project)
        assert state.current_milestone == ""
        assert state.milestones == {}

    def test_save_and_load_roundtrip(self, tmp_project: Path) -> None:
        manager = StateManager()
        state = AnimaState(current_milestone="v0.1")
        ms = MilestoneState(
            milestone_id="v0.1",
            status=MilestoneStatus.IN_PROGRESS,
            branch_name="milestone/v0.1",
            base_commit="abc123",
            current_feature_index=1,
            features=[
                FeatureState(name="TUI", status=FeatureStatus.COMPLETED),
                FeatureState(name="Scheduler", status=FeatureStatus.IN_PROGRESS),
                FeatureState(
                    name="Agent",
                    status=FeatureStatus.SKIPPED,
                    skip_reason="blocked",
                ),
            ],
            retry_count=2,
        )
        state.set_milestone(ms)
        manager.save(tmp_project, state)
        loaded = manager.load(tmp_project)

        assert loaded.current_milestone == "v0.1"
        loaded_ms = loaded.get_milestone("v0.1")
        assert loaded_ms is not None
        assert loaded_ms.status == MilestoneStatus.IN_PROGRESS
        assert loaded_ms.branch_name == "milestone/v0.1"
        assert loaded_ms.base_commit == "abc123"
        assert loaded_ms.current_feature_index == 1
        assert loaded_ms.retry_count == 2
        assert len(loaded_ms.features) == 3
        assert loaded_ms.features[0].name == "TUI"
        assert loaded_ms.features[0].status == FeatureStatus.COMPLETED
        assert loaded_ms.features[2].skip_reason == "blocked"

    def test_save_creates_directory(self, tmp_project: Path) -> None:
        manager = StateManager()
        state = AnimaState(current_milestone="v0.1")
        manager.save(tmp_project, state)
        assert (tmp_project / ".anima" / "state.yaml").exists()
