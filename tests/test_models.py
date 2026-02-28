"""Tests for domain models."""

from anima.domain.models import (
    AnimaState,
    FeatureState,
    FeatureStatus,
    MilestoneState,
    MilestoneStatus,
    StreamEvent,
)


class TestFeatureState:
    def test_default_status(self) -> None:
        f = FeatureState(name="TUI")
        assert f.status == FeatureStatus.PENDING
        assert f.skip_reason is None

    def test_skipped_with_reason(self) -> None:
        f = FeatureState(
            name="TUI", status=FeatureStatus.SKIPPED, skip_reason="blocked"
        )
        assert f.status == FeatureStatus.SKIPPED
        assert f.skip_reason == "blocked"


class TestMilestoneState:
    def test_current_feature(self, sample_milestone: MilestoneState) -> None:
        assert sample_milestone.current_feature is not None
        assert sample_milestone.current_feature.name == "TUI"

    def test_current_feature_index_out_of_range(self) -> None:
        ms = MilestoneState(milestone_id="v0.1", current_feature_index=5)
        assert ms.current_feature is None

    def test_is_complete_false(self, sample_milestone: MilestoneState) -> None:
        assert not sample_milestone.is_complete

    def test_is_complete_true(self) -> None:
        ms = MilestoneState(
            milestone_id="v0.1",
            features=[
                FeatureState(name="A", status=FeatureStatus.COMPLETED),
                FeatureState(name="B", status=FeatureStatus.SKIPPED),
            ],
        )
        assert ms.is_complete

    def test_is_complete_empty(self) -> None:
        ms = MilestoneState(milestone_id="v0.1")
        assert ms.is_complete  # vacuously true

    def test_default_status(self) -> None:
        ms = MilestoneState(milestone_id="v0.1")
        assert ms.status == MilestoneStatus.PENDING


class TestAnimaState:
    def test_get_set_milestone(self) -> None:
        state = AnimaState()
        ms = MilestoneState(milestone_id="v0.1")
        state.set_milestone(ms)
        assert state.get_milestone("v0.1") is ms

    def test_get_missing_milestone(self) -> None:
        state = AnimaState()
        assert state.get_milestone("v0.1") is None

    def test_from_fixture(self, sample_state: AnimaState) -> None:
        assert sample_state.current_milestone == "v0.1"
        ms = sample_state.get_milestone("v0.1")
        assert ms is not None
        assert len(ms.features) == 3


class TestStreamEvent:
    def test_defaults(self) -> None:
        e = StreamEvent(type="assistant")
        assert e.content == ""
        assert e.raw == {}

    def test_with_content(self) -> None:
        e = StreamEvent(type="result", content="done", raw={"cost": 0.01})
        assert e.type == "result"
        assert e.content == "done"
