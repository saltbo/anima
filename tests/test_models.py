"""Tests for domain models."""

from anima.domain.models import (
    AnimaState,
    MilestoneState,
    MilestoneStatus,
    StreamEvent,
)


class TestMilestoneState:
    def test_default_status(self) -> None:
        ms = MilestoneState(milestone_id="v0.1")
        assert ms.status == MilestoneStatus.PENDING

    def test_default_iteration_count(self) -> None:
        ms = MilestoneState(milestone_id="v0.1")
        assert ms.iteration_count == 0

    def test_iteration_count_increments(self) -> None:
        ms = MilestoneState(milestone_id="v0.1", iteration_count=3)
        assert ms.iteration_count == 3


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
        assert ms.milestone_id == "v0.1"


class TestStreamEvent:
    def test_defaults(self) -> None:
        e = StreamEvent(type="assistant")
        assert e.content == ""
        assert e.raw == {}

    def test_with_content(self) -> None:
        e = StreamEvent(type="result", content="done", raw={"cost": 0.01})
        assert e.type == "result"
        assert e.content == "done"
