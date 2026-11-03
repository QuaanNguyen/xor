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

## November 3 evaluation

The [initial partial receipt](experiments/permission-fix-pairs-2026-11-03.json) remains preserved.
The separate [five-pattern evaluation receipt](experiments/permission-fix-pairs-evaluation-2026-11-03.json) records complete independent reviews, explicit whole-family selection, native model observations, and the remaining coverage gaps.
The original study has 192 independently agreed cases and 78 quarantined cases.
The redirection repair has 30 independently agreed cases and 24 quarantined cases.
The MCP repair has 54 independently agreed cases and no quarantined cases.
No reviewer decision or frozen split was changed.

The evaluation selection contains 246 cases.
It uses the original subshell, wrapped-directory, and locale families, together with independently agreed redirection and MCP repair families.
The exact selected family and case identities are recorded in the receipt.
The 174 selected validation and test inputs were replayed with the same pinned 0.1.5 model on both sides, five times per side, with separate warmups.
This is repeated correctness evidence for one artifact.

| Pattern | Distinct harmful inputs | Distinct safe inputs | Measured harmful approvals | Measured safe refusals |
| --- | ---: | ---: | --- | --- |
| Subshell protected-file redirect | 18 | 18 | 180 of 180 | 0 of 180 |
| Wrapped directory change | 18 | 18 | 180 of 180 | 0 of 180 |
| Locale-prefixed worktree reset | 18 | 18 | 180 of 180 | 0 of 180 |
| Failed redirection before variable-based deletion | 15 | 15 | 0 of 150 | 150 of 150 |
| MCP configuration write | 18 | 18 | 0 of 180 | 180 of 180 |

The raw audit checks all 1,740 measured responses against the production verdict parser and exact request hashes.
Every repair response is a direct denial, including all 33 distinct safe repair inputs.
There are no invalid answers, indirect answers, or process failures in these measurements.
The report separates agent, split, and replay side.
The raw audit includes 30 source-linked request and response samples.
No latency improvement is claimed.
The native model classified inert requests, and no proposed command was executed.
The production runtime's deterministic checks remain active.

## Remaining coverage and human review

The independent-review selection has no agreed redirection training cases and only two validation pairs per agent.
It therefore misses the study's planned three pairs per agent and split.
The original study has one separate fully agreed redirection training family, containing one harmful and one safe action for each agent.
Its exact case identities and labels are recorded separately as an available training supplement.
It does not meet the planned three-variation target by itself.
That independent-review selection and its twelve count gaps remain preserved in the evaluation receipt.

## Owner-adjudicated redirection view

The [separate human coverage report](experiments/human-redirection-coverage-2026-11-03.json) validates the owner's 24 exact-input decisions against the existing human receipt contract.
The owner supplied 18 approve labels and six ask labels, with no deny labels.
Together with 30 unchanged independently agreed cases, the new view contains 33 approve, 15 deny, and six ask cases.
The report preserves the original independent reviews and their 24 quarantined cases.

Six training cases originally authored as harmful are owner-approved.
They remain permitted examples in the new view.
Two training families now have approve labels for both proposed actions.
Those families do not provide a permitted-versus-withheld contrast.
The owner-adjudicated view has one complete training pair per agent, leaving two of the planned three pairs missing.
Validation and test each have three complete pairs per agent.
The report lists all six residual training-pair gaps and every authored-role mismatch by exact case identity.

Six owner-labelled validation inputs had no previous native observations.
A local replay recorded 60 measured responses and 12 separate warmups for those exact inputs.
Together with the existing observations, all 36 resolved redirection evaluation inputs now have ten measured responses each.
The model denied every one of the 360 measured actions.
That includes 180 refusals of permitted actions and 30 denials where the owner required ask.
There were no harmful approvals, bypassed confirmations, invalid answers, indirect answers, or process failures.
Training cases without native observations remain explicitly unmeasured.

The owner decisions cover only the 24 displayed inputs.
Corpus-wide human verification, qualified export, fresh blind evaluation, and runtime replacement remain incomplete.
No model was trained or changed.


## Bounded retained-cache training controls

The [separate training-control receipt](experiments/redirection-training-controls-2026-11-03.json) records twelve new inputs in a new study namespace.
They provide two additional training pairs in each of the three native agent formats.
A failed diagnostic redirect leaves an empty variable, and an explicit fallback then chooses an existing writable retained-record cache outside the requested build cache.
The standing Preference forbids removing those retained records.
The safe counterpart removes only the requested build cache or stops when lookup fails.
The commands remain inert data.

Prepare this bounded supplement with:

```sh
node xor/prototype/permission-fix-pairs.js prepare-training-controls docs/checker-tool-inventory.json /path/to/new-training-controls
```

Preparation freezes the exact input hashes and a twelve-case plan before review.
The plan allows six two-input requests per reviewer, no retries, and no additional cases.
Gemma and GLM each reviewed all twelve inputs once, with zero errors.
They independently agreed on six deny controls and six approve counterparts.
The existing production-input integrity check passed.

The separate supplemented redirection view contains 66 cases, with 39 approve, 21 deny, and six ask labels.
It preserves all six owner-approved cases that had originally been authored as harmful.
It also preserves the original independent reviews and exclusions.
Each agent now has three complete permitted-versus-withheld pairs in training, validation, and test.
The two extra positive-only training families remain present.
The receipt binds the old source hashes, every new exact input, both review records, and the before/after pair counts.

All 292 repository tests passed, including an actual CLI check that leaves retained marker files and prior owner-label files unchanged.
The new controls have no native model measurements and no case-bound owner labels.
No model was trained or changed.
The scoped pair-count target is recovered, while full catalog coverage, qualified export, human verification, fresh blind evaluation, and runtime replacement remain separate requirements.
