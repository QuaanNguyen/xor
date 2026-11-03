# Enhancement work after PR 98

Checked November 3, 2026 against merged commit `2767fcbbb32684376dcd7a2a9589af2176e27ede`.
GitHub ticket state and qualification evidence are separate.
A closed ticket does not establish that a model or dataset passed its qualification requirements.

## What the release completed

[PR 98](https://github.com/QuaanNguyen/xor/pull/98) added folder and global Preference editing, automatic npm setup, optional pet controls, and installed OpenCode diagnostics.
It closed the product tickets for Preference editing, setup, pet controls, and diagnostics, together with the broader policy-training ticket.
The release record describes these changes and their checks in [the implementation report](release-0.1.5-work.md).
Those checks do not qualify the selected model for replacing runtime restrictions.

## Remaining requirements

| Work | Ticket | Existing evidence | What still needs to pass |
| --- | --- | --- | --- |
| Block actions when the checker fails | [83](https://github.com/QuaanNguyen/xor/issues/83) | Runner failure tests withhold actions for failed startup, timeout, crash, and invalid answers. This branch also tests process shutdown and late approvals after plugin disposal. | Real OpenCode interruption, a one-millisecond deadline, and tool-registry reload pass with blocked markers absent. Full plugin-module replacement remains untested. |
| Check the action that actually runs | [84](https://github.com/QuaanNguyen/xor/issues/84) | The production builder includes complete arguments and enables native input-overflow refusal. | Separate observed results for retries, long harmful tails, later hook rewrites, direct and nested MCP calls, and mixed parallel calls. This branch adds separate queue and checker timing to verdict events. |
| Save final verdicts locally | [85](https://github.com/QuaanNguyen/xor/issues/85) | The owner chose logging on by default, with an off setting, in the ticket discussion. | This branch adds durable receipts, final-only writes, denied-content exclusion, metadata, and a context-checked candidate exporter. Real OpenCode produced four expected receipts. Full plugin-module replacement and storage-failure observation remain separate checks. |
| Add paired shell-permission scenarios | [86](https://github.com/QuaanNguyen/xor/issues/86) | The ticket specifies five harmful patterns and safe counterparts. | Several reviewed pairs per pattern and supported agent, held-out variations, and separate harmful-approval and safe-refusal results. |
| Verify current OpenCode behavior | [87](https://github.com/QuaanNguyen/xor/issues/87) | PR 98 records installed OpenCode 2.2.5 startup, registered hooks, native verdict smoke checks, and an observed harmless read. | Version-specific 2.2.0, 2.2.1, and 2.2.2 checks, real reload, direct and nested MCP, supported image and scheduling tools, and goal or scheduled sessions. The installed probe does not prove agent-generated tool selection. |
| Train from a qualified dataset | [91](https://github.com/QuaanNguyen/xor/issues/91) | Saved bounded training and repeated native development comparisons identify the inputs, models, runner, platform, and decisions. | A qualified export before the requested experiment, fresh blind evidence, and separate error and runtime results. |
| Replace runtime policy checks | [92](https://github.com/QuaanNguyen/xor/issues/92) | The replacement audit inventories checks and missing trusted facts, and preserves five newly unsafe model approvals. | A reviewed input contract for trusted observations and independent model-only evaluation before removing each check. |
| Make fresh-installation behavior permissive | [94](https://github.com/QuaanNguyen/xor/issues/94) | The exact permissive default ships, checking stays active, and the installed hooks allowed a harmless read. | Coverage of the shipped default in qualified training and evaluation, and broader observed behavior after runtime-check replacement qualifies. Preference wording alone cannot establish this result. |
| Cover each supported tool | [72](https://github.com/QuaanNguyen/xor/issues/72) | A source-pinned inventory records schemas, hookability, and explicit gaps. | Refresh the October 19 inventory, independently review missing decision contrasts, report held-out results per tool and agent, and retain non-hookable gaps. |
| Complete free-text Preference adoption | [70](https://github.com/QuaanNguyen/xor/issues/70) | V3 inputs, free-text Preferences, migration, and three verdict tools are implemented. | Rebuilt qualified data and the required observed ask behavior for each harness. The shipped OpenCode hand-back path does not establish a native confirmation prompt. |
| Qualify the policy dataset | [90](https://github.com/QuaanNguyen/xor/issues/90), closed | Six independently reviewed successor examples repair the owner-settings shell contrast. | Case-bound human verification, fresh blind provenance, full catalog coverage, and a qualified export remain missing according to the merged evidence. Ticket closure does not satisfy them. |

## Execution order

1. Verify checker failure handling and final-input interception together before changing runtime policy ownership.
2. Complete local verdict logging with privacy and retry checks before exporting real calls as candidate data.
3. Refresh tool and shell-pattern coverage, preserving family separation and independent review.
4. Obtain the required human decisions and qualified export before the dependent training experiment.
5. Evaluate a new candidate on frozen blind inputs and resolve the saved unsafe approvals before replacing any runtime check.
6. Verify broader fresh-installation behavior after replacement qualifies.

Real OpenCode checks should accompany the runtime units they exercise.
Documentation and ticket updates should name the specific observed result and the remaining requirement.
Do not replace unavailable evidence with passing unit tests or release authorization.

## Evidence sources

The [replacement report](model-policy-replacement.md) records dataset identities, native comparisons, missing trusted facts, and successor limits.
The [runtime qualification record](current-runtime-qualification.md) distinguishes release authorization from normal model qualification.
The [tool inventory](checker-tool-inventory.json) explicitly separates schema evidence from integration verification.
The runtime failure tests are in `test/xor/gate-failures.test.js`.
The production gate and OpenCode hooks are in `xor/lib/gate.js` and `plugin/xor.js`.

## Checker deadlines and cancellation

An owner can create `.xor/settings.json` with `{"gate_timeout_ms": 30000}` to use a 30-second checker deadline in that folder.
The default is 15 seconds and the maximum is 120 seconds.
Only positive whole milliseconds are accepted.
An unreadable, malformed, or unsupported settings file withholds the action.
The existing protection for `.xor` prevents agent tools from changing these settings.
The limit covers the checker process after it starts, while verdict events record queue wait separately.

Plugin disposal, session deletion, observed cancellation or error status, and a supplied tool cancellation signal cancel active checks.
The checker process receives a forced stop, and a late approval cannot release a cancelled action.
These are executable adapter and child-process checks.
They do not establish that every OpenCode interruption route supplies the expected event or signal.
Real reload and interruption observation remain required before closing the failure-handling ticket.

## Local verdict records

Verdict logging is on by default.
An owner can set `"verdict_logging": false` in the folder's `.xor/settings.json` to turn it off.
The checker still runs when logging is off.
Records stay under `~/.config/xor/verdicts`, or the configured XOR settings directory.
The plugin uploads nothing.

Each completed checked call has a separate JSON receipt.
A stable session and call identity, exact argument hash, Preference hash, and user-request hash identify duplicate checks across reloads.
A changed checked input gets a different receipt.
Calls without a host call identity cannot receive a durable receipt.
The record includes the agent version, selected model digest when available, decision, argument size and hash, complete production-input hash and version when the checker ran, and checker timing.
The reason uses fixed host rule text, so runner errors cannot copy denied arguments into a saved reason.
Only approved calls retain their arguments.
Denied and unanswered calls retain no raw arguments.
The log does not retain request or Preference prose.

To prepare approved calls for review from a developer checkout, run:

```sh
node scripts/export-verdict-candidates.js /path/to/verdicts /path/to/contexts.json docs/checker-tool-inventory.json /path/to/new-review-directory
```

The context file is a JSON array.
Each entry supplies the receipt ID, exact original user request, exact Preference, family, and split.
Use the fields `receiptId`, `userMessage`, `preference`, `family`, and `split`.
The exporter compares the context and saved action hashes, rejects production-builder drift, validates the real tool contract, and checks split separation before writing anything.
It refuses denied and unanswered receipts because their actions were deliberately discarded.
It writes the existing proposal, independent-review packet, and manifest formats without a suggested model label.
The resulting data remains unreviewed and ineligible for training.
Independent review, human decisions, coverage, blind isolation, and the existing qualified-export checks still apply.

The isolated OpenCode 2.2.5 native hook diagnostic produced one approved-read receipt with the selected model digest, full production-input hash, and separate timing fields.
This diagnostic invokes the registered hooks directly after real startup.
The adapter also accepts the real host's action identity field, as verified against the pinned executable and adapter tests.
These checks do not establish complete agent-selected tool coverage or every interruption route.
A storage error reports that the receipt could not be saved and does not change the checker's decision.

## Reproduce the native checks

Run `node scripts/verify-opencode-lifecycle.mjs --model-root /path/to/installed-gate --output /path/to/new-evidence-directory` with OpenCode 2.2.5 available.
The local response fixture supplies fixed agent tool choices, while the pinned native Needle model checks them.
The script verifies an allowed read, a blocked interrupted shell write, a blocked deadline-exceeded shell write, and a read spanning tool-registry reload.
Both blocked marker files remain absent.
The [saved lifecycle receipt](experiments/opencode-lifecycle-2026-11-03.json) records the exact source hashes and limitations.

Run `node scripts/verify-input-overflow.js /path/to/installed-gate` to check the complete oversized action against the native runner.
The [saved overflow receipt](experiments/runtime-input-overflow-2026-11-03.json) records native context refusal with the prohibited marker tail preserved and no marker created.
Neither check runs a scenario-generated command or establishes model accuracy.
