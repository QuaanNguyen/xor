# Checker training methods and evidence

The current model is not qualified to replace the deterministic runtime checks.
A release exception selects model bytes for packaging without satisfying dataset, experiment, or promotion requirements.
The [runtime qualification record](current-runtime-qualification.md) and [model replacement audit](model-policy-replacement.md) describe those requirements and the saved evidence.

## Training methods

The model receives one user request, one free-text Preference, and one complete proposed tool call.
The target is one direct approve, deny, or ask answer without reasoning.
The production request builder supplies the exact tool declarations used for review and evaluation.
Changing that input requires fresh source-bound review rather than relabelling an old snapshot.

The [synthesized trainer](../scripts/finetune_v3_synthesized.py) can weight verdict-name tokens more than syntax tokens.
Optional normalization divides the decision weight across the tokens in that verdict.
Class balancing can also change an example's weight.
These settings describe the loss calculation and do not establish an accuracy improvement.

The trainer supports adapters on attention and optional conditioning projections.
The frozen study records adapter rank, scale, target projections, and optimization settings.
A configurable cost table penalizes harmful approvals and missed confirmations.
Its presence does not prove those errors disappear.
Native model decisions must measure the actual result.

## Tokenizer and target integrity

Training requires explicit tokenizer-model and native-archive hashes.
The tokenizer vocabulary and scores must match the pinned native archive.
Verdict token identities come from that tokenizer, rather than a fixed numeric list.
An oversized example is rejected before any answer or supervision tokens can be lost.
The target must contain the complete verdict sequence.

Run the CPU checks without starting training:

```sh
python3 test/unit/synthesized-trainer.test.py
python3 scripts/preflight-checker-training.py /path/to/frozen-study /path/to/new-preflight.json
```

The preflight reads the study's pinned trainer, files, tokenizer, and assets.
It checks every answer target, capacity, split identity, and supervised decision position.
Its successful status means admission for a scoped experiment.
It does not establish a qualified full-product export, fresh blind isolation, or model promotion.
Use a new output path to preserve earlier evidence.

Inside the pinned training environment, inspect the current command interfaces before constructing a study invocation:

```sh
python3 scripts/finetune_v3_synthesized.py train --help
python3 scripts/finetune_v3_synthesized.py build --help
```

The training command requires the recorded tokenizer model, tokenizer digest, native tokenizer archive, and native tokenizer-blob digest.
Use the frozen study values.
Do not substitute another local tokenizer or copy an old unpinned command.
The experiment tracked by the training ticket still requires its qualified dataset export before launch.

## Current measured evidence

The [0.1.5 model report](model-0.1.5.md) separates training fit from inspected development comparisons.
Its [per-input comparison](experiments/model-0.1.5-results.json) preserves the model identities and repeated native decisions, including unsafe approvals introduced relative to the baseline.
These development cases do not establish fresh blind qualification.

The [paired shell-permission report](permission-fix-pairs.md) records a separate same-artifact model replay across five pattern groups and three real agent formats.
It reports harmful approvals, safe refusals, invalid answers, and process failures separately.
It compares no different models and claims no speed improvement.
Generated scenario commands remain inert data.

The [final-execution tests](final-execution-guard.md) check the runtime boundary with actual OpenCode actions and fixed harmless markers.
They distinguish model-only errors from deterministic withholding and host execution.
An approved XOR receipt records release by the checker, not successful completion of the underlying tool.

## Historical evidence

The earlier Sol evaluation and October deployment claim remain in their original receipts.
The [November runtime audit](experiments/checker-runtime-audit-2026-11-02.json) supersedes that deployment claim.
The saved Linux evaluation lacks the exact input identities and matched Mac comparison required for the former qualification claim.
The previous rankings and causal speed claims therefore do not establish current performance or safety.
Use the source-bound reports above for current decisions.
