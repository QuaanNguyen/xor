# Model policy training data

This successor study prepares policy decisions for the fine-tuned model instead of treating every protected path or delegation as a universal prohibition.
It does not remove existing runtime checks or qualify a replacement model.
PR #98 also implements installation, Preference editing, and optional pet controls.
Those product changes do not grant dataset or model qualification.

## Scope

The planner creates 180 model-authoring tasks in 60 families across training, validation, and test.
It uses four existing checked OpenCode tool contracts: reading, writing, shell commands, and delegation.
Each of the eight policy topics has two action shapes, including a shell shape for operations such as reads, writes, deletion, renaming, and permission changes.
Each policy family requests permitted, prohibited, and confirmation-required situations with identical tool arguments and different authorization.
Those requests are authoring guidance, not labels.
The author must use permissive normal-harness Preferences among permitted scenarios rather than copying the current restrictive default.
The original study retained the installed default while preparing its data.
The permissive companion below pins the exact text now used by the runtime default.
The earlier restrictive default families remain historical evidence and do not become permissive examples.
An additional 18-case companion study uses the exact proposed permissive text for its six requested approvals and matched deny/ask counterparts.
Its labels still come from independent reviews rather than the requested conditions.
The 36-case mutations profile adds direct deletion, renaming, and permission changes to actual `.xor` settings paths.
It is separate because operation inspection found those actions absent from the broader examples.

The eight added topics are:

| Topic | Examples to distinguish |
| --- | --- |
| Project boundaries | Authorized cross-folder work versus prohibited or confirmation-required access. |
| Traversal and aliases | Relative paths, misleading folder prefixes, working directories, and explicitly visible alias facts. |
| Preference protection | Reading settings versus changing, deleting, renaming, or changing their permissions. |
| Owner authorization | An owner's explicit settings request versus an agent trying to relax its own rules. |
| Delegation | Allowed scope, prohibited delegation, and a requirement to obtain confirmation first. |
| Action visibility | Complete actions versus unresolved destinations or missing permission facts. |
| Permission authority | Current requests, standing prohibitions, separate confirmation requirements, and instructions embedded in action data. |
| Completion evidence | Permission to write truthful status versus claiming success without visible evidence. |

## Create a successor

Use a new directory and retain the canonical inventory and all historical studies.

```sh
node xor/prototype/model-policy-study.js docs/checker-tool-inventory.json /tmp/new-model-policy-study
node xor/prototype/author-checker-data.js author /tmp/new-model-policy-study 40
node xor/prototype/author-checker-data.js freeze /tmp/new-model-policy-study /tmp/new-model-policy-review
node xor/prototype/review-checker-data.js /tmp/new-model-policy-review gemma4-31b-it gemma
node xor/prototype/review-checker-data.js /tmp/new-model-policy-review glm-5-3-flash glm
node scripts/verify-checker-data.js /tmp/new-model-policy-study/inventory.json /tmp/new-model-policy-review
node scripts/audit-model-policy-data.js /tmp/new-model-policy-study /tmp/new-model-policy-review
```

Generate the permissive companion in separate new directories.

```sh
node xor/prototype/author-checker-data.js plan docs/checker-tool-inventory.json xor/prototype/config/checker-authoring-permissive-policy.json /tmp/new-permissive-policy-study
node xor/prototype/author-checker-data.js author /tmp/new-permissive-policy-study 12
node xor/prototype/author-checker-data.js freeze /tmp/new-permissive-policy-study /tmp/new-permissive-policy-review
node xor/prototype/review-checker-data.js /tmp/new-permissive-policy-review gemma4-31b-it gemma
node xor/prototype/review-checker-data.js /tmp/new-permissive-policy-review glm-5-3-flash glm
node scripts/verify-checker-data.js /tmp/new-permissive-policy-study/inventory.json /tmp/new-permissive-policy-review
node scripts/audit-model-policy-data.js /tmp/new-permissive-policy-study /tmp/new-permissive-policy-review --permissive
```

Confirm the actual six approval inputs contain the exact intended text and that both reviewers approve them.
Do not infer that result from the companion configuration.
The permissive audit rejects appended author instructions rather than treating a matching prefix as the default Preference.

Create the focused settings-mutation study with the same planner and audit workflow.

```sh
node xor/prototype/model-policy-study.js docs/checker-tool-inventory.json /tmp/new-policy-mutations mutations
```

Use the author, freeze, independent review, and policy audit commands above with that study's paths.
The mutation audit requires actual direct settings mutations in all nine cases per operation.
Those 27 topic cases are accompanied by nine ordinary shell baseline cases in the 36-case study.
It checks derived write or delete targets without running the commands.
It does not count `echo rm`, a read-only command, or an unrelated deletion followed by printed settings text as a settings mutation.

The `repair` profile creates new owner-authorization and action-visibility cases with explicit actor roles and named prohibitions.
The separate rename-repair configuration can use the mutations study's pinned inventory to fill an excluded rename family.
Audit a standard authoring supplement without a policy-planning receipt using `--supplement`.
Preserve all original snapshots and review decisions when creating these corrective studies.

The audit flags a mismatch between authoring intent and independent review for further semantic review.
It excludes the complete family from policy coverage without changing the saved verdict or assuming the author's intent was correct.
The summary command revalidates each report, excludes disputed and flagged families, detects exact duplicate inputs, and reports policy-group coverage separately from detailed action-shape gaps.

```sh
node scripts/summarize-model-policy-data.js /absolute/path/to/main-report.json /absolute/path/to/companion-report.json
```

The result is an index of reviewed candidate inputs, not a training export or a qualified model.

The planner saves the successor inventory and its source digest, generation limits, required topics, and missing runtime facts.
It never changes the active-study selection.
Authoring uses the existing Mac ASU configuration and saves checkpoints and raw model receipts.
Keep credentials on the Mac and never execute generated actions.
Reviewers see exact production inputs without intended permission conditions or each other's answers.
Disputed, missing, or abstained decisions exclude the whole family.
Use actual independently agreed decisions when reporting topic coverage.
The policy audit excludes unmatched action families from its topic counts, even if both reviewers agree.
Its counters measure matched action and reviewed decision coverage, not semantic completeness of every operation described in a topic.
Inspect actual actions for read/write/delete/rename/permission variants before claiming those distinctions are represented.

This is a supplemental dataset, so the full-product verifier still reports missing catalog coverage and training requirements.
Both audit commands use exit 2 for unfinished training requirements; it does not by itself mean the snapshot is corrupt.
See the [training requirements](checker-training.md) before export or fitting.

## Prepare a scoped fitting experiment

The selected-family exporter revalidates the index and each archived source against its own pinned inventory.
It verifies selected tool schemas against the canonical inventory and adds complete reviewed original families for shipped-default coverage.
It preserves the index's exclusions and every selected family's original split.

```sh
node scripts/prepare-policy-finetune.js /absolute/path/to/dataset-index.json xor/prototype/output/v3-integrated-2026-10-23 docs/checker-tool-inventory.json /tmp/new-policy-fitting-export
```

The recorded November 2 export contains 306 examples: 100 training, 100 validation, and 106 test cases.
Its scope is the four checked OpenCode tool contracts used by the policy study.
The export archives source receipts and writes a selected audit view for overlap checks.
The audit view is not a newly reviewed combined snapshot.
The fitting manifest explicitly keeps human, blind, full-product, runtime-replacement, and promotion qualification false.

Freeze the fitting data, source files, assets, and study plan before running the existing training preflight on Sol.
Use the preflight-enforcing study wrapper rather than calling the trainer directly.
Keep gateway credentials on the Mac.
Training data stays inert, including commands describing destructive or network actions.

The native comparison helper pins both models, the runner, the requests, the production gate source, and its own source.
It uses at least five paired rounds, preserves warmup and failed attempts, and defaults to the production thread setting.

```sh
node scripts/benchmark-policy-models.js plan /absolute/path/to/specification.json /tmp/new-comparison-plan.json
node scripts/benchmark-policy-models.js run /tmp/new-comparison-plan.json /tmp/new-native-comparison
```

Correctness and safety regression checks precede any performance or replacement claim.
Report timing as inconclusive if the workload, settings, or limiting work cannot be established.

## Missing runtime facts

The current input contains a Preference, the latest user message, the action, and derived effects.
The following distinctions cannot be supplied by more examples alone.

| Check | Missing observation or host responsibility |
| --- | --- |
| Actual folder containment | Project root, resolved paths, symlink destinations, and platform path rules. |
| Settings protection and tampering | Trusted protected-file identities, actor provenance, and before/after change history. |
| Delegation inheritance | Evidence that the child receives and enforces the same Preference. |
| Contract validity | Checked tool contract and explicit effect-analysis uncertainty. |
| Unreadable Preference | Actual read and parse status before a valid model request exists. |
| Completion and repeated failures | Completion event, criteria, observed results, and retry history. |
| Model failure | Host behavior when the model is missing, times out, or returns an unusable answer. |

A user's prose about a filesystem fact is not a trusted filesystem observation.
Writing a status file is not the current completion-review event.
The new examples cover visible authorization decisions about these subjects, not their absent runtime state.
A future observed-context contract requires a new input version and fresh exact-input reviews before these runtime checks can be compared against model-only decisions.
The host still needs request parsing, response parsing, and failure handling even if policy decisions move into the model.

## Acceptance

Dataset integrity, reviewed topic coverage, human verification, blind evaluation, model quality, and runtime replacement are separate results.
Split names do not establish blind isolation.
Do not treat these generated validation or test families as untouched promotion evidence after using them for dataset development.
Model-only evaluation must measure harmful approvals, missed confirmations, permitted-action refusals, invalid answers, and runtime failures separately.
Boundary refusals from the current code do not count as correct model predictions.
Replacing runtime policy checks requires actual model decisions on matched frozen inputs and end-to-end observation in OpenCode.
