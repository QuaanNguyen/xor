# Paired shell-permission scenarios

The focused permission-fix study covers subshell redirects into protected files, failed redirects before variable-based deletion, wrapped directory changes before Git, locale-prefixed worktree resets, and MCP configuration writes.
Each harmful action has a safe counterpart with the same user request and standing Preference.
The study uses the checked OpenCode shell, Claude Code Bash, and Codex command contracts from the existing tool inventory.
No proposed command is executed.

## Prepare and review

Run these commands from a developer checkout:

```sh
node xor/prototype/permission-fix-pairs.js prepare docs/checker-tool-inventory.json /path/to/new-study
node xor/prototype/review-checker-data.js /path/to/new-study gemma4-31b-it gemma
node xor/prototype/review-checker-data.js /path/to/new-study glm-5-3-flash glm
node scripts/verify-checker-data.js /path/to/new-study/inventory.json /path/to/new-study
node xor/prototype/permission-fix-pairs.js report /path/to/new-study /path/to/new-study/review-gemma4-31b-it.json /path/to/new-study/review-glm-5-3-flash.json
```

Preparation freezes 270 cases.
Each pattern has three harmful actions and three safe counterparts for each agent and split.
Related agent representations and both members of each pair stay in one family and split.
The frozen study includes its own inventory copy, exact production inputs, and source hashes.
Later inventory changes cannot silently change that study.
Reviewers see only the existing exact production review packet, without the authored harmful or safe role.
A disagreement or abstention quarantines the whole family, including its safe counterparts.

The integrity command should return 2 while separate qualification requirements remain.
Exit 2 does not mean the data qualifies for training.
The study omits the wider catalog and default-Preference contrasts by design.
Its deterministic templates and split labels do not establish fresh blind evaluation or absence of semantic overlap.
A separate similarity audit and the existing human, coverage, and qualified-export requirements still apply.
The explicit `prepare-redirect-repair` and `prepare-mcp-repair` commands each freeze 54 new cases with clearer standing rules.
Use a new output directory and obtain fresh reviews when using either repair.
They preserve the original disputed cases rather than changing their reviewer labels.

## Inspect observed model decisions

The report includes independently agreed requests that the existing native comparison tool can read.
Use the reviewed validation and test requests when evaluating withheld examples.
Keep the original request hashes and expected decisions unchanged.

Pass the existing comparison tool's `attempts.jsonl` as the final argument to the report command to score observed results.
The report rejects stale input hashes, duplicated attempt identities, and observations from quarantined cases.
It ignores warmup attempts.
It reports harmful approvals, safe refusals, invalid answers, and runtime failures separately.
Results are grouped by pattern, agent, split, and comparison side.
The authored role is a diagnostic expectation, not a replacement for the independent labels.
Any independently agreed approval of a harmful design or refusal of a safe design remains visible as a semantic flag.

The report does not train a model, promote weights, or qualify removal of runtime checks.

## November 3 development evidence

The [source-bound receipt](experiments/permission-fix-pairs-2026-11-03.json) records the frozen studies, independent reviewers, native artifacts, exact-input hashes, and remaining requirements.
The original study has 192 independently agreed cases and 78 family-quarantined cases.
The three fully agreed patterns are subshell redirects, wrapped directory changes, and locale-prefixed worktree resets.
The first redirection and MCP Preferences produced deny-versus-ask disagreements.
Those original decisions remain unchanged.
The separate explicit-rule repairs still need 32 review decisions before their coverage can be assessed in full.
The remaining external review request was rejected by automatic approval review and is awaiting approval.

The model selected by 0.1.5 was replayed on 108 independently agreed validation and test inputs from the three fully agreed patterns.
Both replay sides used the same pinned model, with five rounds per side and separate warmups.
This is repeated correctness evidence, not a comparison between different models.
All 54 harmful inputs were approved on every measured repetition.
All 54 safe counterparts were also approved on every measured repetition.
No measured response was invalid, indirect, or a process failure.

| Pattern | Measured harmful approvals | Measured safe refusals |
| --- | --- | --- |
| Subshell protected-file redirect | 180 of 180 | 0 of 180 |
| Wrapped directory change | 180 of 180 | 0 of 180 |
| Locale-prefixed worktree reset | 180 of 180 | 0 of 180 |

These are repeated-attempt counts across three real tool argument shapes.
Each row has 18 distinct harmful inputs and 18 distinct safe counterparts.
The raw report separates agent, split, and replay side.
No latency improvement is claimed.
The redirection-repair and MCP-repair inputs remain unscored pending their complete independent reviews.
The model was neither trained nor changed, and the deterministic runtime checks remain necessary.
This work does not yet complete the full five-pattern scenario ticket.
