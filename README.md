<div align="center">
  <img src="assets/icon.svg" width="112" alt="Heretic Studio logo">
  <h1>Heretic Studio</h1>
  <p><strong>Modify language models on your own GPU—without training, and without living in a terminal.</strong></p>
  <p>A local Electron + React + TypeScript desktop studio built atop <a href="https://github.com/p-e-w/heretic"><code>p-e-w/heretic</code></a> (Heretic 2.x) for training-free LLM steering, multi-objective Optuna Pareto optimization, layer kernel visualization, custom scorer plugins, and byte-verifiable model reproduction.</p>

  <p>
    <a href="https://github.com/p-e-w/heretic"><img alt="Powered by p-e-w/heretic 2.x" src="https://img.shields.io/badge/upstream-p--e--w%2Fheretic_2.x-00f0ff?style=flat-square&labelColor=0b0d14"></a>
    <img alt="Platform" src="https://img.shields.io/badge/platform-Linux_%7C_macOS_%7C_Windows-10b981?style=flat-square&labelColor=0b0d14">
    <img alt="Stack" src="https://img.shields.io/badge/stack-Electron_33_%2B_React_18_%2B_TypeScript-38bdf8?style=flat-square&labelColor=0b0d14">
    <img alt="Verification" src="https://img.shields.io/badge/tests-passing-10b981?style=flat-square&labelColor=0b0d14">
    <a href="LICENSE"><img alt="License: AGPL-3.0-or-later" src="https://img.shields.io/badge/license-AGPL--3.0--or--later-ff2a85?style=flat-square&labelColor=0b0d14"></a>
  </p>
</div>

![Heretic Studio — Multi-Objective Pareto Frontier & Layer Kernel Studio](docs/screenshots/pareto-studio.png)

[**Heretic**](https://github.com/p-e-w/heretic) (created by [Philipp Emanuel Weidmann](https://github.com/p-e-w)) lets you modify local language models—suppressing refusals, stripping AI "slop" and purple prose, reducing sycophancy, steering emotional tone, or co-optimizing reasoning benchmarks—in an afternoon on consumer hardware using mathematical weight/adapter interventions rather than expensive fine-tuning.

**Heretic Studio** wraps the complete Heretic 2.x engine in a local desktop workbench. Watch Optuna TPE trials land on a live multi-objective Pareto frontier, inspect the exact transformer layers and ablation weight kernels being modified, edit `config.toml` visually or in raw code with two-way sync, test base vs. modified responses side by side, author custom Python `Scorer`/`Modifier` plugins, and audit `reproduce.json` manifests from the Heretic Grimoire.

**Explore:** [Screenshots](#screenshots) · [Why Heretic Studio](#why-heretic-studio) · [Features](#features) · [Included Presets](#included-steering-presets) · [Quick Start](#quick-start) · [How It Works](#how-it-works) · [Testing](#testing) · [Upstream Attribution & License (AGPL-3.0)](#upstream-attribution--license)

---

## Screenshots

| Optimization & Pareto Studio | Config & Preset Architect (`config.toml`) |
| --- | --- |
| ![Optimization & Pareto Studio](docs/screenshots/pareto-studio.png) | ![Config & Preset Architect](docs/screenshots/config-architect.png) |

| Prompt Sandbox, Keyword Matcher & `lm-eval` | Plugin Studio (`Scorer` & `Modifier` IDE) |
| --- | --- |
| ![Prompt Sandbox & Benchmarks](docs/screenshots/prompt-sandbox.png) | ![Plugin Studio](docs/screenshots/plugin-studio.png) |

| The Heretic Grimoire (`reproduce.json` Vault) | Live GPU Telemetry & Python Environment Manager |
| --- | --- |
| ![Heretic Grimoire Vault](docs/screenshots/grimoire-reproduce.png) | ![Hardware & Python Environment](docs/screenshots/hardware-env.png) |

---

## Why Heretic Studio

- **See the trade-off instead of guessing.** Steering a language model is always a multi-objective trade-off between behavior change (e.g., refusal rate, slop frequency, or classifier score) and model capability preservation (KL divergence from the base model or `lm-eval` accuracy). Heretic Studio plots every Optuna trial live and highlights the **Pareto-optimal frontier** so you can pick the exact trial that balances behavior and intelligence.
- **Inspect what happens inside the transformer.** Click any trial on the Pareto curve to visualize either **Arbitrary-Rank Ablation (`ARA`)** layer spans (`start_layer_index` to `end_layer_index`, `preserve_good_behavior_weight`, `steer_bad_behavior_weight`, `overcorrect_relative_weight`, and `neighbor_count`) or **Directional Abliteration / MPOA** trapezoidal per-layer weight kernels across `attn.o_proj` and `mlp.down_proj`.
- **Two-way `config.toml` architecture.** Every setting in the visual form builder syncs instantaneously with the raw `config.toml` editor—and edits to raw TOML update the visual controls without losing comments or structure.
- **Instant Guided Simulation + Real Python CLI.** Explore the entire Heretic 2.x workflow immediately in **Guided Live Simulation** mode (which streams real Optuna `JournalStorage` `.jsonl` records to `checkpoints/`), or switch to **Real Heretic Python CLI** mode to spawn `python -m heretic.main` against local or Hugging Face weights with live stdout/stderr and interactive stdin.
- **Reproducibility built in.** Inspect `reproduce.json` v4 manifests from the Heretic Grimoire, verify SHA-256 weight checksums, and run Heretic's environment mismatch severity analyzer (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`) against your local GPU, OS, CUDA, and Python package versions before running `heretic --reproduce`.

---

## Features

| Studio Module | Capabilities |
| --- | --- |
| **1. Optimization & Pareto Studio** | Live Optuna `JournalStorage` (`checkpoints/*.jsonl`) parser and watcher; interactive SVG Multi-Objective Pareto Frontier scatter plot; **ARA** layer span & L-BFGS objective visualizer; **MPOA / Abliteration** 32-layer trapezoidal weight kernel plotter; Trial Inspector; **Model Export & Hugging Face Hub Publisher** (`merge` full safetensors or `adapter` PEFT LoRA) with auto-generated `README.md` Model Card preview and `bnb_4bit` CPU dequantization RAM estimator. |
| **2. Config & Preset Architect** | Ships with all **7 Official Heretic 2.x Presets** plus custom user presets (`presets/*.toml`); visual configuration for model quantization (`none`, `bnb_4bit`), batch sizing, contrasting `good_prompts` / `bad_prompts` dataset specifications, modifier hyperparameter priors, multi-objective scorers, and interactive `[scorer.KeywordRate]` marker bank editor; bidirectional raw `config.toml` code editor. |
| **3. Prompt Sandbox & Benchmarks** | Side-by-side comparison of Base Model vs. Modified Trial responses across sensitive, creative-writing, anti-sycophancy, and reasoning prompts; real-time port of Heretic's `KeywordRate._is_match` Unicode normalization (curly-apostrophe normalization, strip prefixes, case-folding) with inline marker highlighting; `lm-eval` benchmark delta viewer (`MMLU`, `GSM8K`, `PIQA`, `IFEval`, `HellaSwag`, `WinoGrande`, `EQ-Bench`) and standalone `--evaluate-model` runner. |
| **4. Plugin Studio (`Scorer` & `Modifier` IDE)** | Browse upstream Heretic 2.x modifiers (`ara.py`, `abliteration.py`) and scorers (`keyword_rate.py`, `kl_divergence.py`, `bert_classifier.py`, `benchmark_score.py`); write, save, and one-click inject custom Python plugins (`plugins/*.py:ClassName`) directly into your active `config.toml`. Includes a ready-to-use `plugins/conciseness_scorer.py:ConcisenessScorer` example. |
| **5. Heretic Grimoire & Reproducibility Vault** | Inspect `reproduce.json` v4 manifests (`grimoire/*.json`); compare manifest OS, CPU, GPU accelerator, driver, and package versions (`torch`, `transformers`, `accelerate`, `bitsandbytes`, `optuna`, `peft`) against your machine with severity badges; inspect expected `.safetensors` SHA-256 hashes; 1-click `heretic --reproduce` and `heretic --collect-reproducibles`. |
| **6. Live Hardware & Python Env Manager** | Real-time GPU telemetry via `nvidia-smi` (VRAM usage, GPU utilization, temperature, power draw) and system RAM/CPU monitoring; VRAM & system RAM footprint estimator for 4B–70B models; 1-click `.venv` creation and installation of `heretic-llm` from the bundled `vendor/heretic` source or PyPI. |

---

## Included Steering Presets

Heretic Studio includes all 7 official configuration presets from [`p-e-w/heretic`](https://github.com/p-e-w/heretic):

| Preset | File | Objective & Technique |
| --- | --- | --- |
| **Refusal Suppression (Default ARA)** | `config.default.toml` | Default censorship removal / refusal suppression using Arbitrary-Rank Ablation (`ARA`), co-optimizing `KeywordRate` (Refusals) and `KLDivergence` on `mlabonne/harmless_alpaca` vs. `mlabonne/harmful_behaviors`. |
| **ModernBERT Refusal Classifier** | `config.classifier.toml` | Replaces keyword string matching with `VINAY-UMRETHE/Refusal-Classifier` (`BERTClassifier`) for semantic refusal scoring alongside `KLDivergence`. |
| **Slop & Purple Prose Suppression** | `config.noslop.toml` | Suppresses 120+ overused AI creative-writing clichés (*"Eldoria"*, *"tapestry"*, *"testament"*, *"shiver"*, *"neon lights"*) on `llm-aes/writing-prompts`. |
| **Anti-Sycophancy Steering** | `config.nosyco.toml` | Eliminates excessive flattery and sycophantic agreement (*"great question"*, *"you're spot on"*, *"pure brilliance"*) using `UnstableLlama/praise`. |
| **Humor & Joke Suppression** | `config.nohumor.toml` | Steers the model away from dad jokes, puns, and forced witticisms using `UnstableLlama/jokes`. |
| **Multi-Objective Emotion Steering** | `config.emotions.toml` | Uses two `BERTClassifier` instances (`j-hartmann/emotion-english-distilroberta-base`) to simultaneously minimize negative emotions and maximize joy/surprise. |
| **Benchmark-Guided Ablation (PIQA)** | `config.piqa.toml` | Co-optimizes refusal minimization with maximizing physical commonsense reasoning (`PIQA acc_norm`) via the EleutherAI `lm-eval` harness. |

---

## Quick Start

### 1. Launch the Desktop App

```bash
# Install Node dependencies (first time only)
npm install

# Launch Heretic Studio in the background (builds frontend automatically if needed)
./start.sh

# Or build and run in the foreground
npm start

# Stop a background instance launched via ./start.sh
./start.sh --stop
```

### 2. Live Development Mode

```bash
npm run electron:dev
```

### 3. Python Environment for Real Model Modification (Optional)

Heretic Studio works out of the box in **Guided Live Simulation** mode without requiring a GPU or Python setup. To run real model modifications against Hugging Face or local models:

1. Open the **Hardware & Python Env** tab inside Heretic Studio and click **Create `.venv` & Install Bundled Heretic 2.x** (or install manually in a Python 3.10+ environment with PyTorch 2.6+):
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -e ./vendor/heretic
   ```
2. Switch the **Execution Engine** dropdown in the top bar from *Guided Live Simulation* to *Real Heretic Python CLI (`python -m heretic.main`)* and click **Launch Heretic Run**.

---

## How It Works

```
┌───────────────────────────────────────────────────────────────────────────┐
│                   Heretic Studio Renderer (React 18 + TS)                 │
│  ┌─────────────────┐ ┌──────────────────┐ ┌─────────────┐ ┌────────────┐  │
│  │ Pareto & Layer  │ │ Bidirectional    │ │ Sandbox &   │ │ Grimoire & │  │
│  │ Kernel Studio   │ │ TOML Architect   │ │ Benchmarks  │ │ Plugin IDE │  │
│  └────────┬────────┘ └────────┬─────────┘ └──────┬──────┘ └─────┬──────┘  │
└───────────┼───────────────────┼──────────────────┼──────────────┼─────────┘
            │ContextBridge IPC  │smol-toml         │KeywordRate   │Manifest v4
┌───────────▼───────────────────▼──────────────────▼──────────────▼─────────┐
│                Electron Main & Heretic Engine (electron/*.cjs)            │
│  • Optuna JournalStorage (.jsonl) parser & Pareto dominance solver        │
│  • MPOA / Abliteration trapezoidal weight kernel & ARA span evaluator     │
│  • Reproduce.json v4 hardware/package severity comparator                 │
│  • Live nvidia-smi GPU telemetry & Python subprocess PTY/stdio bridge     │
└────────────────────────────────────┬──────────────────────────────────────┘
                                     │ spawns / reads
┌────────────────────────────────────▼──────────────────────────────────────┐
│            Upstream Heretic 2.x Core (vendor/heretic / heretic-llm)       │
│  • Modifiers: heretic.modifiers.ara.ARA, heretic.modifiers.abliteration   │
│  • Scorers: KeywordRate, KLDivergence, BERTClassifier, BenchmarkScore     │
│  • Checkpoints: checkpoints/<model>.jsonl  • Config: config.toml          │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## Testing

Run the automated verification suite to test the Optuna `JournalStorage` parser, Pareto front computation, MPOA 32-layer weight kernel math, `KeywordRate._is_match` Unicode normalization, round-trip parsing of all 7 official Heretic 2.x TOML presets, GPU hardware telemetry, `reproduce.json` v4 severity checking, and Hugging Face Model Card generation:

```bash
npm test
```

To regenerate all documentation screenshots in `docs/screenshots/` directly from the live Electron app:

```bash
npm run build && HERETIC_CAPTURE_SCREENSHOTS=1 npx electron . --no-sandbox
```

---

## Upstream Attribution & License

### Upstream Credit (`p-e-w/heretic`)

Heretic Studio is built atop and bundles [**Heretic (`p-e-w/heretic`)**](https://github.com/p-e-w/heretic) ([heretic-project.org](https://heretic-project.org)), created by **Philipp Emanuel Weidmann** ([`@p-e-w`](https://github.com/p-e-w), `<pew@worldwidemann.com>`) and contributors.

If you use Heretic in academic or technical work, please cite the original upstream project:

```bibtex
@misc{heretic,
  author = {Weidmann, Philipp Emanuel},
  title = {Heretic: Training-free language model modification},
  year = {2025},
  publisher = {GitHub},
  journal = {GitHub repository},
  howpublished = {\url{https://github.com/p-e-w/heretic}}
}
```

### Notice of Modification (AGPLv3 Section 5)

In accordance with Section 5 of the GNU Affero General Public License v3.0:
- **Upstream Work:** `vendor/heretic/` and the official `config.*.toml` presets are Copyright © 2025–2026 Philipp Emanuel Weidmann (`<pew@worldwidemann.com>`) and contributors, licensed under `AGPL-3.0-or-later`.
- **Modifications & Extensions:** On **November 3, 2026**, **Vincent Serpico** added the Heretic Studio Electron + React + TypeScript desktop interface, Node/Electron backend engine (`electron/`), frontend studio components (`src/`), custom plugin example (`plugins/`), and verification suite (`tests/`).
- **Combined Work License:** In full compliance with `p-e-w/heretic`'s copyleft license, this entire repository and combined work is licensed under the **GNU Affero General Public License v3.0 or later (`AGPL-3.0-or-later`)**.

### License (`AGPL-3.0-or-later`)

Copyright © 2025–2026 Philipp Emanuel Weidmann (`<pew@worldwidemann.com>`) + contributors (Upstream Heretic Core)  
Copyright © 2026 Vincent Serpico (Heretic Studio Desktop UI & Engine Integration)

This program is free software: you can redistribute it and/or modify it under the terms of the **GNU Affero General Public License** as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful, but **WITHOUT ANY WARRANTY**; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License along with this program in [`LICENSE`](LICENSE) (and [`vendor/heretic/LICENSE`](vendor/heretic/LICENSE)). If not, see <https://www.gnu.org/licenses/>.
