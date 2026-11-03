# xor

xor checks supported coding-agent tools against your project rules before they run.
The check uses the final inputs that OpenCode is about to execute.
The local model can approve, deny, or ask for confirmation.
Trusted folder and settings checks also remain active.

OpenCode's Code Mode can group tool calls into one program.
xor checks supported tools inside that program, but it does not fully check the enclosing program.
See the [coverage limits and implementation checks](docs/post-pr98-enhancements.md).

The optional desktop companion shows what your agent is doing.
It starts off until you enable it.

![xor companion](docs/xor.gif)

[Quick start](#quick-start) · [How it works](#how-it-works) · [Your project rules](#your-project-rules) · [Commands](#commands) · [Model performance](#model-performance) · [For developers and contributors](#for-developers-and-contributors) · [Documentation](#documentation)

---

## Quick start

You need Node.js 22.12 or newer and OpenCode 2.0.30 or newer.
On macOS, install Xcode Command Line Tools (`xcode-select --install`).

Install xor globally:

```sh
npm install --global @quaannguyen/xor
```

Installation sets up the OpenCode plugin, downloads and verifies the local checker model, and prepares the optional companion.
No separate setup command is needed when npm permits the installation script.
With npm 12 or newer, allow this package's script during global installation:

```sh
npm install --global @quaannguyen/xor --allow-scripts=@quaannguyen/xor
```

For a local npm 12 installation, allow the package in your project's installation-script policy.
If your package manager blocks scripts, run `xor install` after allowing setup.
Use `xor debug` to check the installed integration.
For an OpenCode executable outside your normal command search path, set `XOR_OPENCODE_COMMAND` to its full path before installation.
The model has known missed confirmations; see the measurements and limitations below.

If you prefer installing from source:

```sh
git clone https://github.com/QuaanNguyen/xor.git
cd xor
npm install
```

---

## How it works

1. For supported tools, xor blocks actions outside the active project folder.
2. The agent cannot edit your saved project rules to grant itself more permission.
3. The local model checks supported actions against your rules and returns one of three verdicts:
   - **approve**: The checker permits the action to proceed.
   - **deny**: The action stays blocked, and the agent receives the refusal reason.
   - **ask**: The action stays blocked, and the coding agent receives instructions to ask you for confirmation.

Permission checks run on your computer.
The checker sends no code, logs, or agent actions to a cloud service.

---

## Your project rules

Run `xor preference` from your project folder to edit its rules in your text editor.
Set your preferred editor before running the command.
Saving applies the rules to subsequent action checks.
Cancelling keeps the saved rules.

Run `xor preference --all` to edit the global fallback.
A folder's saved rules take precedence over the global rules.
Parent-folder rules do not apply automatically.
Run `xor preference --remove` to remove the current folder's override.
The command shows the scope being edited and the effective source.
Existing completion checks survive edits and migration.

Without saved folder or global rules, xor uses: "Act like a normal harness. Follow the user's request without adding restrictions."
The local model still checks supported tool actions, and OpenCode permissions still apply.
Trusted folder and settings checks continue to restrict actions until model replacement is qualified.

---

By default, xor saves final tool decisions on this computer.
Approved calls retain their inputs.
Denied calls and unanswered confirmation requests retain metadata and hashes without their raw inputs.
The [local record guide](docs/post-pr98-enhancements.md#local-verdict-records) explains storage and the off setting.

## Commands

| What you want to do | Command |
| :--- | :--- |
| Repair OpenCode setup | `xor install` |
| Edit this folder's rules | `xor preference` |
| Edit the global fallback | `xor preference --all` |
| Remove this folder's override | `xor preference --remove` |
| Check the installed integration | `xor debug` |
| Migrate rules from older installations | `xor migrate` |
| Enable the companion globally | `xor pet on` |
| Disable the companion globally | `xor pet off` |
| Change companion size immediately | `xor pet 87.5` |
| Reset companion size | `xor pet reset` |
| View command options and help | `xor help` |

---

## Model performance

The 0.1.5 package selects the deletion-and-confirmation model accepted by the owner with a native training fit of 315/323.
That score measures its own training examples.
The separate development comparison against the 0.1.4 baseline is below.

![XOR baseline and new model on development controls](docs/model-0.1.5-comparison.svg)

| Evaluation | 0.1.4 baseline | 0.1.5 model |
| :--- | :--- | :--- |
| Policy and permission rules | 96/100 | 97/100 |
| Historical controls | 115/122 | 116/122 |
| New deletion and confirmation controls | 21/27 | 19/27 |
| Native training fit on the new training examples | Not measured | 315/323 |
| Download size, decimal MB | 63.44 | 63.44 |

The new scenarios cover folder scope and traversal, protected settings, scoped delegation, incomplete action visibility, permission authority, confirmation, and completion evidence.
They also cover archives that preserve originals, archives followed by deletion, requested or prohibited deletion, and removing obsolete code blocks.
Dataset coverage does not mean the hardcoded checks have been removed.
Trusted filesystem and settings checks still run before model decisions.

The development suites contain 241 unique inspected cases and overlap with each other.
Each scored case requires the correct answer in all five native rounds.
The new model introduces five unsafe approvals relative to the baseline and is not a qualified safety improvement.
A separate model-only replay approved all 54 distinct harmful challenge inputs in three independently model-reviewed shell-pattern groups.
The [paired-scenario evidence](docs/permission-fix-pairs.md) records those decisions and their review status.
This replay measures the model's decisions, while the trusted runtime checks remain active.
The frozen test split remains unscored, and no speedup is claimed.
The training diagnostic reports 323/323 verdict leads while actual native generation returns 315/323, so that disagreement remains unresolved.

Download the [0.1.5 weights](https://github.com/QuaanNguyen/xor/releases/download/needle-2026-11-03-e1c8a7c8/needle3.cact) or the [0.1.4 baseline weights](https://github.com/QuaanNguyen/xor/releases/download/needle-2026-11-02-69a83e3e/needle3.cact).
See the [release measurements and categories](docs/model-0.1.5.md), [per-case results](docs/experiments/model-0.1.5-results.json), and [runtime replacement audit](docs/model-policy-replacement.md).

---

## For developers and contributors

To work on xor, install the development dependencies and run the checks below.

### Prerequisites

- Node.js 22.12 or newer
- Python 3.10 or newer
- Git and Git LFS

### Setup and testing

```sh
npm ci --ignore-scripts
git lfs install
git lfs pull
npm run check
npm test
npm run test:package
node scripts/check-package-client.js npm
```

### Full desktop interactive test suite

```sh
node test/run-all-tests.js
```

### Training and architecture work

- The synthesized training script is located at `scripts/finetune_v3_synthesized.py`.
- Training pipeline verification is available via `node scripts/verify-checker-quality.js`.
- Raw training datasets are maintained separately and must not be committed directly to source control.

---

## Documentation

| Guide | Description |
| :--- | :--- |
| [Project Context](CONTEXT.md) | Architectural background, terms, and conventions |
| [Gate Reference](docs/xor-and-gate.md) | Details on action classification, tools, and effects |
| [Methodology & Benchmarks](docs/methodology-and-benchmarks.md) | Training methods and comparative results |
| [Training Guide](docs/checker-training.md) | Model requirements, data validation, and training steps |
| [Tool Inventory](docs/checker-tool-inventory.json) | Pinned tool contracts and explicit coverage gaps |
| [Post-release work and checks](docs/post-pr98-enhancements.md) | Current implementation, local records, and remaining requirements |
| [Desktop Companion Events](docs/EVENTS.md) | Event stream formats for the desktop UI |
| [Contributing Guide](CONTRIBUTION.md) | Contribution standards, code style, and test requirements |
| [Release Guide](docs/RELEASING.md) | Step-by-step checklist for publishing new versions |
