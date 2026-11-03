# XOR action gate and companion

XOR checks supported coding-agent actions against the user's request and project rules before they run.
Its local model returns approve, deny, or ask decisions.

## Language

**XOR**:
The local action checker, OpenCode plugin, command-line tools, and optional desktop companion.

**Gate**:
The check of a supported tool's final decoded action against the current request and Preference.
The decision applies to the same action that the tool receives.

**Preference**:
One free-text statement of the owner's project rules.
A folder Preference takes precedence over the global fallback and built-in default.

**Needle model**:
The local model that classifies a proposed action as approve, deny, or ask.
_Avoid_: Judge, policy authority.

**Verdict**:
One decision for an exact action, request, and Preference.
Approve permits the action to proceed, deny withholds it, and ask withholds it pending owner confirmation.

**Final action**:
The tool and decoded arguments at the point of execution.
A changed action requires its own check.

**Verdict receipt**:
A local record of XOR's final decision to release or withhold an action.
It does not prove that the tool completed or that another permission system approved it.

**Trusted restriction**:
A runtime rule that uses facts the model cannot establish from the proposed action alone.
Folder boundaries and protected owner settings remain subject to these rules.

**Companion**:
The optional desktop pet that displays action-checking events.
It observes decisions and cannot change them.

**Scenario**:
A user request, Preference, and proposed tool call used for model training or evaluation.
Generated commands are data and must never run.

**Family**:
Related scenarios kept in the same data split to prevent training and evaluation overlap.

**Split**:
A partition of scenarios for training, development validation, or frozen blind evaluation.

**Author**:
The model that creates scenarios and their intended decisions.

**Independent review**:
Review by two distinct model families without access to the author's intended decisions.
Disputed cases remain excluded until resolved.

**Human verification**:
The owner's explicit review of critical cases and the limits of the dataset.

**Qualification**:
Evidence that a dataset, runtime, or model meets its stated acceptance requirements.
Publishing a package or closing an issue does not establish qualification.

**Promotion**:
Replacing the shipped model after it passes the required independent comparisons and safety checks.
An owner-authorized release exception remains separate from qualification.

## Related records

[Runtime behavior and limits](docs/post-pr98-enhancements.md) describes the supported checks and remaining coverage.
[Model measurements](docs/model-0.1.5.md) records the 0.1.5 model and its unresolved regressions.
[Release guide](docs/RELEASING.md) describes package publication.
