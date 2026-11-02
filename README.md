# xor

xor is a safety guard for your AI coding agent.

When you use coding agents like OpenCode, you want them to build features and fix bugs without breaking your project. You do not want them deleting files by mistake, modifying your personal files, or leaking private tokens to the internet. 

xor acts like a polite gatekeeper. Every time the agent wants to run a command or touch a file, xor checks that action against your simple project rules. If it looks safe, xor allows it. If it violates your rules, xor blocks it. If it looks uncertain or risky, xor pauses and asks you for confirmation first.

An optional desktop companion sits on your screen and shows you what your agent is doing in real time.

![xor companion](docs/xor.gif)

[Quick Start](#quick-start) · [How It Works](#how-it-works) · [Your Project Rules](#your-project-rules) · [Commands](#commands) · [Model Performance](#model-performance) · [For Developers & Contributors](#for-developers--contributors) · [Documentation](#documentation)

---

## Quick Start

You only need Node.js 22.12 or newer and OpenCode 2.0.30 or newer. On macOS, make sure you have installed Xcode Command Line Tools (`xcode-select --install`).

Install xor globally and run the setup command:

```sh
npm install --global @quaannguyen/xor
xor install
```

`xor install` sets up the OpenCode plugin, downloads the lightweight local checker model, verifies the file integrity, and gets the desktop companion ready.
The model has known missed confirmations; see the measurements and limitations below.

If you prefer installing from source:

```sh
git clone https://github.com/QuaanNguyen/xor.git
cd xor
npm install
node scripts/install-plugin.js
```

---

## How It Works

1. **Folder Boundary Lock**: The agent is blocked from modifying files outside your active project folder.
2. **Rule Protection**: The agent cannot secretly edit your `.xor/preference.json` rules to grant itself extra permissions.
3. **Local AI Checker**: A tiny, ultra-fast local neural model evaluates each proposed action against your rules and returns one of three verdicts:
   - **approve**: The action follows your rules and proceeds normally.
   - **deny**: The action violates your rules. It is blocked immediately, and the agent is informed why.
   - **ask**: The action needs human confirmation. The action is held while OpenCode asks you whether to permit it.

Everything runs entirely on your local machine. No code, logs, or agent actions are sent to third-party cloud services for permission checks.

---

## Your Project Rules

Set your rules in `.xor/preference.json` at the root of your project:

```json
{
  "text": "Work on this repository. Allow local edits and tests. Deny sending source code or secrets to outside services. Ask before deleting files."
}
```

You can write your preferences in plain English. If you do not create this file, xor applies safe default rules automatically.

---

## Commands

| What you want to do | Command |
| :--- | :--- |
| Install the OpenCode plugin and checker model | `xor install` |
| Migrate rules from older installations | `xor migrate` |
| Make the desktop companion smaller | `xor pet size 75` |
| Make the desktop companion larger | `xor pet size 115` |
| Reset the desktop companion to default size | `xor pet size reset` |
| View command options and help | `xor help` |

---

## Model Performance

Version 0.1.4 uses the latest Sol-trained model, released with the owner’s explicit exception to the usual replacement requirements.
It has known confirmation failures and is not a qualified safety improvement.
The earlier trained comparator below was experimental; npm 0.1.3 actually shipped the original public model, which was not measured on these 122 cases.

| Measurement | npm 0.1.3 shipped model | Earlier trained comparator | npm 0.1.4 model |
| :--- | :--- | :--- | :--- |
| Model download size, decimal MB | 35.34 | 63.44 | 63.44 |
| Correct decisions on the same 122 cases | Not measured | 107/122 (87.70%) | 115/122 (94.26%) |
| Prohibited actions incorrectly approved | Not measured | 1/33 | 1/33 |
| Required confirmations bypassed | Not measured | 1/31 | 3/31 |
| Permitted actions refused | Not measured | 9/58 | 1/58 |
| Invalid, unstable, or failed answers | Not measured | 0/122 | 0/122 |
| Recorded median native response time | Not measured | 231 ms | 257 ms |
| Recorded native response-time range | Not measured | 182–354 ms | 186–421 ms |

These cases were inspected during model development, so the scores do not measure performance on unseen actions.
The separate final test was not run because the candidate failed the usual acceptance checks.
The same owner correction applies to both compared models, and the latest model introduces two confirmation bypasses that the comparator handled correctly.
Timings cover native process launch and response on the same Apple Silicon Mac, with one thread, one warmup, and three recorded runs per case (366 timings per model).
They exclude OpenCode hook and queue time; the runs were not an alternating controlled performance benchmark, so no speedup is claimed.
The real OpenCode 2.2.5 read succeeds with standard input but fails with the positional command-line prompt.
See the [release measurements and limitations](docs/model-0.1.4.md) and [per-case results](docs/experiments/model-0.1.4-results.json).

---

## For Developers & Contributors

If you want to contribute, run test suites, or train models, follow these steps:

### Prerequisites
- Node.js 22.12 or newer
- Python 3.10 or newer
- Git and Git LFS

### Setup and Testing
```sh
npm ci
git lfs install
git lfs pull
npm run check
npm test
npm run test:package
node scripts/check-package-client.js npm
```

### Full Desktop Interactive Test Suite
```sh
node test/run-all-tests.js
```

### Training & Architecture Work
- The synthesized training script is located at `scripts/finetune_v3_synthesized.py`.
- Training pipeline verification is available via `node scripts/verify-checker-quality.js`.
- Raw training datasets are maintained separately and must not be committed directly to source control.

---

## Documentation

| Guide | Description |
| :--- | :--- |
| [Project Context](CONTEXT.md) | Architectural background, terms, and conventions |
| [Gate Reference](docs/xor-and-gate.md) | Details on action classification, tools, and effects |
| [Methodology & Benchmarks](docs/methodology-and-benchmarks.md) | Deep dive into fine-tuning techniques and comparative results |
| [Training Guide](docs/checker-training.md) | Model requirements, data validation, and training steps |
| [Tool Inventory](docs/checker-tool-inventory.json) | Comprehensive list of checked agent tools and schemas |
| [Desktop Companion Events](docs/EVENTS.md) | Event stream formats for the desktop UI |
| [Contributing Guide](CONTRIBUTION.md) | Contribution standards, code style, and test requirements |
| [Release Guide](docs/RELEASING.md) | Step-by-step checklist for publishing new versions |
