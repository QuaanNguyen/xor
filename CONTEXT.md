# xor action gate and companion

xor checks proposed OpenCode tool calls against the user's request and project rules before they run.
It uses local Needle decisions to approve, deny, or ask for confirmation.

The active work prepares reviewed synthetic scenarios and qualifies a replacement Needle model on the Mac.
No replacement model is qualified.
Direct answers without model reasoning remain a qualification requirement.
The desktop companion remains part of the runtime.

## Core architecture

### 1. The gate

The gate checks the final decoded action of a registered tool before that tool executes.
A Verdict applies to one exact tool, argument snapshot, user request, and Preference.
A rewritten action needs its own check.
An approval of earlier proposed arguments does not authorize a later replacement.

Folder boundaries and protected settings remain deterministic restrictions.
An approve decision releases the checked action through OpenCode's remaining permission handling.
A deny decision withholds the action and explains the governing rule.
An ask decision withholds the action and returns control to the coding agent to request owner confirmation.

Final Verdict records are local evidence of XOR's release or withholding decision.
They do not prove that an approved tool completed.
Denied and unanswered actions retain no raw arguments.
If required local recording fails, the action remains withheld.

Code Mode's synthesized outer execution is a separate coverage gap.
Its registered nested tool calls receive their own checks, but checking those calls does not establish a Verdict for the outer wrapper.
Native plugin implementations remain trusted host code.
See [the final-action design](docs/final-action-design.md) and [verified scope](docs/final-execution-guard.md) for the implementation and evidence.

### 2. The local Needle model
- **Decision format**: The target format is direct `approve`, `deny`, or `ask` tool calls.
  Qualification must establish this behavior for a replacement model.
- **Checked Inputs**: The gate consumes the exact production request format (version 3): the latest user request, one free-text project Preference, and the complete proposed tool call (including derived read/write paths and network targets for shell commands).
- **Fail-Closed**: Missing models, unreadable preferences, missing verdicts, or execution timeouts automatically fail-closed into refusals.

### 3. The Desktop Companion (Pet)
- Sits beside the coding agent and reflects the live event stream emitted by the gate (`calm`, `allowed`, `thinking`, `refused`, `denied`, `suspicious`, `celebrating`).
- Uses native macOS AppKit / WebKit (`pet/native/`) on Darwin and locked Electron on Windows / Linux.
- The Pet observes and displays events via a private IPC pipe; it never alters gate decisions.

## Language and Domain Vocabulary

**xor**:
The verifier product, plugin, and CLI command suite (`xor install`, `xor migrate`, `xor pet size`).

**Gate**:
The check that compares a supported tool's final decoded action against the owner Preference and current request before execution.
The Verdict and actual execution use the same checked action snapshot.

**Preference**:
One free-text statement of the user's project rules (canonical location `.xor/preference.json`), defining what actions are permitted, what must be denied, and what requires owner confirmation. Optional `done_criteria` define deterministic completion verification.

**Needle Model (Gate / Gate Engine)**:
The on-device Cactus Needle model that classifies proposed actions.

**Verdict**:
One direct `approve`, `deny`, or `ask` answer returned by the gate.
- `deny`: Withholds the proposed action because it matches the user preference description for denial.
- `approve`: Allows the proposed action because it does not match the denial description.
- `ask`: Withholds the action pending owner confirmation.

**Scenario**:
A synthetic tuple of (user request, Preference, proposed tool call) used for fine-tuning and evaluating the gate. Generated commands are inert data and never executed.

**Family**:
A cluster of related scenarios and syntactic command variants that are kept together in the same data split to prevent leakage.

**Split**:
Disjoint partitions for training, validation, and frozen blind evaluation.

**Author**:
The model responsible for synthesizing diverse, schema-valid tool calls, tasks, and preferences.

**Independent Review**:
Evaluating author cases across two distinct model families without access to intended labels; families with disputes or abstentions are quarantined.

**Human Verification**:
Explicit human audit and sign-off on critical safety cases and distribution boundaries.

**Promotion**:
Upgrading the shipped Needle gate only after proving parity or improvement over the baseline on frozen evaluation sets with lower latency or smaller size.
