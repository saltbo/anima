"""Tests for quota/rate-limit detection in ClaudeCodeAdapter."""

from __future__ import annotations

import pytest

from adapters.agents.claude_code import ClaudeCodeAdapter
from domain.models import QuotaStatus


class TestDetectQuotaState:
    """Verify _detect_quota_state identifies known API error patterns."""

    @pytest.mark.parametrize(
        "text,expected_status",
        [
            ("error: quota exceeded for this billing period", QuotaStatus.QUOTA_EXHAUSTED),
            ("Error: quota exhausted, please upgrade", QuotaStatus.QUOTA_EXHAUSTED),
            ("your spending limit has been reached", QuotaStatus.QUOTA_EXHAUSTED),
            ("you're out of extra usage · resets 12am", QuotaStatus.QUOTA_EXHAUSTED),
            ("billing issue detected", QuotaStatus.QUOTA_EXHAUSTED),
            ("HTTP 429 Too Many Requests", QuotaStatus.RATE_LIMITED),
            ("rate limit exceeded, retry later", QuotaStatus.RATE_LIMITED),
            ("rate_limit_error: slow down", QuotaStatus.RATE_LIMITED),
            ("too many requests in the last minute", QuotaStatus.RATE_LIMITED),
            ("api is overloaded, try again", QuotaStatus.RATE_LIMITED),
        ],
        ids=[
            "quota-exceeded",
            "quota-exhausted",
            "spending-limit",
            "out-of-extra-usage",
            "billing",
            "http-429",
            "rate-limit",
            "rate_limit_error",
            "too-many-requests",
            "overloaded",
        ],
    )
    def test_detects_known_patterns(self, text: str, expected_status: QuotaStatus) -> None:
        """Known error patterns are correctly classified."""
        result = ClaudeCodeAdapter._detect_quota_state(text.lower(), exit_code=1)
        assert result is not None
        assert result.status == expected_status

    def test_returns_none_on_normal_output(self) -> None:
        """Normal agent output produces no quota signal."""
        result = ClaudeCodeAdapter._detect_quota_state("task completed successfully", exit_code=0)
        assert result is None

    def test_rate_limited_has_retry_after(self) -> None:
        """Rate-limited results include a retry_after_seconds hint."""
        result = ClaudeCodeAdapter._detect_quota_state("429 too many requests", exit_code=1)
        assert result is not None
        assert result.retry_after_seconds == 60.0

    def test_quota_exhausted_has_no_retry_after(self) -> None:
        """Quota-exhausted results do not suggest a short retry."""
        result = ClaudeCodeAdapter._detect_quota_state("quota exceeded", exit_code=1)
        assert result is not None
        assert result.retry_after_seconds is None

    def test_exhaustion_takes_priority_over_rate_limit(self) -> None:
        """When both signals appear, quota exhaustion wins."""
        combined = "quota exceeded and also 429 rate limit"
        result = ClaudeCodeAdapter._detect_quota_state(combined, exit_code=1)
        assert result is not None
        assert result.status == QuotaStatus.QUOTA_EXHAUSTED


class TestStructuredRateLimitEvent:
    """Verify structured rate_limit_event parsing."""

    def test_parse_rate_limit_event_extracts_concise_reset_time(self) -> None:
        """resetsAt is converted to concise UTC text in message."""
        event = {
            "type": "rate_limit_event",
            "rate_limit_info": {
                "status": "rejected",
                "resetsAt": 1772254800,
                "rateLimitType": "five_hour",
                "overageStatus": "rejected",
                "overageDisabledReason": "out_of_credits",
                "isUsingOverage": False,
            },
        }
        result = ClaudeCodeAdapter._parse_rate_limit_event(event)
        assert result is not None
        assert result.status == QuotaStatus.QUOTA_EXHAUSTED
        assert "resets 2026-02-28 05:00 UTC" in result.message

    def test_parse_rate_limit_event_rate_limited_sets_retry_after(self) -> None:
        """A limited status maps to RATE_LIMITED with retry hint."""
        event = {
            "type": "rate_limit_event",
            "rate_limit_info": {
                "status": "limited",
                "resetsAt": 9999999999,
                "rateLimitType": "five_hour",
            },
        }
        result = ClaudeCodeAdapter._parse_rate_limit_event(event)
        assert result is not None
        assert result.status == QuotaStatus.RATE_LIMITED
        assert result.retry_after_seconds is not None
        assert result.retry_after_seconds > 0
