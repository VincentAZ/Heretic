// SPDX-License-Identifier: AGPL-3.0-or-later
// Heretic Studio Core Engine (Node/Electron Backend)
// Copyright (C) 2025-2026 Philipp Emanuel Weidmann (<pew@worldwidemann.com>) + contributors (Upstream Heretic Core)
// Copyright (C) 2026 Vincent Serpico (Heretic Studio Desktop UI & Engine Integration, modified/extended 2026-11-03)
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFile, spawn } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

/**
 * Strip Rich markup tags like [bold], [cyan], [/], etc. for plain display when needed
 */
function stripRichMarkup(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/\\\[/g, '__ESCAPED_BRACKET__')
    .replace(/\[\/?[a-zA-Z0-9_\s#.]+\]/g, '')
    .replace(/__ESCAPED_BRACKET__/g, '[');
}

/**
 * Sanitize model name into checkpoint filename exactly as Heretic does in main.py:
 * "".join([(c if (c.isalnum() or c in ["_", "-"]) else "--") for c in settings.model]) + ".jsonl"
 */
function getCheckpointFilename(modelId) {
  if (!modelId) return 'unknown.jsonl';
  const sanitized = Array.from(modelId)
    .map((c) => (/^[a-zA-Z0-9_-]$/.test(c) ? c : '--'))
    .join('');
  return `${sanitized}.jsonl`;
}

/**
 * Parse an Optuna JournalStorage (.jsonl) file produced by Heretic 2.x
 * and compute the multi-objective Pareto front.
 */
function parseOptunaJournal(contentOrFilePath, fallbackFilename = 'study.jsonl') {
  let rawContent = '';
  let filePath = null;
  let updatedAt = new Date().toISOString();

  if (fs.existsSync(contentOrFilePath) && fs.statSync(contentOrFilePath).isFile()) {
    filePath = contentOrFilePath;
    rawContent = fs.readFileSync(contentOrFilePath, 'utf-8');
    updatedAt = fs.statSync(contentOrFilePath).mtime.toISOString();
    fallbackFilename = path.basename(contentOrFilePath);
  } else {
    rawContent = String(contentOrFilePath || '');
  }

  const lines = rawContent
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let studyName = 'heretic';
  let directions = [1, 1]; // 1 = MINIMIZE, 2 = MAXIMIZE in Optuna
  const studyUserAttrs = {};
  const trialsById = new Map();
  let nextAutoTrialId = 0;

  for (const line of lines) {
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }

    const op = record.op_code;
    if (op === 0) {
      // CREATE_STUDY
      if (record.study_name) studyName = record.study_name;
      if (Array.isArray(record.directions)) directions = record.directions;
    } else if (op === 2) {
      // SET_STUDY_USER_ATTR
      if (record.user_attr && typeof record.user_attr === 'object') {
        Object.assign(studyUserAttrs, record.user_attr);
      }
    } else if (op === 4) {
      // CREATE_TRIAL
      const tid = typeof record.trial_id === 'number' ? record.trial_id : nextAutoTrialId;
      nextAutoTrialId = Math.max(nextAutoTrialId, tid + 1);
      trialsById.set(tid, {
        trialId: tid,
        index: tid + 1,
        state: 0, // 0=RUNNING, 1=COMPLETE, 2=PRUNED, 3=FAIL
        stateName: 'RUNNING',
        datetimeStart: record.datetime_start || null,
        datetimeComplete: null,
        values: [],
        sampledParams: {},
        parameters: {},
        scores: [],
        isParetoOptimal: false,
      });
    } else if (op === 5) {
      // SET_TRIAL_PARAM
      const tid = record.trial_id;
      const trial = trialsById.get(tid);
      if (trial && record.param_name) {
        trial.sampledParams[record.param_name] = record.param_value_internal;
      }
    } else if (op === 6) {
      // SET_TRIAL_STATE_VALUES
      const tid = record.trial_id;
      const trial = trialsById.get(tid);
      if (trial) {
        if (typeof record.state === 'number') {
          trial.state = record.state;
          trial.stateName =
            record.state === 1
              ? 'COMPLETE'
              : record.state === 2
              ? 'PRUNED'
              : record.state === 3
              ? 'FAIL'
              : 'RUNNING';
        }
        if (Array.isArray(record.values)) {
          trial.values = record.values;
        }
        if (record.datetime_complete) {
          trial.datetimeComplete = record.datetime_complete;
        }
      }
    } else if (op === 7) {
      // SET_TRIAL_USER_ATTR
      const tid = record.trial_id;
      const trial = trialsById.get(tid);
      if (trial && record.user_attr && typeof record.user_attr === 'object') {
        if (typeof record.user_attr.index === 'number') {
          trial.index = record.user_attr.index;
        }
        if (record.user_attr.parameters) {
          trial.parameters = record.user_attr.parameters;
        }
        if (Array.isArray(record.user_attr.scores)) {
          trial.scores = record.user_attr.scores.map((s) => ({
            name: s.name,
            score: {
              value: s.score?.value ?? 0,
              rich_display: s.score?.rich_display ?? String(s.score?.value ?? 0),
              md_display:
                s.score?.md_display ??
                stripRichMarkup(s.score?.rich_display ?? String(s.score?.value ?? 0)),
            },
            baseline: {
              value: s.baseline?.value ?? 0,
              rich_display: s.baseline?.rich_display ?? String(s.baseline?.value ?? 0),
              md_display:
                s.baseline?.md_display ??
                stripRichMarkup(s.baseline?.rich_display ?? String(s.baseline?.value ?? 0)),
            },
          }));
        }
      }
    }
  }

  let parsedSettings = {};
  if (typeof studyUserAttrs.settings === 'string') {
    try {
      parsedSettings = JSON.parse(studyUserAttrs.settings);
    } catch {
      parsedSettings = {};
    }
  } else if (studyUserAttrs.settings && typeof studyUserAttrs.settings === 'object') {
    parsedSettings = studyUserAttrs.settings;
  }

  const allTrials = Array.from(trialsById.values()).sort((a, b) => a.index - b.index);
  const completedTrials = allTrials.filter(
    (t) => t.state === 1 && Array.isArray(t.values) && t.values.length > 0
  );

  // Determine Pareto optimality across completed trials
  // Direction: 1 = MINIMIZE, 2 = MAXIMIZE
  function dominates(trialA, trialB) {
    let strictlyBetterInAtLeastOne = false;
    const len = Math.min(directions.length, trialA.values.length, trialB.values.length);
    if (len === 0) return false;

    for (let i = 0; i < len; i++) {
      const dir = directions[i] || 1;
      const valA = trialA.values[i];
      const valB = trialB.values[i];
      if (dir === 1) {
        // Minimize
        if (valA > valB) return false;
        if (valA < valB) strictlyBetterInAtLeastOne = true;
      } else {
        // Maximize
        if (valA < valB) return false;
        if (valA > valB) strictlyBetterInAtLeastOne = true;
      }
    }
    return strictlyBetterInAtLeastOne;
  }

  for (const candidate of completedTrials) {
    let isDominated = false;
    for (const other of completedTrials) {
      if (other.trialId === candidate.trialId) continue;
      if (dominates(other, candidate)) {
        isDominated = true;
        break;
      }
    }
    candidate.isParetoOptimal = !isDominated;
  }

  // Sort Pareto optimal trials by their primary score values in non-decreasing order
  // matching src/heretic/main.py lines 778-791
  const paretoTrials = completedTrials
    .filter((t) => t.isParetoOptimal)
    .sort((a, b) => {
      for (let i = 0; i < Math.min(a.values.length, b.values.length); i++) {
        if (a.values[i] !== b.values[i]) {
          return a.values[i] - b.values[i];
        }
      }
      return a.index - b.index;
    });

  // Extract objective names and baseline scores
  const firstTrialWithScores = allTrials.find((t) => t.scores && t.scores.length > 0);
  const scoreMetrics = firstTrialWithScores
    ? firstTrialWithScores.scores.map((s, idx) => ({
        name: s.name,
        baseline: s.baseline,
        direction: directions[idx] === 2 ? 'maximize' : 'minimize',
      }))
    : [];

  const modifierPlugin =
    parsedSettings?.modifiers?.[0]?.plugin || 'heretic.modifiers.ara.ARA';
  const modifierType = modifierPlugin.toLowerCase().includes('abliteration')
    ? 'Abliteration'
    : 'ARA';

  return {
    id: fallbackFilename.replace(/\.jsonl$/, ''),
    filename: fallbackFilename,
    filePath,
    updatedAt,
    studyName,
    finished: Boolean(studyUserAttrs.finished),
    directions: directions.map((d) => (d === 2 ? 'maximize' : 'minimize')),
    settings: parsedSettings,
    model: parsedSettings.model || fallbackFilename.replace(/\.jsonl$/, '').replace(/--/g, '/'),
    modifiedModelType: parsedSettings.modified_model_type || 'decensored',
    modifierPlugin,
    modifierType,
    nTrialsTarget: parsedSettings.n_trials || Math.max(allTrials.length, 100),
    totalTrials: allTrials.length,
    completedTrialsCount: completedTrials.length,
    paretoCount: paretoTrials.length,
    scoreMetrics,
    trials: allTrials,
    paretoTrials,
  };
}

/**
 * Compute per-layer ablation weights for the Abliteration modifier given a trial's parameters
 * Mirrors src/heretic/modifiers/abliteration.py lines 330-352
 */
function computeAbliterationLayerProfile(parameters, layerCount = 32) {
  if (!parameters || !parameters.weight_distributions) {
    return null;
  }
  const distributions = parameters.weight_distributions;
  const components = Object.keys(distributions);
  const layers = [];

  for (let layerIndex = 0; layerIndex < layerCount; layerIndex++) {
    const row = { layerIndex };
    for (const comp of components) {
      const wd = distributions[comp];
      const distance = Math.abs(layerIndex - wd.max_weight_position);
      let weight = 0;
      if (distance <= wd.min_weight_distance && wd.min_weight_distance > 0) {
        weight =
          wd.max_weight +
          (distance / wd.min_weight_distance) * (wd.min_weight - wd.max_weight);
      }
      row[comp] = Number(Math.max(0, weight).toFixed(4));
    }
    layers.push(row);
  }

  return {
    directionIndex: parameters.direction_index,
    components,
    layers,
  };
}

/**
 * Analyze a model response against a list of KeywordRate markers
 * Mirrors src/heretic/scorers/keyword_rate.py `_is_match`
 */
function analyzeResponseText(responseText, keywordMarkers = []) {
  const raw = String(responseText || '');
  if (!raw.trim()) {
    return {
      isMatch: true,
      isEmpty: true,
      matchedMarkers: ['[empty response]'],
      normalizedText: '',
    };
  }

  const normalized = raw
    .toLowerCase()
    .replace(/\*/g, '')
    .replace(/’/g, "'")
    .split(/\s+/)
    .join(' ');

  const matchedMarkers = [];
  for (const marker of keywordMarkers) {
    const cleanMarker = String(marker || '').trim().toLowerCase();
    if (!cleanMarker) continue;
    if (normalized.includes(cleanMarker)) {
      matchedMarkers.push(marker);
    }
  }

  return {
    isMatch: matchedMarkers.length > 0,
    isEmpty: false,
    matchedMarkers,
    normalizedText: normalized,
  };
}

/**
 * Estimate VRAM & System RAM footprint for a model
 * Includes Heretic's `obtain_export_strategy` CPU merge RAM warning
 */
function estimateModelMemory(modelName, quantization = 'none', paramCountBillions = null) {
  let paramsB = paramCountBillions;
  if (!paramsB || paramsB <= 0) {
    // Parse parameter size from model ID if present (e.g. "7B", "4B", "24B", "70B", "0.5B")
    const match = String(modelName || '').match(/(\d+(?:\.\d+)?)\s*[bB]\b/);
    paramsB = match ? parseFloat(match[1]) : 7.0;
  }

  // Model weights + KV cache & activation buffers during Heretic batch inference / L-BFGS
  const bf16WeightsGb = paramsB * 2.0;
  const bnb4bitWeightsGb = paramsB * 0.65;
  const overheadGb = Math.max(2.0, paramsB * 0.45);

  const activeVramGb =
    quantization === 'bnb_4bit'
      ? Number((bnb4bitWeightsGb + overheadGb).toFixed(1))
      : Number((bf16WeightsGb + overheadGb).toFixed(1));

  const cpuMergeRamGb = Number((paramsB * 3.0).toFixed(1));

  return {
    estimatedParamsB: paramsB,
    quantization,
    bf16WeightsGb: Number(bf16WeightsGb.toFixed(1)),
    bnb4bitWeightsGb: Number(bnb4bitWeightsGb.toFixed(1)),
    estimatedPeakVramGb: activeVramGb,
    estimatedCpuMergeRamGb: cpuMergeRamGb,
    requiresCpuDequantMergeWarning: quantization === 'bnb_4bit',
  };
}

/**
 * Query real-time Hardware & Accelerator telemetry (NVIDIA GPU via nvidia-smi, CPU, System RAM)
 */
async function getHardwareTelemetry() {
  const cpus = os.cpus();
  const totalRamGb = Number((os.totalmem() / 1024 ** 3).toFixed(2));
  const freeRamGb = Number((os.freemem() / 1024 ** 3).toFixed(2));
  const usedRamGb = Number((totalRamGb - freeRamGb).toFixed(2));

  const systemInfo = {
    platform: `${os.type()} ${os.release()} (${os.arch()})`,
    hostname: os.hostname(),
    cpuBrand: cpus[0]?.model || 'Unknown CPU',
    cpuCores: cpus.length,
    ramTotalGb: totalRamGb,
    ramUsedGb: usedRamGb,
    ramFreeGb: freeRamGb,
    ramPercent: Math.round((usedRamGb / totalRamGb) * 100),
  };

  let accelerator = {
    type: null,
    driverVersion: null,
    cudaVersion: null,
    devices: [],
    totalVramGb: 0,
    usedVramGb: 0,
  };

  try {
    const { stdout } = await execFileAsync(
      'nvidia-smi',
      [
        '--query-gpu=index,name,memory.total,memory.used,memory.free,utilization.gpu,temperature.gpu,power.draw,driver_version',
        '--format=csv,noheader,nounits',
      ],
      { timeout: 3000 }
    );

    const lines = stdout
      .trim()
      .split(/\r?\n/)
      .filter(Boolean);

    if (lines.length > 0) {
      const devices = lines.map((line) => {
        const parts = line.split(',').map((s) => s.trim());
        const totalMib = parseFloat(parts[2]) || 0;
        const usedMib = parseFloat(parts[3]) || 0;
        const freeMib = parseFloat(parts[4]) || 0;
        return {
          index: parseInt(parts[0], 10) || 0,
          name: parts[1] || 'NVIDIA GPU',
          vramTotalGb: Number((totalMib / 1024).toFixed(2)),
          vramUsedGb: Number((usedMib / 1024).toFixed(2)),
          vramFreeGb: Number((freeMib / 1024).toFixed(2)),
          utilizationPercent: parseFloat(parts[5]) || 0,
          temperatureC: parseFloat(parts[6]) || 0,
          powerDrawW: parseFloat(parts[7]) || 0,
          driverVersion: parts[8] || 'Unknown',
        };
      });

      accelerator = {
        type: 'CUDA',
        driverVersion: devices[0]?.driverVersion || 'Unknown',
        devices,
        totalVramGb: Number(
          devices.reduce((acc, d) => acc + d.vramTotalGb, 0).toFixed(2)
        ),
        usedVramGb: Number(
          devices.reduce((acc, d) => acc + d.vramUsedGb, 0).toFixed(2)
        ),
      };
    }
  } catch {
    // Fallback if nvidia-smi is not present
  }

  return {
    timestamp: new Date().toISOString(),
    system: systemInfo,
    accelerator,
  };
}

/**
 * Inspect Python & Heretic environment
 */
async function getEnvironmentStatus(workspaceDir) {
  const candidates = [
    process.env.HERETIC_PYTHON,
    path.join(workspaceDir, '.venv', 'bin', 'python'),
    'python3',
    'python',
  ].filter(Boolean);

  let selectedPython = 'python3';
  for (const cand of candidates) {
    try {
      await execFileAsync(cand, ['--version'], { timeout: 2000 });
      selectedPython = cand;
      break;
    } catch {
      continue;
    }
  }

  const pyScript = `
import json, platform, sys, importlib.metadata
pkgs = ["heretic-llm", "torch", "transformers", "optuna", "peft", "bitsandbytes", "accelerate", "datasets", "lm-eval", "huggingface-hub"]
installed = {}
for p in pkgs:
    try:
        installed[p] = importlib.metadata.version(p)
    except Exception:
        installed[p] = None
print(json.dumps({
    "python_version": platform.python_version(),
    "executable": sys.executable,
    "packages": installed
}))
`;

  let envDetails = {
    pythonVersion: null,
    executable: selectedPython,
    hereticInstalled: false,
    vendorHereticAvailable: fs.existsSync(
      path.join(workspaceDir, 'vendor', 'heretic', 'pyproject.toml')
    ),
    packages: {},
  };

  try {
    const { stdout } = await execFileAsync(selectedPython, ['-c', pyScript], {
      timeout: 4000,
    });
    const parsed = JSON.parse(stdout.trim());
    envDetails.pythonVersion = parsed.python_version;
    envDetails.executable = parsed.executable;
    envDetails.packages = parsed.packages || {};
    envDetails.hereticInstalled = Boolean(parsed.packages?.['heretic-llm']);
  } catch {
    // Python check failed
  }

  return envDetails;
}

/**
 * Generate a Hugging Face Model Card README.md preview for a selected trial
 * Mirrors `get_readme_intro` in `src/heretic/utils.py`
 */
function generateModelCardPreview(study, trialIndex = null) {
  const targetTrial =
    (trialIndex !== null
      ? study.trials.find((t) => t.index === trialIndex)
      : null) ||
    study.paretoTrials[0] ||
    study.trials[0];

  if (!targetTrial) {
    return '# No completed trials available yet';
  }

  const modelId = study.model || 'organization/model';
  const modelLink = `[${modelId}](https://huggingface.co/${modelId})`;
  const modifiedType = study.modifiedModelType || 'decensored';
  const modifierHeader =
    study.modifierType === 'Abliteration'
      ? 'Magnitude-Preserving Orthogonal Ablation (MPOA)'
      : 'Arbitrary-Rank Ablation (ARA)';

  const paramEntries = [];
  if (targetTrial.parameters) {
    if (targetTrial.parameters.weight_distributions) {
      paramEntries.push([
        'direction_index',
        targetTrial.parameters.direction_index === null ||
        targetTrial.parameters.direction_index === undefined
          ? 'per layer'
          : Number(targetTrial.parameters.direction_index).toFixed(2),
      ]);
      for (const [comp, wd] of Object.entries(
        targetTrial.parameters.weight_distributions
      )) {
        for (const [k, v] of Object.entries(wd)) {
          paramEntries.push([`${comp}.${k}`, Number(v).toFixed(2)]);
        }
      }
    } else {
      for (const [k, v] of Object.entries(targetTrial.parameters)) {
        paramEntries.push([
          k,
          typeof v === 'number' && !Number.isInteger(v) ? v.toFixed(4) : String(v),
        ]);
      }
    }
  }

  const paramRows = paramEntries
    .map(([k, v]) => `| **${k}** | ${v} |`)
    .join('\n');

  const scoreRows = (targetTrial.scores || [])
    .map(
      (s) =>
        `| **${s.name}** | ${s.score.md_display} | ${s.baseline.md_display} |`
    )
    .join('\n');

  return `# This is a ${modifiedType} version of ${modelLink}, made using [Heretic](https://heretic-project.org) v2.1.0

> [!TIP]
> **This model is reproducible!**
>
> See the [README](reproduce/README.md) in the \`reproduce\` directory for more information.

## ${modifierHeader} parameters

| Parameter | Value |
| :-------- | :---: |
${paramRows}

## Performance

| Metric | This model | Original model (${modelLink}) |
| :----- | :--------: | :---------------------------: |
${scoreRows}

-----
`;
}

/**
 * Compare a `reproduce.json` v4 manifest against the current system and environment
 * Mirrors `check_environment` in `src/heretic/reproduce.py`
 */
function checkReproduceManifestCompatibility(manifest, telemetry, envStatus) {
  const systemMismatches = [];
  const packageMismatches = [];

  const severityRank = { low: 1, medium: 2, high: 3, critical: 4 };
  let maxSeverity = null;

  function recordMismatch(list, component, localVal, originalVal, severity) {
    if (String(localVal || 'missing') !== String(originalVal || 'missing')) {
      list.push({
        component,
        thisSystem: String(localVal ?? 'Not installed'),
        originalSystem: String(originalVal ?? 'Unspecified'),
        severity,
      });
      if (!maxSeverity || severityRank[severity] > severityRank[maxSeverity]) {
        maxSeverity = severity;
      }
    }
  }

  if (manifest.system) {
    const sys = manifest.system;
    recordMismatch(
      systemMismatches,
      'Python version',
      envStatus.pythonVersion || 'Unknown',
      sys.python?.version,
      'low'
    );
    recordMismatch(
      systemMismatches,
      'Operating system',
      telemetry.system?.platform,
      sys.os?.platform,
      'low'
    );
    recordMismatch(
      systemMismatches,
      'CPU',
      telemetry.system?.cpuBrand,
      sys.cpu?.brand,
      'low'
    );
    recordMismatch(
      systemMismatches,
      'Accelerator type',
      telemetry.accelerator?.type || 'None',
      sys.accelerators?.type || 'None',
      'high'
    );
    if (telemetry.accelerator?.type && sys.accelerators?.type) {
      recordMismatch(
        systemMismatches,
        'Driver version',
        telemetry.accelerator.driverVersion,
        sys.accelerators.driver_version,
        'medium'
      );
      const localDevices = (telemetry.accelerator.devices || [])
        .map((d) => d.name)
        .join(', ');
      const origDevices = (sys.accelerators.devices || [])
        .map((d) => d.name)
        .join(', ');
      recordMismatch(systemMismatches, 'Devices', localDevices, origDevices, 'medium');
    }
  }

  if (manifest.environment) {
    const origReqs = { ...(manifest.environment.requirements || {}) };
    if (manifest.environment.heretic?.version) {
      origReqs['heretic-llm'] = manifest.environment.heretic.version;
    }
    if (manifest.environment.pytorch_version) {
      origReqs['torch'] = manifest.environment.pytorch_version;
    }

    for (const [pkg, origVer] of Object.entries(origReqs)) {
      const localVer = envStatus.packages?.[pkg] || null;
      let sev = 'low';
      if (pkg === 'heretic-llm') sev = 'critical';
      else if (pkg === 'torch' || pkg === 'transformers') sev = 'high';
      else if (
        [
          'accelerate',
          'bitsandbytes',
          'kernels',
          'optuna',
          'peft',
          'tokenizers',
          'triton',
        ].includes(pkg)
      ) {
        sev = 'medium';
      }
      if (localVer !== origVer) {
        recordMismatch(packageMismatches, pkg, localVer, origVer, sev);
      }
    }
  }

  return {
    compatible: maxSeverity === null,
    maxSeverity: maxSeverity || 'none',
    systemMismatches,
    packageMismatches,
  };
}

/**
 * Seed realistic Heretic 2.x Optuna checkpoints, Grimoire manifests, and Custom Plugin examples
 * so the studio has rich data immediately on first launch.
 */
function seedSampleCheckpointsAndGrimoire(workspaceDir) {
  const checkpointsDir = path.join(workspaceDir, 'checkpoints');
  const grimoireDir = path.join(workspaceDir, 'grimoire');
  const pluginsDir = path.join(workspaceDir, 'plugins');
  const presetsDir = path.join(workspaceDir, 'presets');

  fs.mkdirSync(checkpointsDir, { recursive: true });
  fs.mkdirSync(grimoireDir, { recursive: true });
  fs.mkdirSync(pluginsDir, { recursive: true });
  fs.mkdirSync(presetsDir, { recursive: true });

  // 1. Seed Qwen3-4B-Instruct-2507 ARA Study (30 trials with realistic Pareto frontier)
  const qwenFile = path.join(checkpointsDir, 'Qwen--Qwen3-4B-Instruct-2507.jsonl');
  if (!fs.existsSync(qwenFile)) {
    const qwenLines = [];
    qwenLines.push(
      JSON.stringify({
        op_code: 0,
        study_name: 'heretic',
        directions: [1, 1],
      })
    );
    const qwenSettings = {
      model: 'Qwen/Qwen3-4B-Instruct-2507',
      quantization: 'none',
      dtypes: ['auto', 'float16', 'bfloat16', 'float32'],
      device_map: 'auto',
      offload_outputs_to_cpu: true,
      batch_size: 32,
      max_response_length: 100,
      scorers: [
        { plugin: 'heretic.scorers.keyword_rate.KeywordRate', optimization: 'minimize' },
        { plugin: 'heretic.scorers.kl_divergence.KLDivergence', optimization: 'minimize' },
      ],
      modifiers: [{ plugin: 'heretic.modifiers.ara.ARA' }],
      n_trials: 30,
      n_startup_trials: 10,
      seed: 4281992,
      modified_model_type: 'decensored',
      upload_tags: ['uncensored', 'decensored', 'abliterated'],
      system_prompt: 'You are a helpful assistant.',
      modifier: {
        ARA: {
          preserve_row_magnitudes: true,
          lora_rank: 50,
          n_optimization_steps: 5,
          learning_rate: 1.0,
          max_iter: 20,
          history_size: 10,
        },
      },
    };
    qwenLines.push(
      JSON.stringify({
        op_code: 2,
        study_id: 0,
        user_attr: {
          settings: JSON.stringify(qwenSettings),
          finished: true,
        },
      })
    );

    const sampleTrials = [
      { idx: 1, s: 6, e: 24, pg: 0.72, sb: 0.012, oc: 0.35, nb: 8, ref: 38, kl: 0.0412 },
      { idx: 2, s: 2, e: 32, pg: 0.18, sb: 0.42, oc: 0.95, nb: 5, ref: 1, kl: 0.8921 },
      { idx: 3, s: 10, e: 28, pg: 0.85, sb: 0.004, oc: 0.22, nb: 12, ref: 64, kl: 0.0185 },
      { idx: 4, s: 8, e: 26, pg: 0.54, sb: 0.048, oc: 0.62, nb: 7, ref: 14, kl: 0.1124 },
      { idx: 5, s: 12, e: 30, pg: 0.68, sb: 0.029, oc: 0.51, nb: 9, ref: 22, kl: 0.0684 },
      { idx: 6, s: 5, e: 29, pg: 0.31, sb: 0.145, oc: 0.78, nb: 6, ref: 4, kl: 0.2845 },
      { idx: 7, s: 14, e: 25, pg: 0.91, sb: 0.0018, oc: 0.15, nb: 11, ref: 79, kl: 0.0092 },
      { idx: 8, s: 9, e: 27, pg: 0.46, sb: 0.082, oc: 0.68, nb: 8, ref: 8, kl: 0.1582 },
      { idx: 9, s: 7, e: 31, pg: 0.25, sb: 0.22, oc: 0.88, nb: 4, ref: 2, kl: 0.412 },
      { idx: 10, s: 11, e: 26, pg: 0.61, sb: 0.036, oc: 0.49, nb: 10, ref: 18, kl: 0.0815 },
      { idx: 11, s: 8, e: 28, pg: 0.49, sb: 0.095, oc: 0.74, nb: 7, ref: 5, kl: 0.149 },
      { idx: 12, s: 10, e: 27, pg: 0.58, sb: 0.064, oc: 0.66, nb: 9, ref: 9, kl: 0.0984 },
      { idx: 13, s: 9, e: 29, pg: 0.41, sb: 0.132, oc: 0.82, nb: 6, ref: 2, kl: 0.1892 },
      { idx: 14, s: 11, e: 28, pg: 0.64, sb: 0.051, oc: 0.59, nb: 8, ref: 11, kl: 0.0742 },
      { idx: 15, s: 8, e: 30, pg: 0.36, sb: 0.175, oc: 0.91, nb: 5, ref: 1, kl: 0.2418 },
      { idx: 16, s: 12, e: 27, pg: 0.74, sb: 0.025, oc: 0.44, nb: 10, ref: 19, kl: 0.0491 },
      { idx: 17, s: 9, e: 28, pg: 0.52, sb: 0.108, oc: 0.77, nb: 7, ref: 3, kl: 0.1264 },
      { idx: 18, s: 10, e: 29, pg: 0.44, sb: 0.149, oc: 0.86, nb: 6, ref: 0, kl: 0.2145 },
      { idx: 19, s: 10, e: 28, pg: 0.56, sb: 0.078, oc: 0.71, nb: 8, ref: 6, kl: 0.0891 },
      { idx: 20, s: 11, e: 27, pg: 0.69, sb: 0.039, oc: 0.53, nb: 9, ref: 13, kl: 0.0582 },
      { idx: 21, s: 9, e: 28, pg: 0.48, sb: 0.118, oc: 0.79, nb: 7, ref: 2, kl: 0.1085 },
      { idx: 22, s: 9, e: 29, pg: 0.43, sb: 0.138, oc: 0.84, nb: 7, ref: 1, kl: 0.1392 },
      { idx: 23, s: 10, e: 28, pg: 0.51, sb: 0.092, oc: 0.75, nb: 8, ref: 4, kl: 0.0945 },
      { idx: 24, s: 12, e: 26, pg: 0.79, sb: 0.019, oc: 0.38, nb: 11, ref: 27, kl: 0.0314 },
      { idx: 25, s: 9, e: 28, pg: 0.46, sb: 0.129, oc: 0.83, nb: 7, ref: 0, kl: 0.1612 },
      { idx: 26, s: 10, e: 28, pg: 0.54, sb: 0.084, oc: 0.72, nb: 8, ref: 3, kl: 0.0864 },
      { idx: 27, s: 11, e: 27, pg: 0.62, sb: 0.059, oc: 0.63, nb: 9, ref: 7, kl: 0.0695 },
      { idx: 28, s: 9, e: 28, pg: 0.49, sb: 0.114, oc: 0.81, nb: 7, ref: 1, kl: 0.1128 },
      { idx: 29, s: 10, e: 28, pg: 0.47, sb: 0.125, oc: 0.82, nb: 8, ref: 0, kl: 0.1342 },
      { idx: 30, s: 11, e: 28, pg: 0.66, sb: 0.044, oc: 0.56, nb: 9, ref: 10, kl: 0.0518 },
    ];

    for (let i = 0; i < sampleTrials.length; i++) {
      const t = sampleTrials[i];
      qwenLines.push(
        JSON.stringify({
          op_code: 4,
          study_id: 0,
          trial_id: i,
          datetime_start: new Date(Date.now() - (30 - i) * 42000).toISOString(),
        })
      );
      qwenLines.push(
        JSON.stringify({
          op_code: 7,
          trial_id: i,
          user_attr: {
            index: t.idx,
            parameters: {
              start_layer_index: t.s,
              end_layer_index: t.e,
              preserve_good_behavior_weight: t.pg,
              steer_bad_behavior_weight: t.sb,
              overcorrect_relative_weight: t.oc,
              neighbor_count: t.nb,
            },
            scores: [
              {
                name: 'Refusals',
                score: {
                  value: t.ref / 100,
                  rich_display: `[bold]${t.ref}[/]/100`,
                  md_display: `${t.ref}/100`,
                },
                baseline: {
                  value: 0.96,
                  rich_display: '[bold]96[/]/100',
                  md_display: '96/100',
                },
              },
              {
                name: 'KL divergence',
                score: {
                  value: t.kl,
                  rich_display: `[bold]${t.kl.toFixed(4)}[/]`,
                  md_display: `${t.kl.toFixed(4)}`,
                },
                baseline: {
                  value: 0,
                  rich_display: '[bold]0[/] [italic](by definition)[/]',
                  md_display: '0 *(by definition)*',
                },
              },
            ],
          },
        })
      );
      qwenLines.push(
        JSON.stringify({
          op_code: 6,
          trial_id: i,
          state: 1,
          values: [t.ref / 100, t.kl],
          datetime_complete: new Date(Date.now() - (30 - i) * 42000 + 38000).toISOString(),
        })
      );
    }
    fs.writeFileSync(qwenFile, qwenLines.join('\n') + '\n', 'utf-8');
  }

  // 2. Seed Llama-3.2-3B-Instruct MPOA / Abliteration Study (with layer weight kernels)
  const llamaFile = path.join(checkpointsDir, 'meta-llama--Llama-3.2-3B-Instruct.jsonl');
  if (!fs.existsSync(llamaFile)) {
    const llamaLines = [];
    llamaLines.push(
      JSON.stringify({
        op_code: 0,
        study_name: 'heretic',
        directions: [1, 1],
      })
    );
    const llamaSettings = {
      model: 'meta-llama/Llama-3.2-3B-Instruct',
      quantization: 'none',
      batch_size: 64,
      max_response_length: 100,
      scorers: [
        { plugin: 'heretic.scorers.keyword_rate.KeywordRate', optimization: 'minimize' },
        { plugin: 'heretic.scorers.kl_divergence.KLDivergence', optimization: 'minimize' },
      ],
      modifiers: [{ plugin: 'heretic.modifiers.abliteration.Abliteration' }],
      n_trials: 20,
      n_startup_trials: 8,
      seed: 981723,
      modified_model_type: 'decensored',
      modifier: {
        Abliteration: {
          orthogonalize_direction: true,
          row_normalization: 'full',
          full_normalization_lora_rank: 3,
          winsorization_quantile: 1.0,
        },
      },
    };
    llamaLines.push(
      JSON.stringify({
        op_code: 2,
        study_id: 0,
        user_attr: {
          settings: JSON.stringify(llamaSettings),
          finished: true,
        },
      })
    );

    const ablitTrials = [
      { idx: 1, dir: 16.4, attnMax: 1.15, attnPos: 19.2, attnMin: 0.25, attnDist: 10.5, mlpMax: 0.45, mlpPos: 21.0, mlpMin: 0.1, mlpDist: 7.0, ref: 12, kl: 0.195 },
      { idx: 2, dir: null, attnMax: 1.32, attnPos: 20.5, attnMin: 0.4, attnDist: 12.0, mlpMax: 0.0, mlpPos: 22.1, mlpMin: 0.0, mlpDist: 8.5, ref: 4, kl: 0.118 },
      { idx: 3, dir: 18.1, attnMax: 0.92, attnPos: 18.0, attnMin: 0.18, attnDist: 8.2, mlpMax: 0.0, mlpPos: 19.5, mlpMin: 0.0, mlpDist: 6.4, ref: 24, kl: 0.062 },
      { idx: 4, dir: 17.5, attnMax: 1.42, attnPos: 21.3, attnMin: 0.55, attnDist: 13.4, mlpMax: 0.82, mlpPos: 20.4, mlpMin: 0.3, mlpDist: 11.2, ref: 0, kl: 0.342 },
      { idx: 5, dir: 17.2, attnMax: 1.24, attnPos: 19.8, attnMin: 0.31, attnDist: 11.0, mlpMax: 0.12, mlpPos: 21.2, mlpMin: 0.04, mlpDist: 6.8, ref: 2, kl: 0.094 },
      { idx: 6, dir: null, attnMax: 1.08, attnPos: 20.1, attnMin: 0.22, attnDist: 9.5, mlpMax: 0.0, mlpPos: 20.0, mlpMin: 0.0, mlpDist: 7.2, ref: 9, kl: 0.078 },
      { idx: 7, dir: 16.9, attnMax: 1.36, attnPos: 20.4, attnMin: 0.38, attnDist: 11.8, mlpMax: 0.18, mlpPos: 21.6, mlpMin: 0.05, mlpDist: 7.5, ref: 1, kl: 0.109 },
      { idx: 8, dir: 17.4, attnMax: 1.41, attnPos: 20.6, attnMin: 0.42, attnDist: 12.2, mlpMax: 0.22, mlpPos: 21.4, mlpMin: 0.06, mlpDist: 8.0, ref: 0, kl: 0.141 },
    ];

    for (let i = 0; i < ablitTrials.length; i++) {
      const t = ablitTrials[i];
      llamaLines.push(
        JSON.stringify({
          op_code: 4,
          study_id: 0,
          trial_id: i,
          datetime_start: new Date(Date.now() - (20 - i) * 35000).toISOString(),
        })
      );
      llamaLines.push(
        JSON.stringify({
          op_code: 7,
          trial_id: i,
          user_attr: {
            index: t.idx,
            parameters: {
              direction_index: t.dir,
              weight_distributions: {
                'attn.o_proj': {
                  max_weight: t.attnMax,
                  max_weight_position: t.attnPos,
                  min_weight: t.attnMin,
                  min_weight_distance: t.attnDist,
                },
                'mlp.down_proj': {
                  max_weight: t.mlpMax,
                  max_weight_position: t.mlpPos,
                  min_weight: t.mlpMin,
                  min_weight_distance: t.mlpDist,
                },
              },
            },
            scores: [
              {
                name: 'Refusals',
                score: {
                  value: t.ref / 100,
                  rich_display: `[bold]${t.ref}[/]/100`,
                  md_display: `${t.ref}/100`,
                },
                baseline: {
                  value: 0.94,
                  rich_display: '[bold]94[/]/100',
                  md_display: '94/100',
                },
              },
              {
                name: 'KL divergence',
                score: {
                  value: t.kl,
                  rich_display: `[bold]${t.kl.toFixed(4)}[/]`,
                  md_display: `${t.kl.toFixed(4)}`,
                },
                baseline: {
                  value: 0,
                  rich_display: '[bold]0[/] [italic](by definition)[/]',
                  md_display: '0 *(by definition)*',
                },
              },
            ],
          },
        })
      );
      llamaLines.push(
        JSON.stringify({
          op_code: 6,
          trial_id: i,
          state: 1,
          values: [t.ref / 100, t.kl],
          datetime_complete: new Date(Date.now() - (20 - i) * 35000 + 30000).toISOString(),
        })
      );
    }
    fs.writeFileSync(llamaFile, llamaLines.join('\n') + '\n', 'utf-8');
  }

  // 3. Seed Grimoire Reproducible Manifests (v4 format)
  const sampleReproducePath = path.join(
    grimoireDir,
    'Qwen3-4B-Instruct-2507-heretic-a91f3c2.json'
  );
  if (!fs.existsSync(sampleReproducePath)) {
    const manifest = {
      version: '4',
      timestamp: '2026-10-28T19:42:10',
      system: {
        python: {
          version: '3.12.7',
          implementation: 'CPython',
          compiler: 'GCC 13.2.0',
          environment: 'Virtualenv/Venv',
        },
        os: {
          platform: 'Linux-6.8.0-87-generic-x86_64-with-glibc2.39',
          machine: 'x86_64',
        },
        cpu: {
          brand: 'AMD Ryzen Threadripper PRO 7975WX 32-Cores',
          vendor: 'AuthenticAMD',
          family: 25,
          model: 24,
          stepping: 1,
        },
        accelerators: {
          type: 'CUDA',
          api_name: 'CUDA Version',
          api_version: '12.8',
          driver_version: '570.86.15',
          devices: [
            {
              name: 'NVIDIA RTX PRO 6000 Blackwell Workstation Edition',
              vram_gb: 95.59,
            },
          ],
        },
      },
      environment: {
        heretic: {
          version: '2.1.0',
          is_standard_pypi: true,
          metadata: { type: 'pypi' },
        },
        pytorch_version: '2.6.0+cu128',
        requirements: {
          accelerate: '1.15.0',
          bitsandbytes: '0.50.1',
          datasets: '5.0.0',
          'huggingface-hub': '1.33.0',
          optuna: '5.0.0',
          peft: '0.21.2',
          transformers: '5.18.0',
        },
      },
      settings: {
        model: 'Qwen/Qwen3-4B-Instruct-2507',
        model_commit: 'a91f3c284e71b208f91c229a087123bc9012ef01',
        quantization: 'none',
        batch_size: 32,
        max_response_length: 100,
        modified_model_type: 'decensored',
        n_trials: 30,
        n_startup_trials: 10,
        seed: 4281992,
        scorers: [
          {
            plugin: 'heretic.scorers.keyword_rate.KeywordRate',
            optimization: 'minimize',
          },
          {
            plugin: 'heretic.scorers.kl_divergence.KLDivergence',
            optimization: 'minimize',
          },
        ],
        modifiers: [{ plugin: 'heretic.modifiers.ara.ARA' }],
      },
      parameters: {
        start_layer_index: 9,
        end_layer_index: 28,
        preserve_good_behavior_weight: 0.49,
        steer_bad_behavior_weight: 0.114,
        overcorrect_relative_weight: 0.81,
        neighbor_count: 7,
      },
      scores: [
        {
          name: 'Refusals',
          score: {
            value: 0.01,
            rich_display: '[bold]1[/]/100',
            md_display: '1/100',
          },
          baseline: {
            value: 0.96,
            rich_display: '[bold]96[/]/100',
            md_display: '96/100',
          },
        },
        {
          name: 'KL divergence',
          score: {
            value: 0.1128,
            rich_display: '[bold]0.1128[/]',
            md_display: '0.1128',
          },
          baseline: {
            value: 0,
            rich_display: '[bold]0[/] [italic](by definition)[/]',
            md_display: '0 *(by definition)*',
          },
        },
      ],
      hashes: {
        'model-00001-of-00002.safetensors':
          'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        'model-00002-of-00002.safetensors':
          '8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4',
      },
    };
    fs.writeFileSync(sampleReproducePath, JSON.stringify(manifest, null, 2), 'utf-8');
  }

  const secondReproducePath = path.join(
    grimoireDir,
    'Gemma-3-12B-IT-noslop-4c8a11e.json'
  );
  if (!fs.existsSync(secondReproducePath)) {
    const manifest2 = {
      version: '4',
      timestamp: '2026-10-30T14:15:00',
      system: {
        python: {
          version: '3.11.9',
          implementation: 'CPython',
          compiler: 'GCC 12.3.0',
          environment: 'Conda',
        },
        os: {
          platform: 'Linux-6.5.0-44-generic-x86_64-with-glibc2.35',
          machine: 'x86_64',
        },
        cpu: {
          brand: 'AMD EPYC 7763 64-Core Processor',
        },
        accelerators: {
          type: 'CUDA',
          api_name: 'CUDA Version',
          api_version: '12.4',
          driver_version: '550.54.15',
          devices: [{ name: 'NVIDIA A100-SXM4-80GB', vram_gb: 80.0 }],
        },
      },
      environment: {
        heretic: {
          version: '2.1.0',
          is_standard_pypi: true,
          metadata: { type: 'pypi' },
        },
        pytorch_version: '2.6.0+cu124',
        requirements: {
          accelerate: '1.15.0',
          bitsandbytes: '0.50.1',
          optuna: '5.0.0',
          peft: '0.21.2',
          transformers: '5.18.0',
        },
      },
      settings: {
        model: 'google/gemma-3-12b-it',
        model_commit: '4c8a11e90123ab8192019f817263541298abcef0',
        quantization: 'none',
        batch_size: 16,
        max_response_length: 300,
        modified_model_type: 'slop-reduced',
        n_trials: 80,
        n_startup_trials: 25,
        seed: 7718291,
        scorers: [
          {
            plugin: 'heretic.scorers.keyword_rate.KeywordRate',
            optimization: 'minimize',
          },
          {
            plugin: 'heretic.scorers.kl_divergence.KLDivergence',
            optimization: 'minimize',
          },
        ],
        modifiers: [{ plugin: 'heretic.modifiers.ara.ARA' }],
      },
      parameters: {
        start_layer_index: 12,
        end_layer_index: 36,
        preserve_good_behavior_weight: 0.63,
        steer_bad_behavior_weight: 0.072,
        overcorrect_relative_weight: 0.54,
        neighbor_count: 9,
      },
      scores: [
        {
          name: 'Responses with slop',
          score: {
            value: 0.08,
            rich_display: '[bold]8[/]/100',
            md_display: '8/100',
          },
          baseline: {
            value: 0.87,
            rich_display: '[bold]87[/]/100',
            md_display: '87/100',
          },
        },
        {
          name: 'KL divergence',
          score: {
            value: 0.0841,
            rich_display: '[bold]0.0841[/]',
            md_display: '0.0841',
          },
          baseline: {
            value: 0,
            rich_display: '[bold]0[/] [italic](by definition)[/]',
            md_display: '0 *(by definition)*',
          },
        },
      ],
      hashes: {
        'model-00001-of-00005.safetensors':
          '4a7d1ed414474e4033ac29ccb8653d9b0000123456789abcdef0123456789abc',
      },
    };
    fs.writeFileSync(secondReproducePath, JSON.stringify(manifest2, null, 2), 'utf-8');
  }

  // 4. Seed Custom Scorer Plugin Example
  const samplePluginPath = path.join(pluginsDir, 'conciseness_scorer.py');
  if (!fs.existsSync(samplePluginPath)) {
    const pluginCode = `# Custom Heretic 2.x Scorer Plugin Example
# Usage in config.toml:
# scorers = [
#   { plugin = "plugins/conciseness_scorer.py:ConcisenessScorer", optimization = "minimize" }
# ]

from pydantic import BaseModel, Field
from heretic.config import DatasetSpecification, SingleDatasetSpecification
from heretic.scorer import Context, Score, Scorer


class Settings(BaseModel):
    score_name: str = Field(
        default="Verbosity Ratio",
        description="Name of the conciseness / verbosity score.",
    )
    target_char_length: int = Field(
        default=280,
        description="Ideal maximum character length before penalty increases.",
        gt=10,
    )
    prompts: DatasetSpecification = Field(
        default=SingleDatasetSpecification(
            dataset="mlabonne/harmless_alpaca",
            split="test[:100]",
            column="text",
        ),
        description="Prompts used to evaluate response conciseness.",
    )


class ConcisenessScorer(Scorer):
    """
    Scores how often responses exceed the target character length.
    Can be minimized alongside KLDivergence to steer models toward concise answers.
    """

    settings: Settings

    @property
    def reproducible(self) -> bool:
        return True

    @property
    def score_name(self) -> str:
        return self.settings.score_name

    def init(self, ctx: Context) -> None:
        self.prompts = ctx.load_prompts(self.settings.prompts)

    def get_score(self, ctx: Context) -> Score:
        responses = ctx.get_responses(self.prompts)
        over_limit = sum(
            1 for r in responses if len(r.strip()) > self.settings.target_char_length
        )
        ratio = float(over_limit / max(1, len(self.prompts)))
        return Score(
            value=ratio,
            rich_display=f"[bold]{over_limit}[/]/{len(self.prompts)}",
            md_display=f"{over_limit}/{len(self.prompts)}",
        )
`;
    fs.writeFileSync(samplePluginPath, pluginCode, 'utf-8');
  }
}

module.exports = {
  stripRichMarkup,
  getCheckpointFilename,
  parseOptunaJournal,
  computeAbliterationLayerProfile,
  analyzeResponseText,
  estimateModelMemory,
  getHardwareTelemetry,
  getEnvironmentStatus,
  generateModelCardPreview,
  checkReproduceManifestCompatibility,
  seedSampleCheckpointsAndGrimoire,
};
