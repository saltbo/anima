"""
kernel/config.py — Project paths and configuration constants.

All path constants and system settings live here. Other kernel modules
and seed.py import from this file.
"""

from __future__ import annotations

from pathlib import Path

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

ROOT = Path(__file__).parent.parent.resolve()
VISION_FILE = ROOT / "VISION.md"
SOUL_FILE = ROOT / "SOUL.md"
STATE_FILE = ROOT / ".anima" / "state.json"
ITERATIONS_DIR = ROOT / "iterations"
INBOX_DIR = ROOT / "inbox"
MODULES_DIR = ROOT / "modules"
DOMAIN_DIR = ROOT / "domain"
ADAPTERS_DIR = ROOT / "adapters"
KERNEL_DIR = ROOT / "kernel"
ROADMAP_DIR = ROOT / "roadmap"
README_FILE = ROOT / "README.md"

# ---------------------------------------------------------------------------
# System settings
# ---------------------------------------------------------------------------

# How long to wait between iterations in continuous mode (seconds)
ITERATION_COOLDOWN = 10

# Max consecutive failures before pausing and waiting for human
MAX_CONSECUTIVE_FAILURES = 3

# Agent command — change this if using a different agent
AGENT_CMD = "claude"

# Protected paths that the agent must not modify
PROTECTED_PATHS = [
    "VISION.md",
    "kernel/",
]

# ---------------------------------------------------------------------------
# README marker constants
# ---------------------------------------------------------------------------

STATUS_START = "<!-- anima:status:start -->"
STATUS_END = "<!-- anima:status:end -->"
STAGE_START = "<!-- anima:stage:start -->"
STAGE_END = "<!-- anima:stage:end -->"
PROGRESS_START = "<!-- anima:progress:start -->"
PROGRESS_END = "<!-- anima:progress:end -->"
