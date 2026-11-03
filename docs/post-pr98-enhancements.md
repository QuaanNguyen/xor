# Runtime checks and remaining requirements

The audit starts from merged PR 98 at `2767fcbbb32684376dcd7a2a9589af2176e27ede`.
GitHub ticket state and qualification evidence are separate.
A closed ticket does not establish model or dataset qualification.

## Completed work and open issues

PR 98 added folder and global Preference editing, automatic npm setup, optional pet controls, and installed OpenCode diagnostics.
The [release report](release-0.1.5-work.md) records those features and their original checks.
PR 99 adds final-action checking, local verdict receipts, and reviewed scenario preparation.
It also updates the desktop dependency lockfile to undici 7.30.1, fixing eight security advisories.

| Work | Ticket | Verified progress | Requirements still open |
| --- | --- | --- | --- |
| Withhold actions when checking fails | [83](https://github.com/QuaanNguyen/xor/issues/83) | Runner failures, active-process cancellation, late approvals, bounded folder deadlines, real interruption, registry reload, and post-module-reload execution have checks. | Cancellation of a checker still running at full module disposal and every host startup failure route are not established by these fixtures. |
| Check the action that runs | [84](https://github.com/QuaanNguyen/xor/issues/84) | Final decoded registered actions are checked once. Real later-hook replacement, complete oversized-input refusal, direct and nested MCP parity, and mixed concurrent verdict routing pass. | Synthesized outer Code Mode execution remains outside the guard. Actual subagent lifecycle coverage remains separate from concurrent-action tests. |
| Save final verdicts locally | [85](https://github.com/QuaanNguyen/xor/issues/85), closed | Default-on atomic receipts exclude denied inputs, suppress duplicates, bind exact production context, and support reviewed-candidate preparation. Required storage failures withhold execution. | Complete for final verdicts issued by the registered-tool guard. Host routes outside that guard remain a coverage limit tracked separately. |
| Add paired shell-permission scenarios | [86](https://github.com/QuaanNguyen/xor/issues/86) | Five patterns have reviewed paired inputs and source-bound native model observations in three real agent formats. Owner decisions and twelve separately reviewed controls restore the redirection pair-count target without changing prior labels. | The new training controls lack native measurements and owner labels. Template overlap, wider human coverage, and training qualification remain separate. |
| Verify OpenCode compatibility | [87](https://github.com/QuaanNguyen/xor/issues/87) | Real lifecycle fixtures pass on official 2.2.0, 2.2.1, 2.2.2, and installed 2.2.5. Registered final actions and direct and nested MCP have observed checks. | Image, scheduling, goal sessions, and the complete native ask experience retain their specific runtime requirements. |
| Cover supported tool contracts | [72](https://github.com/QuaanNguyen/xor/issues/72) | The existing inventory now has six additional source-derived image and schedule contracts with native and Code Mode names distinguished. | Other entries retain their earlier inspection dates. Reviewed decision coverage, held-out per-tool results, dynamic catalogs, and unsupported contracts remain incomplete. |
| Finish free-text Preference adoption | [70](https://github.com/QuaanNguyen/xor/issues/70) | Free-text Preferences, migration, V3 requests, all three verdict tools, and editing are implemented. | Qualified rebuilt data and each harness's required ask experience remain. Current OpenCode ask withholds and hands back rather than proving a native confirmation prompt. |
| Qualify the policy dataset | [90](https://github.com/QuaanNguyen/xor/issues/90), closed | The settings-shell contrast has six exact owner labels. A separate scoped export prepares 384 cases with current-default contrasts, complete target checks, and preserved source identities. | Full-corpus human coverage, fresh blind provenance, full catalog coverage, and a qualified export remain missing. Closure does not satisfy them. |
| Train from a qualified dataset | [91](https://github.com/QuaanNguyen/xor/issues/91) | Existing bounded training and repeated native development evidence remain preserved. | The qualified-export prerequisite remains unsatisfied. The original frozen blind split remains unscored. No new training is claimed here. |
| Replace runtime policy checks | [92](https://github.com/QuaanNguyen/xor/issues/92) | Checks and missing trusted observations are inventoried. New model-only challenge failures reinforce the replacement requirement. | A reviewed trusted-input contract and successful independent replacement evidence are required before removing a check. |
| Make fresh installation permissive | [94](https://github.com/QuaanNguyen/xor/issues/94) | The exact permissive default ships and supported actions remain model checked. | Trusted restrictions remain until replacement qualifies. Qualified default-Preference coverage and broader observed behavior remain required. |

## Final decoded-action checking

The guard checks a registered tool after other before hooks and host argument decoding.
It supplies the private checked argument snapshot to the implementation and saves one final decision.
An earlier read approval cannot authorize a later replacement shell action.
The [design](final-action-design.md) records the alternatives and ownership.
The [implementation guide](final-execution-guard.md) records supported inputs, cancellation, and host limits.

Real OpenCode tests deny the reproduced replacement shell call and leave its marker absent.
Permitted decoded read and shell calls still complete.
Mixed concurrent actions finishing in reverse order retain their own verdicts, receipts, and side effects.
The [MCP receipt](experiments/opencode-mcp-2026-11-03.json) records identical checked inputs through direct and nested paths.
Permitted markers execute once, while outside-project markers have no server execution.
A completed Code Mode wrapper can contain a refused child call, so wrapper completion does not prove that its child ran.

## Folder settings

An owner can create `.xor/settings.json` with `{"gate_timeout_ms": 30000}` for a 30-second checker deadline.
The default is 15 seconds and the maximum is 120 seconds.
Only positive whole milliseconds are accepted.
Unreadable, malformed, or unsupported settings withhold the action.
The existing protection for `.xor` prevents agent tools from changing these settings.
The deadline covers the checker process after it starts.
Verdict receipts record queue wait separately from checker time.

## Local verdict records

Verdict logging is on by default.
Set `"verdict_logging": false` in the folder's `.xor/settings.json` to turn it off.
The checker still runs when logging is off.
Records stay under `~/.config/xor/verdicts`, or the configured XOR settings directory.
The runtime uploads nothing.

Each final checked action has a separate JSON receipt.
Its stable session and call identity, exact arguments, Preference, user request, and complete production-input identity suppress duplicate observations.
Changed checked input, model, or verdict gets a different receipt.
A host without stable call identity cannot release a recorded action while logging is required.
The record includes agent version, selected model digest, argument size and hash, decision, and available timing and production-input metadata.
A deterministic refusal before model startup does not invent a model answer or input hash.

The saved reason uses fixed host rule text.
Runner error text cannot copy denied arguments into that reason.
Only approved calls retain raw arguments.
Denied and unanswered calls retain no raw arguments, and records retain no request or Preference prose.
When logging is enabled, a failed receipt write withholds the action.
The owner can repair the directory or explicitly turn logging off.
An approval receipt records release by XOR, not successful tool completion or approval by another permission system.

## Prepare real calls for independent review

Run this command from a developer checkout:

```sh
node scripts/export-verdict-candidates.js /path/to/verdicts /path/to/contexts.json docs/checker-tool-inventory.json /path/to/new-review-directory
```

The context file is a JSON array.
Each entry supplies `receiptId`, the exact `userMessage`, exact `preference`, `family`, and `split`.
The exporter verifies context and action hashes, rejects production-builder drift, validates the source-pinned tool contract, and checks split separation before writing.
It refuses denied and unanswered receipts because their raw actions were deliberately discarded.
It writes the existing proposals, review packet, and manifest formats without a suggested label.
The resulting data remains unreviewed and ineligible for training.
The existing independent review, human decisions, coverage, blind isolation, and qualified-export requirements still apply.

## Reproduce the native checks

Run these commands with the installed pinned gate and an isolated new evidence directory:

```sh
node scripts/verify-opencode-final-input.mjs --model-root /path/to/installed-gate --output /path/to/new-final-input-evidence
node scripts/verify-opencode-lifecycle.mjs --model-root /path/to/installed-gate --output /path/to/new-lifecycle-evidence
node scripts/verify-opencode-mcp.mjs --plugin-entry /path/to/plugin/xor.js --model-root /path/to/installed-gate --output /path/to/new-mcp-evidence
node scripts/verify-input-overflow.js /path/to/installed-gate
```

The local response fixtures choose fixed agent actions, while the pinned native Needle model supplies model verdicts after trusted boundaries.
The [final-execution receipt](experiments/opencode-final-execution-2026-11-03.json) identifies exact source and script hashes.
The [full-reload follow-up](experiments/opencode-location-reload-followup-2026-11-03.json) observes successful checked execution after the new generation starts.
Earlier version and lifecycle receipts remain unchanged.
No scenario-generated command runs, and these integration checks do not establish model accuracy or replacement qualification.

## Model and dataset evidence

The [five-pattern report](permission-fix-pairs.md) separates harmful approvals, safe refusals, process failures, and unresolved coverage.
It is a same-artifact correctness replay, not a comparison of different models or a speed measurement.
The [settings-shell human receipt](experiments/human-settings-shell-decisions-2026-11-03.json) covers only the six cases the owner labelled.
The [replacement audit](model-policy-replacement.md) retains the missing trusted facts and qualification requirements.
Existing deterministic restrictions remain active.

The [successor fitting report](policy-successor-readiness.md) records the 384-case scoped export and its remaining qualification requirements.
Preparation checks do not authorize the dependent training experiment.

## Verification records

The [decision log](../.audit/post-pr98.tsv) preserves the ordered experiments, failed observations, corrections, and evidence pointers.
The [workflow](../.audit/post-pr98.todo.md) records the completion predicate and remaining requirements.
Final local validation passes 340 Node tests, five Python input-integrity tests, syntax checks, package contents, and the saved runtime-evidence audit.
