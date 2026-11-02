# Current input and runtime qualification

This document records the earlier V2 study and is preserved as historical evidence.
Use the current V3 training guide in docs/checker-training.md for active generation work.

## Current audit, November 2, 2026

The trained candidate is not qualified for deployment.
The [generated runtime audit](experiments/checker-runtime-audit-2026-11-02.json) supersedes the October 23 deployment claim without changing the original receipt.
Run `npm run check:runtime-qualification` to check that this audit still matches the saved training and evaluation records.

The model recovered from Sol matches the saved training and native evaluation records.
The October 23 qualification receipt names a different model digest, a Mac runner, and a Mac platform, while the saved evaluation records a Linux runner on Sol.
Those records cannot establish Mac qualification.

The saved evaluation contains 1,342 cases, including 1,179 correct decisions and 1,342 direct answers without reasoning.
It also contains two harmful approvals among 335 prohibited actions and 122 refusals among 680 permitted actions.
Every saved row lacks the query and action hashes needed to identify the exact evaluated inputs.
A matched frozen evaluation of the original and candidate on the same Mac is not present in these records.

The published npm version 0.1.3 selects the original public model.
Version 0.1.4 selects the November 2 Sol model under an explicit owner-authorized stable release exception and remains unqualified by the normal replacement checks.
Its latest inspected validation introduces two new missed confirmations, so changing the download metadata does not satisfy model replacement requirements.
See the [released model measurements](model-0.1.4.md) for the exact identity, comparison, and verification limits.
A temporary OpenCode 2.2.5 sandbox using the recovered trained candidate produced a direct denial for an explicitly permitted local read.
At that initial audit, the model was not promoted and no new training or Sol job had started.
Subsequent bounded retraining experiments and their release implications are summarized in the [0.1.4 model notes](model-0.1.4.md).
They do not change this deployment qualification decision.

## Historical V2 Qualification (October 16, 2026)

This historical section preserves the earlier V2 pilot measurements where reasoning disagreement was observed before the V3 synthesized fine-tuner was developed.

The official answers-only target and pinned native decoding previously disagreed on the untuned base model.
The target starts directly with the tool-call marker, whereas the native runner produced reasoning before the decision on untuned weights.
All 108 locally tested cases produced reasoning on historical untuned candidates.
The historical measurements in [experiments/current-input-runtime-2026-10-16.json](experiments/current-input-runtime-2026-10-16.json) recorded that superseded no-go result.

The captured official trainer and tokenizer are pinned to source revision `ef3cf7543204d99878c0dd913a05f6a506da4be8`.
The tokenizer hash is checked against the existing four-bit export.
The complete proposed set has 6,644 inputs.
Checking each against all three possible answer targets gives 326 to 691 tokens, a median of 490, and a 95th percentile of 588.
None exceeds 1,024 tokens, but 2,312 exceed 512; silently using 512 would lose evidence.
This size check establishes fit, not correct labels or learning.

The Mac test selects the longest request for each new topic and authored decision contrast, plus twelve long copied cases.
It uses the complete frozen query, all tool descriptions, four threads, a 128-token output limit, and the production 15-second deadline.

| Artifact | Weight bytes | Median seconds | 95th percentile seconds | Maximum seconds | Ambiguous or missing decisions |
| --- | ---: | ---: | ---: | ---: | ---: |
| Shipped base | 35,335,380 | 0.269 | 0.382 | 0.562 | 11 of 108 |
| Matched untuned export | 63,437,076 | 0.191 | 0.322 | 0.548 | 8 of 108 |
| Historical answers-only candidate, rank 16, seed 1 | 63,437,076 | 0.268 | 0.363 | 0.442 | 0 of 108 |

There were no process failures or timeouts in these measurements.
Conflicting decisions are now withheld instead of accepting the first call.
The largest reported memory use was recorded with each artifact in the receipt.
Two measurements ran concurrently on the Mac, so their timings include local contention.
These proposals do not have final human labels, and this table makes no accuracy comparison.
The candidate used historical training inputs and cannot demonstrate improvement from the repaired dataset.

A separate oversized input was rejected as context overflow, returned no tool calls, and finished in 0.163 seconds.
The native runner's overflow-refusal flag must remain enabled.
Inputs that fail or lack a single valid decision must withhold the action.

The practical deployment checks remain: preserve complete evidence, require enough input capacity, retain the 15-second deadline, verify artifact hashes, and accept exactly one decision.
The answers-only format mismatch remains a blocker even though these Mac timings fit the deadline.
No Linux job was submitted for the repaired inputs, and the Mac measurements do not establish Linux or Raspberry Pi performance.
The [Cactus runtime explanation](https://www.cactuscompute.com/blog/porting-needle#the-prompt-on-the-wire) describes the native reasoning prefix and other prompt details that require agreement with training.
