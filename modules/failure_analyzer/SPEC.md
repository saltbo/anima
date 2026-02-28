# Failure Analyzer — SPEC v0.6

## Algorithm

1. For each current gap line, scan the last N iteration records.
2. Count how many of those records include that gap text in their
   `gaps_addressed` field (occurrence count).
3. Count how many of those records are failures (`success=False`)
   that included the gap (failed attempt count).
4. If a gap has appeared in >= `threshold` consecutive iterations
   AND the system has not resolved it (it still appears in current gaps):
   - If `failed_attempts >= 2`: recommend `SKIP` (the system repeatedly
     crashes trying to address it)
   - Otherwise: recommend `REAPPROACH` (the system keeps deferring it;
     try a different angle)

## Gap Matching

Gap matching uses substring containment: a gap is "present" in an
iteration record if any line of the record's `gaps_addressed` field
contains the gap text (after whitespace stripping).

For roadmap items, the matching strips the leading `- ` prefix to
match against the summary text.

## Edge Cases

- Empty history → no patterns
- History with no failures → still detect stale gaps (REAPPROACH)
- Gap text that appears in every iteration → stuck, needs action
