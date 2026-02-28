# Module Health — Contract

## Purpose

Score the health of each pipeline module by combining structural
completeness (contract, spec, core, tests) with runtime reliability
(fallback rate from wiring health data). Produces a `HealthReport`
that downstream consumers (gap analyzer, auto-rewrite trigger) use to
identify degraded modules.

## Interface

```python
def score_health(
    modules: tuple[ModuleInfo, ...],
    health_stats: dict[str, Any],
    timestamp: str,
) -> HealthReport
```

## Input

| Parameter      | Type                       | Description                                    |
|----------------|----------------------------|------------------------------------------------|
| modules        | tuple[ModuleInfo, ...]     | Module metadata from scanner                   |
| health_stats   | dict[str, Any]             | Runtime stats from wiring health.json           |
| timestamp      | str                        | ISO-8601 timestamp for the report              |

## Output

| Field          | Type                           | Description                               |
|----------------|--------------------------------|-------------------------------------------|
| HealthReport   | HealthReport                   | Aggregated scores for all modules         |

## Dependencies

None — pure function, no ports required.

## Constraints

1. Must be a pure function with no I/O.
2. Scores are floats in [0.0, 1.0].
3. Status thresholds: >= 0.7 HEALTHY, >= 0.4 DEGRADED, < 0.4 CRITICAL.
4. Structural completeness accounts for 60% of score.
5. Runtime reliability accounts for 40% of score.
6. Modules with no runtime data default to 1.0 reliability.
