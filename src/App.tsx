// SPDX-License-Identifier: AGPL-3.0-or-later
// Heretic Studio — Local Electron + React UI atop p-e-w/heretic
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

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Activity,
  Cpu,
  Flame,
  FolderOpen,
  Layers,
  Play,
  Square,
  Sliders,
  Terminal,
  Sparkles,
  UploadCloud,
  Download,
  Code2,
  BookOpen,
  MessageSquare,
  CheckCircle2,
  AlertCircle,
  FileText,
  Send,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import {
  HereticConfig,
  OptunaStudy,
  OptunaTrial,
  HardwareTelemetry,
  EnvironmentStatus,
  PresetItem,
  PluginItem,
  GrimoireManifestSummary,
  ProcessState,
  ProcessLogEntry,
} from './types/heretic';
import {
  getDefaultHereticConfig,
  parseTomlToConfig,
  serializeConfigToToml,
} from './utils/tomlSync';
import { ParetoChart } from './components/ParetoChart';
import { LayerKernelChart } from './components/LayerKernelChart';
import { ConfigArchitect } from './components/ConfigArchitect';
import { SandboxAndBenchmarks } from './components/SandboxAndBenchmarks';
import {
  PluginStudioView,
  GrimoireVaultView,
} from './components/PluginsAndGrimoire';

type StudioTab =
  | 'studio'
  | 'config'
  | 'sandbox'
  | 'plugins'
  | 'grimoire'
  | 'environment';

const POPULAR_HF_MODELS = [
  'Qwen/Qwen3-4B-Instruct-2507',
  'meta-llama/Llama-3.2-3B-Instruct',
  'google/gemma-3-12b-it',
  'mistralai/Mistral-Small-24B-Instruct-2501',
  'deepseek-ai/DeepSeek-R1-Distill-Qwen-14B',
];

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<StudioTab>('studio');
  const [config, setConfig] = useState<HereticConfig>(getDefaultHereticConfig);
  const [rawToml, setRawToml] = useState<string>(() =>
    serializeConfigToToml(getDefaultHereticConfig())
  );
  const [tomlError, setTomlError] = useState<string | null>(null);

  const [presets, setPresets] = useState<PresetItem[]>([]);
  const [activePresetId, setActivePresetId] = useState<string>('default');

  const [studies, setStudies] = useState<OptunaStudy[]>([]);
  const [selectedStudyFilename, setSelectedStudyFilename] = useState<string>('');
  const [selectedTrialIndex, setSelectedTrialIndex] = useState<number | null>(
    null
  );
  const [trialsFilter, setTrialsFilter] = useState<'pareto' | 'all'>('pareto');

  const [telemetry, setTelemetry] = useState<HardwareTelemetry | null>(null);
  const [envStatus, setEnvStatus] = useState<EnvironmentStatus | null>(null);
  const [plugins, setPlugins] = useState<PluginItem[]>([]);
  const [grimoireManifests, setGrimoireManifests] = useState<
    GrimoireManifestSummary[]
  >([]);

  const [processState, setProcessState] = useState<ProcessState>({
    running: false,
    mode: null,
    model: null,
    pid: null,
    startedAt: null,
  });
  const [logs, setLogs] = useState<ProcessLogEntry[]>([
    {
      timestamp: new Date().toISOString(),
      stream: 'system',
      text: 'Heretic Studio initialized. Ready for training-free language model modification.',
    },
  ]);
  const [runMode, setRunMode] = useState<'simulate' | 'cli'>('simulate');
  const [stdinInput, setStdinInput] = useState('');

  // Export & Model Card Modal State
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportActionType, setExportActionType] = useState<'save' | 'upload'>(
    'save'
  );
  const [exportStrategy, setExportStrategy] = useState<'merge' | 'adapter'>(
    'merge'
  );
  const [exportSaveDir, setExportSaveDir] = useState('./exported-model');
  const [uploadRepoId, setUploadRepoId] = useState('');
  const [uploadReproLevel, setUploadReproLevel] = useState<
    'full' | 'basic' | 'none'
  >('full');
  const [modelCardPreview, setModelCardPreview] = useState('');
  const [showLegalModal, setShowLegalModal] = useState(false);

  const terminalEndRef = useRef<HTMLDivElement | null>(null);

  const loadInitialData = async () => {
    const api = window.hereticAPI;
    if (!api) return;

    const [
      hw,
      env,
      loadedPresets,
      loadedStudies,
      loadedPlugins,
      loadedManifests,
      diskConfig,
    ] = await Promise.all([
      api.getHardwareTelemetry(),
      api.getEnvironmentStatus(),
      api.getPresets(),
      api.listStudies(),
      api.listPlugins(),
      api.listGrimoireManifests(),
      api.readConfigToml(),
    ]);

    setTelemetry(hw);
    setEnvStatus(env);
    setPresets(loadedPresets);
    setStudies(loadedStudies);
    setPlugins(loadedPlugins);
    setGrimoireManifests(loadedManifests);

    if (diskConfig?.content) {
      const parsed = parseTomlToConfig(diskConfig.content, config.model);
      if (!parsed.error) {
        setConfig(parsed.config);
        setRawToml(diskConfig.content);
      }
    }

    if (loadedStudies.length > 0) {
      const firstStudy = loadedStudies[0];
      setSelectedStudyFilename(firstStudy.filename);
      const bestTrial = firstStudy.paretoTrials[0] || firstStudy.trials[0];
      if (bestTrial) {
        setSelectedTrialIndex(bestTrial.index);
      }
    }
  };

  useEffect(() => {
    loadInitialData();

    const api = window.hereticAPI;
    if (!api) return;

    const unsubLog = api.onProcessLog((entry) => {
      setLogs((prev) => [...prev.slice(-400), entry]);
    });

    const unsubState = api.onProcessStateChange((state) => {
      setProcessState(state);
    });

    const unsubStudy = api.onStudyUpdated(async ({ filename }) => {
      const updatedList = await api.listStudies();
      setStudies(updatedList);
      if (filename) {
        setSelectedStudyFilename(filename);
      }
    });

    const hwTimer = setInterval(async () => {
      const hw = await api.getHardwareTelemetry();
      setTelemetry(hw);
    }, 4000);

    return () => {
      unsubLog();
      unsubState();
      unsubStudy();
      clearInterval(hwTimer);
    };
  }, []);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const activeStudy: OptunaStudy | null = useMemo(() => {
    if (!studies.length) return null;
    return (
      studies.find((s) => s.filename === selectedStudyFilename) || studies[0]
    );
  }, [studies, selectedStudyFilename]);

  const selectedTrial: OptunaTrial | null = useMemo(() => {
    if (!activeStudy) return null;
    if (selectedTrialIndex !== null) {
      const found = activeStudy.trials.find(
        (t) => t.index === selectedTrialIndex
      );
      if (found) return found;
    }
    return activeStudy.paretoTrials[0] || activeStudy.trials[0] || null;
  }, [activeStudy, selectedTrialIndex]);

  // Handlers for Config <-> TOML sync
  const handleUpdateConfig = (nextConfig: HereticConfig) => {
    setConfig(nextConfig);
    setRawToml(serializeConfigToToml(nextConfig));
    setTomlError(null);
  };

  const handleUpdateRawToml = (raw: string) => {
    setRawToml(raw);
    const parsed = parseTomlToConfig(raw, config.model);
    if (parsed.error) {
      setTomlError(parsed.error);
    } else {
      setTomlError(null);
      setConfig(parsed.config);
    }
  };

  const handleSelectPreset = (preset: PresetItem) => {
    setActivePresetId(preset.id);
    const parsed = parseTomlToConfig(preset.tomlContent, config.model);
    if (!parsed.error) {
      setConfig(parsed.config);
      setRawToml(serializeConfigToToml(parsed.config));
      setTomlError(null);
    }
  };

  const handleSaveConfigToDisk = async () => {
    if (!window.hereticAPI) return;
    await window.hereticAPI.writeConfigToml(rawToml);
  };

  const handleSaveCustomPreset = async (name: string) => {
    if (!window.hereticAPI) return;
    await window.hereticAPI.saveCustomPreset(
      name,
      'User custom configuration',
      rawToml
    );
    const updated = await window.hereticAPI.getPresets();
    setPresets(updated);
  };

  const handleStartOptimization = async () => {
    if (!window.hereticAPI) return;
    const modifierPlugin =
      config.modifiers?.[0]?.plugin || 'heretic.modifiers.ara.ARA';
    const scoreName = config.scorer?.KeywordRate?.score_name || 'Refusals';

    await window.hereticAPI.startHereticProcess({
      mode: runMode,
      model: config.model,
      nTrials: runMode === 'simulate' ? Math.min(config.n_trials, 16) : config.n_trials,
      quantization: config.quantization,
      modifierPlugin,
      modifiedModelType: config.modified_model_type,
      scoreName,
      maxResponseLength: config.max_response_length,
      tomlContent: rawToml,
    });
  };

  const handleStopProcess = async () => {
    if (!window.hereticAPI) return;
    await window.hereticAPI.stopHereticProcess();
  };

  const handleSendStdin = async (textToSend?: string) => {
    const payload = textToSend ?? stdinInput;
    if (!window.hereticAPI) return;
    await window.hereticAPI.sendProcessInput(payload);
    if (textToSend === undefined) setStdinInput('');
  };

  const handleOpenExportModal = async (actionType: 'save' | 'upload') => {
    setExportActionType(actionType);
    const defaultName = `${
      (activeStudy?.model || config.model).split('/').pop() || 'model'
    }-${activeStudy?.modifiedModelType || config.modified_model_type}`;
    setExportSaveDir(`./exports/${defaultName}`);
    setUploadRepoId(`username/${defaultName}`);
    if (window.hereticAPI && activeStudy) {
      const card = await window.hereticAPI.generateModelCardPreview(
        activeStudy.filename,
        selectedTrial?.index ?? null
      );
      setModelCardPreview(card);
    }
    setShowExportModal(true);
  };

  const handleExecuteExportAction = async () => {
    if (!window.hereticAPI || !activeStudy) return;
    setShowExportModal(false);
    setActiveTab('studio');
    if (exportActionType === 'save') {
      setLogs((prev) => [
        ...prev,
        {
          timestamp: new Date().toISOString(),
          stream: 'system',
          text: `[Export] Restoring Trial #${selectedTrial?.index || 1} (${exportStrategy}) -> Saving to ${exportSaveDir}...`,
        },
      ]);
      if (runMode === 'cli') {
        await window.hereticAPI.startHereticProcess({
          mode: 'cli',
          model: activeStudy.model,
          checkpointAction: 'continue',
          exportStrategy,
          saveDirectory: exportSaveDir,
        });
      } else {
        setTimeout(() => {
          setLogs((prev) => [
            ...prev,
            {
              timestamp: new Date().toISOString(),
              stream: 'stdout',
              text: `* Restoring model from trial ${selectedTrial?.index || 1}...`,
            },
            {
              timestamp: new Date().toISOString(),
              stream: 'stdout',
              text:
                exportStrategy === 'merge'
                  ? `Saving merged safetensors model & tokenizer to ${exportSaveDir}... Done!`
                  : `Saving PEFT LoRA adapter to ${exportSaveDir}... Done!`,
            },
          ]);
        }, 500);
      }
    } else {
      setLogs((prev) => [
        ...prev,
        {
          timestamp: new Date().toISOString(),
          stream: 'system',
          text: `[Hugging Face Hub] Uploading Trial #${selectedTrial?.index || 1} (${exportStrategy}) to ${uploadRepoId} (reproducibility=${uploadReproLevel})...`,
        },
      ]);
    }
  };

  const gpu0 = telemetry?.accelerator?.devices?.[0];

  const displayedTrials = useMemo(() => {
    if (!activeStudy) return [];
    return trialsFilter === 'pareto'
      ? activeStudy.paretoTrials
      : activeStudy.trials;
  }, [activeStudy, trialsFilter]);

  return (
    <div className="h-screen w-screen flex flex-col bg-obsidian-950 text-slate-100 overflow-hidden cyber-grid">
      {/* Top Studio Header & Live Hardware Telemetry Ribbon */}
      <header className="h-14 shrink-0 bg-obsidian-900/95 border-b border-obsidian-700 px-5 flex items-center justify-between gap-4 z-20">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-obsidian-950 border border-cyan-500/40 flex items-center justify-center shadow-[0_0_15px_-3px_rgba(0,240,255,0.4)] overflow-hidden">
            <svg viewBox="0 0 256 256" className="w-7 h-7">
              <defs>
                <linearGradient id="hdrGlow" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#00f0ff" />
                  <stop offset="50%" stopColor="#10b981" />
                  <stop offset="100%" stopColor="#ff2a85" />
                </linearGradient>
              </defs>
              <g
                fill="none"
                stroke="url(#hdrGlow)"
                strokeWidth="18"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M80 68 V188" />
                <path d="M176 68 V188" />
                <path d="M80 132 L128 112 L176 132" />
                <path d="M128 48 V112" />
                <path d="M110 68 L128 46 L146 68" />
              </g>
              <circle cx="128" cy="112" r="10" fill="#ffffff" stroke="#00f0ff" strokeWidth="4" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-tight text-sm text-white">
                HERETIC STUDIO
              </span>
              <span className="px-1.5 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/30 text-[10px] font-mono text-cyan-300">
                v2.1.0 • ARA &amp; MPOA
              </span>
            </div>
            <div className="text-[11px] text-slate-400">
              Training-Free Language Model Modification &amp; Multi-Objective Steering
            </div>
          </div>
        </div>

        {/* Center Hardware Telemetry Pills */}
        <div className="hidden xl:flex items-center gap-3 text-xs font-mono">
          {gpu0 ? (
            <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-obsidian-950 border border-obsidian-700">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-slate-200 font-semibold truncate max-w-[230px]">
                {gpu0.name}
              </span>
              <span className="text-cyan-300">
                {gpu0.vramUsedGb.toFixed(1)} / {gpu0.vramTotalGb.toFixed(1)} GB VRAM
              </span>
              <span className="text-slate-400">|</span>
              <span className="text-amber-300">{gpu0.utilizationPercent}% GPU</span>
              <span className="text-slate-400">{gpu0.temperatureC}°C</span>
            </div>
          ) : (
            <div className="px-3 py-1.5 rounded-lg bg-obsidian-950 border border-obsidian-700 text-slate-400">
              CPU Mode ({telemetry?.system?.cpuCores || 8} Cores)
            </div>
          )}

          <div className="px-3 py-1.5 rounded-lg bg-obsidian-950 border border-obsidian-700 text-slate-300">
            RAM: {telemetry?.system?.ramUsedGb ?? 0} /{' '}
            {telemetry?.system?.ramTotalGb ?? 0} GB
          </div>
        </div>

        {/* Right Process Status & Quick Actions */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setShowLegalModal(true)}
            title="View AGPL-3.0-or-later License, Attribution & Corresponding Source"
            className="px-2.5 py-1 rounded-lg bg-obsidian-950 hover:bg-obsidian-800 border border-obsidian-700 text-[11px] font-mono text-slate-300 hover:text-cyan-300 transition flex items-center gap-1.5"
          >
            <FileText className="w-3 h-3 text-cyan-400" />
            AGPL-3.0 • Legal &amp; Source
          </button>
          {processState.running ? (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-fuchsia-500/15 border border-fuchsia-500/40 text-fuchsia-200 text-xs font-mono">
              <span className="w-2 h-2 rounded-full bg-fuchsia-400 animate-ping" />
              Running ({processState.mode})
              <button
                onClick={handleStopProcess}
                className="ml-1 px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-sans font-semibold flex items-center gap-1"
              >
                <Square className="w-3 h-3 fill-current" />
                Stop
              </button>
            </div>
          ) : (
            <span className="px-2.5 py-1 rounded-lg bg-obsidian-950 border border-obsidian-800 text-xs font-mono text-slate-400">
              ● Engine Idle
            </span>
          )}
        </div>
      </header>

      {/* Main Navigation Bar */}
      <nav className="h-11 shrink-0 bg-obsidian-900/70 border-b border-obsidian-800 px-5 flex items-center justify-between">
        <div className="flex items-center gap-1">
          {[
            {
              id: 'studio',
              label: 'Optimization & Pareto Studio',
              icon: Activity,
            },
            {
              id: 'config',
              label: 'Config & Preset Architect',
              icon: Sliders,
            },
            {
              id: 'sandbox',
              label: 'Prompt Sandbox & Benchmarks',
              icon: MessageSquare,
            },
            {
              id: 'plugins',
              label: 'Plugin Studio',
              icon: Code2,
            },
            {
              id: 'grimoire',
              label: 'Heretic Grimoire (Reproduce)',
              icon: BookOpen,
            },
            {
              id: 'environment',
              label: 'Hardware & Python Env',
              icon: Cpu,
            },
          ].map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as StudioTab)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 transition ${
                  active
                    ? 'bg-cyan-500/15 text-heretic-cyan border border-cyan-500/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-obsidian-800/50'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="hidden lg:flex items-center gap-2 text-xs font-mono text-slate-400">
          <span>Active Target:</span>
          <span className="text-cyan-300 font-semibold">{config.model}</span>
          <span className="px-1.5 py-0.5 rounded bg-obsidian-800 text-slate-300 text-[10px]">
            {config.modified_model_type}
          </span>
        </div>
      </nav>

      {/* Main Scrollable Content Area */}
      <main className="flex-1 overflow-y-auto p-5">
        {/* TAB 1: OPTIMIZATION & PARETO STUDIO */}
        {activeTab === 'studio' && (
          <div className="space-y-5">
            {/* Launch & Target Control Bar */}
            <div className="bg-obsidian-900 border border-obsidian-700 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[300px]">
                <div className="flex-1 min-w-[240px]">
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Target Hugging Face Model ID or Local Path
                  </label>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={config.model}
                      onChange={(e) =>
                        handleUpdateConfig({ ...config, model: e.target.value })
                      }
                      className="flex-1 bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-100 focus:outline-none focus:border-heretic-cyan"
                    />
                    <select
                      value=""
                      onChange={(e) => {
                        if (e.target.value) {
                          handleUpdateConfig({
                            ...config,
                            model: e.target.value,
                          });
                        }
                      }}
                      className="bg-obsidian-950 border border-obsidian-700 rounded-lg px-2 py-1.5 text-xs text-slate-300"
                    >
                      <option value="">Popular Models...</option>
                      {POPULAR_HF_MODELS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Steering Preset
                  </label>
                  <select
                    value={activePresetId}
                    onChange={(e) => {
                      const found = presets.find(
                        (p) => p.id === e.target.value
                      );
                      if (found) handleSelectPreset(found);
                    }}
                    className="bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-1.5 text-xs text-slate-100"
                  >
                    {presets.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Execution Engine
                  </label>
                  <select
                    value={runMode}
                    onChange={(e) =>
                      setRunMode(e.target.value as 'simulate' | 'cli')
                    }
                    className="bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-1.5 text-xs font-mono text-cyan-300"
                  >
                    <option value="simulate">
                      Guided Live Simulation (Instant Optuna TPE)
                    </option>
                    <option value="cli">
                      Real Heretic Python CLI (GPU Inference)
                    </option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                {processState.running ? (
                  <button
                    onClick={handleStopProcess}
                    className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs flex items-center gap-2 shadow-lg transition"
                  >
                    <Square className="w-4 h-4 fill-current" />
                    Stop Active Study
                  </button>
                ) : (
                  <button
                    onClick={handleStartOptimization}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-heretic-cyan to-emerald-400 hover:opacity-95 text-obsidian-950 font-bold text-xs flex items-center gap-2 glow-cyan transition"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    Launch Heretic Run
                  </button>
                )}
              </div>
            </div>

            {/* Middle Studio Grid: Checkpoints Sidebar + Charts + Trial Table */}
            <div className="grid grid-cols-12 gap-5">
              {/* Left 3 Cols: Study Checkpoints List (`checkpoints/*.jsonl`) */}
              <div className="col-span-12 xl:col-span-3 bg-obsidian-900 border border-obsidian-700 rounded-xl p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-heretic-cyan" />
                      Optuna Study Journals ({studies.length})
                    </h3>
                    <button
                      onClick={async () => {
                        if (window.hereticAPI) {
                          setStudies(await window.hereticAPI.listStudies());
                        }
                      }}
                      className="text-slate-400 hover:text-cyan-300"
                      title="Refresh checkpoints/"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
                    {studies.map((st) => {
                      const active = activeStudy?.filename === st.filename;
                      return (
                        <div
                          key={st.filename}
                          onClick={() => {
                            setSelectedStudyFilename(st.filename);
                            const best = st.paretoTrials[0] || st.trials[0];
                            if (best) setSelectedTrialIndex(best.index);
                          }}
                          className={`p-3 rounded-xl border cursor-pointer transition ${
                            active
                              ? 'bg-cyan-500/15 border-cyan-500/50 text-slate-100'
                              : 'bg-obsidian-950/80 border-obsidian-800 text-slate-300 hover:border-obsidian-600'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs font-semibold truncate">
                              {st.model}
                            </span>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                                st.modifierType === 'Abliteration'
                                  ? 'bg-fuchsia-500/20 text-fuchsia-300'
                                  : 'bg-cyan-500/20 text-cyan-300'
                              }`}
                            >
                              {st.modifierType}
                            </span>
                          </div>
                          <div className="flex items-center justify-between mt-2 text-[11px] font-mono text-slate-400">
                            <span>
                              {st.completedTrialsCount}/{st.nTrialsTarget} trials
                            </span>
                            <span className="text-emerald-400">
                              ★ {st.paretoCount} Pareto
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {activeStudy && (
                  <div className="mt-4 pt-3 border-t border-obsidian-800 flex items-center justify-between text-[11px] text-slate-400">
                    <span className="font-mono truncate">
                      checkpoints/{activeStudy.filename}
                    </span>
                    <button
                      onClick={async () => {
                        if (!window.hereticAPI) return;
                        await window.hereticAPI.deleteStudy(
                          activeStudy.filename
                        );
                        setStudies(await window.hereticAPI.listStudies());
                      }}
                      className="text-slate-500 hover:text-rose-400 p-1"
                      title="Delete checkpoint file"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Center/Right 9 Cols: Pareto Chart + Layer Kernel Chart + Trial Inspector */}
              <div className="col-span-12 xl:col-span-9 space-y-5">
                {activeStudy ? (
                  <>
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                      <div className="lg:col-span-7">
                        <ParetoChart
                          study={activeStudy}
                          selectedTrialIndex={selectedTrial?.index ?? null}
                          onSelectTrial={(t) => setSelectedTrialIndex(t.index)}
                        />
                      </div>
                      <div className="lg:col-span-5 flex flex-col justify-between gap-4">
                        <LayerKernelChart
                          study={activeStudy}
                          trial={selectedTrial}
                        />

                        {/* Selected Trial Export & Action Card */}
                        {selectedTrial && (
                          <div className="bg-obsidian-900 border border-obsidian-700 rounded-xl p-4 flex flex-col justify-between">
                            <div className="flex items-center justify-between mb-2">
                              <div>
                                <div className="text-xs font-semibold text-slate-100 flex items-center gap-2">
                                  Selected Trial #{selectedTrial.index} Actions
                                  {selectedTrial.isParetoOptimal && (
                                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-mono">
                                      Pareto Optimal
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-400">
                                  Restore LoRA adapter weights and export, upload, or chat.
                                </div>
                              </div>
                            </div>

                            <div className="grid grid-cols-3 gap-2 mt-2">
                              <button
                                onClick={() => handleOpenExportModal('save')}
                                className="px-3 py-2 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-200 text-xs font-medium flex items-center justify-center gap-1.5 transition"
                              >
                                <Download className="w-3.5 h-3.5" />
                                Save Local
                              </button>
                              <button
                                onClick={() => handleOpenExportModal('upload')}
                                className="px-3 py-2 rounded-lg bg-fuchsia-500/20 hover:bg-fuchsia-500/30 border border-fuchsia-500/40 text-fuchsia-200 text-xs font-medium flex items-center justify-center gap-1.5 transition"
                              >
                                <UploadCloud className="w-3.5 h-3.5" />
                                Push to Hub
                              </button>
                              <button
                                onClick={() => setActiveTab('sandbox')}
                                className="px-3 py-2 rounded-lg bg-obsidian-800 hover:bg-obsidian-700 border border-obsidian-600 text-slate-200 text-xs font-medium flex items-center justify-center gap-1.5 transition"
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                                Test &amp; Benchmark
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Pareto Optimal & All Trials Table */}
                    <div className="bg-obsidian-900 border border-obsidian-700 rounded-xl p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold text-slate-100">
                            Study Trials &amp; Hyperparameters
                          </h3>
                          <div className="flex rounded-lg bg-obsidian-950 p-0.5 border border-obsidian-800 text-xs">
                            <button
                              onClick={() => setTrialsFilter('pareto')}
                              className={`px-2.5 py-1 rounded-md transition ${
                                trialsFilter === 'pareto'
                                  ? 'bg-cyan-500/20 text-cyan-300 font-medium'
                                  : 'text-slate-400'
                              }`}
                            >
                              Pareto Frontier ({activeStudy.paretoCount})
                            </button>
                            <button
                              onClick={() => setTrialsFilter('all')}
                              className={`px-2.5 py-1 rounded-md transition ${
                                trialsFilter === 'all'
                                  ? 'bg-cyan-500/20 text-cyan-300 font-medium'
                                  : 'text-slate-400'
                              }`}
                            >
                              All Trials ({activeStudy.totalTrials})
                            </button>
                          </div>
                        </div>
                        <span className="text-xs text-slate-400 font-mono">
                          Click any trial row to inspect its layer kernel &amp; export
                        </span>
                      </div>

                      <div className="max-h-56 overflow-y-auto">
                        <table className="w-full text-left text-xs font-mono">
                          <thead>
                            <tr className="border-b border-obsidian-800 text-slate-400 text-[11px]">
                              <th className="py-2 px-2">Trial</th>
                              <th className="py-2 px-2">Status</th>
                              {activeStudy.scoreMetrics.map((m) => (
                                <th key={m.name} className="py-2 px-2">
                                  {m.name} (Base: {m.baseline.md_display})
                                </th>
                              ))}
                              <th className="py-2 px-2">Modifier Parameters</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-obsidian-800/60">
                            {displayedTrials.map((tr) => {
                              const isSel = tr.index === selectedTrial?.index;
                              return (
                                <tr
                                  key={tr.trialId}
                                  onClick={() => setSelectedTrialIndex(tr.index)}
                                  className={`cursor-pointer transition ${
                                    isSel
                                      ? 'bg-cyan-500/15 text-white'
                                      : 'hover:bg-obsidian-800/50 text-slate-300'
                                  }`}
                                >
                                  <td className="py-2 px-2 font-semibold">
                                    #{tr.index}
                                  </td>
                                  <td className="py-2 px-2">
                                    {tr.isParetoOptimal ? (
                                      <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px]">
                                        ★ PARETO
                                      </span>
                                    ) : (
                                      <span className="text-slate-500 text-[10px]">
                                        COMPLETE
                                      </span>
                                    )}
                                  </td>
                                  {tr.scores.map((s) => (
                                    <td
                                      key={s.name}
                                      className="py-2 px-2 text-cyan-300 font-semibold"
                                    >
                                      {s.score.md_display}
                                    </td>
                                  ))}
                                  <td className="py-2 px-2 text-[11px] text-slate-400 truncate max-w-[360px]">
                                    {tr.parameters?.weight_distributions
                                      ? `dir=${
                                          tr.parameters.direction_index ??
                                          'per-layer'
                                        } | attn.max=${
                                          tr.parameters.weight_distributions[
                                            'attn.o_proj'
                                          ]?.max_weight
                                        } | mlp.max=${
                                          tr.parameters.weight_distributions[
                                            'mlp.down_proj'
                                          ]?.max_weight
                                        }`
                                      : `L[${tr.parameters?.start_layer_index}..${tr.parameters?.end_layer_index}) preserve=${tr.parameters?.preserve_good_behavior_weight} steer=${tr.parameters?.steer_bad_behavior_weight} over=${tr.parameters?.overcorrect_relative_weight}`}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="bg-obsidian-900 border border-obsidian-700 rounded-xl p-8 text-center text-slate-400">
                    No studies loaded. Click &ldquo;Launch Heretic Run&rdquo; above to start.
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Live Interactive Heretic Console & Questionary Controller */}
            <div className="bg-obsidian-900 border border-obsidian-700 rounded-xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-heretic-cyan" />
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
                    Live Heretic Process Stream &amp; Interactive Console
                  </h3>
                </div>
                <div className="flex items-center gap-1.5 text-[11px]">
                  <span className="text-slate-500 mr-1">
                    Quick Interactive CLI Replies:
                  </span>
                  {['continue', 'restart', 'save', 'merge', 'adapter'].map(
                    (cmd) => (
                      <button
                        key={cmd}
                        onClick={() => handleSendStdin(cmd)}
                        className="px-2 py-0.5 rounded bg-obsidian-800 hover:bg-obsidian-700 border border-obsidian-700 text-slate-300 font-mono"
                      >
                        {cmd}
                      </button>
                    )
                  )}
                  <button
                    onClick={() => setLogs([])}
                    className="ml-2 px-2 py-0.5 rounded bg-obsidian-950 text-slate-400 hover:text-slate-200"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="h-40 overflow-y-auto bg-obsidian-950 border border-obsidian-800 rounded-lg p-3 font-mono text-xs space-y-1">
                {logs.map((l, i) => (
                  <div
                    key={i}
                    className={
                      l.stream === 'stderr'
                        ? 'text-rose-400'
                        : l.stream === 'system'
                        ? 'text-cyan-400'
                        : l.stream === 'stdin'
                        ? 'text-amber-300'
                        : 'text-slate-300'
                    }
                  >
                    <span className="text-slate-600 mr-2">
                      [{l.timestamp.slice(11, 19)}]
                    </span>
                    {l.text}
                  </div>
                ))}
                <div ref={terminalEndRef} />
              </div>

              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={stdinInput}
                  onChange={(e) => setStdinInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendStdin()}
                  placeholder="Send interactive input to running Heretic CLI process..."
                  className="flex-1 bg-obsidian-950 border border-obsidian-800 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-100 focus:outline-none focus:border-heretic-cyan"
                />
                <button
                  onClick={() => handleSendStdin()}
                  className="px-3.5 py-1.5 rounded-lg bg-obsidian-800 hover:bg-obsidian-700 text-cyan-300 text-xs font-medium flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  Send
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: CONFIG & PRESET ARCHITECT */}
        {activeTab === 'config' && (
          <ConfigArchitect
            config={config}
            rawToml={rawToml}
            tomlError={tomlError}
            presets={presets}
            activePresetId={activePresetId}
            telemetry={telemetry}
            onUpdateConfig={handleUpdateConfig}
            onUpdateRawToml={handleUpdateRawToml}
            onSelectPreset={handleSelectPreset}
            onSaveConfigToDisk={handleSaveConfigToDisk}
            onSaveCustomPreset={handleSaveCustomPreset}
          />
        )}

        {/* TAB 3: PROMPT SANDBOX, CHAT & BENCHMARKS */}
        {activeTab === 'sandbox' && (
          <SandboxAndBenchmarks
            config={config}
            activeStudy={activeStudy}
            selectedTrial={selectedTrial}
            onRunEvaluateModel={async (targetModel) => {
              setActiveTab('studio');
              if (window.hereticAPI) {
                await window.hereticAPI.startHereticProcess({
                  mode: runMode,
                  model: config.model,
                  evaluateModel: targetModel,
                  tomlContent: rawToml,
                });
              }
            }}
          />
        )}

        {/* TAB 4: PLUGIN STUDIO */}
        {activeTab === 'plugins' && (
          <PluginStudioView
            plugins={plugins}
            onRefreshPlugins={async () => {
              if (window.hereticAPI) {
                setPlugins(await window.hereticAPI.listPlugins());
              }
            }}
            onAddScorerToConfig={(importPath) => {
              handleUpdateConfig({
                ...config,
                scorers: [
                  ...(config.scorers || []),
                  { plugin: importPath, optimization: 'minimize' },
                ],
              });
              setActiveTab('config');
            }}
          />
        )}

        {/* TAB 5: HERETIC GRIMOIRE & REPRODUCIBILITY VAULT */}
        {activeTab === 'grimoire' && (
          <GrimoireVaultView
            manifests={grimoireManifests}
            onRefreshManifests={async () => {
              if (window.hereticAPI) {
                setGrimoireManifests(
                  await window.hereticAPI.listGrimoireManifests()
                );
              }
            }}
            onRunReproduce={async (manifestPath) => {
              setActiveTab('studio');
              if (window.hereticAPI) {
                await window.hereticAPI.startHereticProcess({
                  mode: runMode,
                  reproducePath: manifestPath,
                });
              }
            }}
            onRunCollectReproducibles={async () => {
              setActiveTab('studio');
              if (window.hereticAPI) {
                await window.hereticAPI.startHereticProcess({
                  mode: runMode,
                  collectReproduciblesDir: 'grimoire',
                });
              }
            }}
          />
        )}

        {/* TAB 6: HARDWARE & PYTHON ENVIRONMENT MANAGER */}
        {activeTab === 'environment' && (
          <div className="grid grid-cols-12 gap-5">
            <div className="col-span-12 lg:col-span-6 bg-obsidian-900 border border-obsidian-700 rounded-xl p-5 space-y-4">
              <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                <Cpu className="w-4 h-4 text-heretic-cyan" />
                Workstation Accelerator &amp; System Telemetry
              </h2>

              <div className="space-y-3">
                {(telemetry?.accelerator?.devices || []).map((dev) => (
                  <div
                    key={dev.index}
                    className="p-4 rounded-xl bg-obsidian-950 border border-obsidian-800 space-y-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-cyan-300">
                        CUDA {dev.index}: {dev.name}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 text-xs font-mono">
                        Driver {dev.driverVersion}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-xs font-mono">
                      <div className="bg-obsidian-900 p-2.5 rounded-lg">
                        <div className="text-slate-400 text-[10px]">VRAM Usage</div>
                        <div className="text-slate-100 font-semibold mt-0.5">
                          {dev.vramUsedGb} / {dev.vramTotalGb} GB
                        </div>
                      </div>
                      <div className="bg-obsidian-900 p-2.5 rounded-lg">
                        <div className="text-slate-400 text-[10px]">Utilization</div>
                        <div className="text-slate-100 font-semibold mt-0.5">
                          {dev.utilizationPercent}% ({dev.temperatureC}°C)
                        </div>
                      </div>
                      <div className="bg-obsidian-900 p-2.5 rounded-lg">
                        <div className="text-slate-400 text-[10px]">Power Draw</div>
                        <div className="text-slate-100 font-semibold mt-0.5">
                          {dev.powerDrawW} W
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                <div className="p-4 rounded-xl bg-obsidian-950 border border-obsidian-800 grid grid-cols-2 gap-3 text-xs font-mono">
                  <div>
                    <div className="text-slate-400 text-[10px]">CPU Processor</div>
                    <div className="text-slate-200 mt-0.5">
                      {telemetry?.system?.cpuBrand} ({telemetry?.system?.cpuCores}{' '}
                      Logical Cores)
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400 text-[10px]">System Memory</div>
                    <div className="text-slate-200 mt-0.5">
                      {telemetry?.system?.ramUsedGb} GB used /{' '}
                      {telemetry?.system?.ramTotalGb} GB total (
                      {telemetry?.system?.ramFreeGb} GB free)
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="col-span-12 lg:col-span-6 bg-obsidian-900 border border-obsidian-700 rounded-xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold text-slate-100">
                    Python &amp; Heretic Dependency Matrix
                  </h2>
                  <p className="text-xs text-slate-400 font-mono">
                    Interpreter: {envStatus?.executable || 'python3'} (Python{' '}
                    {envStatus?.pythonVersion || 'detected'})
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      if (!window.hereticAPI) return;
                      setActiveTab('studio');
                      await window.hereticAPI.runEnvironmentSetup({
                        source: 'vendor',
                      });
                    }}
                    className="px-3 py-1.5 rounded-lg bg-heretic-cyan text-obsidian-950 font-semibold text-xs transition"
                  >
                    1-Click Setup .venv (Bundled Heretic)
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                {[
                  'heretic-llm',
                  'torch',
                  'transformers',
                  'optuna',
                  'peft',
                  'bitsandbytes',
                  'accelerate',
                  'datasets',
                  'lm-eval',
                  'huggingface-hub',
                ].map((pkg) => {
                  const ver = envStatus?.packages?.[pkg];
                  return (
                    <div
                      key={pkg}
                      className="p-2.5 rounded-lg bg-obsidian-950 border border-obsidian-800 flex items-center justify-between text-xs font-mono"
                    >
                      <span className="text-slate-200">{pkg}</span>
                      {ver ? (
                        <span className="text-emerald-400 font-semibold">
                          v{ver}
                        </span>
                      ) : (
                        <span className="text-slate-500 text-[11px]">
                          not in current env
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="p-3 rounded-lg bg-obsidian-950 border border-obsidian-800 text-xs text-slate-400">
                Bundled upstream Heretic source detected in{' '}
                <code className="text-cyan-300">./vendor/heretic</code>. Clicking
                &ldquo;1-Click Setup .venv&rdquo; creates a local virtual environment
                and installs <code className="text-cyan-300">heretic-llm</code> directly.
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Export / Upload & Model Card Preview Modal */}
      {showExportModal && activeStudy && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-obsidian-900 border border-obsidian-600 rounded-2xl max-w-3xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-obsidian-800">
              <div>
                <h3 className="text-base font-semibold text-slate-100">
                  {exportActionType === 'save'
                    ? `Export Modified Model to Local Disk (Trial #${selectedTrial?.index})`
                    : `Push Modified Model & Reproducibility Folder to Hugging Face (Trial #${selectedTrial?.index})`}
                </h3>
                <p className="text-xs text-slate-400">
                  Model: <span className="text-cyan-300 font-mono">{activeStudy.model}</span>
                </p>
              </div>
              <button
                onClick={() => setShowExportModal(false)}
                className="text-slate-400 hover:text-white text-lg px-2"
              >
                ×
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Export Strategy (<code className="text-cyan-300">export_strategy</code>)
                </label>
                <select
                  value={exportStrategy}
                  onChange={(e) =>
                    setExportStrategy(e.target.value as 'merge' | 'adapter')
                  }
                  className="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-xs font-mono"
                >
                  <option value="merge">
                    merge — Merge LoRA adapter and export full safetensors model
                  </option>
                  <option value="adapter">
                    adapter — Export PEFT LoRA adapter only (lightweight)
                  </option>
                </select>
              </div>

              {exportActionType === 'save' ? (
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Destination Directory (<code className="text-cyan-300">save_directory</code>)
                  </label>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={exportSaveDir}
                      onChange={(e) => setExportSaveDir(e.target.value)}
                      className="flex-1 bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-xs font-mono"
                    />
                    <button
                      onClick={async () => {
                        if (window.hereticAPI) {
                          const dir =
                            await window.hereticAPI.selectDirectoryDialog();
                          if (dir) setExportSaveDir(dir);
                        }
                      }}
                      className="px-2.5 py-2 rounded-lg bg-obsidian-800 border border-obsidian-700 text-slate-300"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      HF Repository ID
                    </label>
                    <input
                      type="text"
                      value={uploadRepoId}
                      onChange={(e) => setUploadRepoId(e.target.value)}
                      className="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-2.5 py-2 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Reproducibility Manifest
                    </label>
                    <select
                      value={uploadReproLevel}
                      onChange={(e) =>
                        setUploadReproLevel(e.target.value as any)
                      }
                      className="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-2.5 py-2 text-xs font-mono"
                    >
                      <option value="full">full (reproduce/ + system info)</option>
                      <option value="basic">basic (settings + pkg versions)</option>
                      <option value="none">none</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Generated Model Card Preview */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-cyan-400" />
                Auto-Generated Hugging Face Model Card (README.md) Preview
              </label>
              <pre className="bg-obsidian-950 border border-obsidian-800 rounded-lg p-3.5 text-[11px] font-mono text-slate-300 max-h-56 overflow-y-auto whitespace-pre-wrap">
                {modelCardPreview}
              </pre>
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                onClick={() => setShowExportModal(false)}
                className="px-4 py-2 rounded-lg bg-obsidian-800 text-slate-300 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteExportAction}
                className="px-5 py-2 rounded-lg bg-heretic-cyan text-obsidian-950 font-semibold text-xs"
              >
                {exportActionType === 'save'
                  ? 'Export Model Now'
                  : 'Upload to Hugging Face'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AGPL-3.0 Appropriate Legal Notices & Source Modal (AGPLv3 § 0, § 5, § 13) */}
      {showLegalModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-obsidian-900 border border-obsidian-700 rounded-2xl w-full max-w-2xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-obsidian-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <FileText className="w-4 h-4 text-cyan-400" />
                  Appropriate Legal Notices, License &amp; Corresponding Source
                </h3>
                <p className="text-xs text-slate-400">
                  GNU Affero General Public License v3.0 or later (AGPL-3.0-or-later)
                </p>
              </div>
              <button
                onClick={() => setShowLegalModal(false)}
                className="text-xs text-slate-400 hover:text-white px-2 py-1"
              >
                ✕ Close
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-300 leading-relaxed max-h-[65vh] overflow-y-auto pr-1">
              <div className="bg-obsidian-950 border border-obsidian-800 rounded-lg p-3.5 space-y-1.5 font-mono text-[11px]">
                <div className="text-cyan-300 font-semibold">
                  Copyright &amp; Attribution Notices
                </div>
                <div>
                  • Upstream Heretic Core (<code className="text-slate-200">vendor/heretic</code>, presets &amp; algorithms):{' '}
                  <span className="text-white">
                    Copyright © 2025–2026 Philipp Emanuel Weidmann (&lt;pew@worldwidemann.com&gt;) + contributors
                  </span>
                </div>
                <div>
                  • Heretic Studio Desktop UI &amp; Engine Integration:{' '}
                  <span className="text-white">
                    Copyright © 2026 Vincent Serpico
                  </span>
                </div>
              </div>

              <div className="bg-obsidian-950 border border-obsidian-800 rounded-lg p-3.5 space-y-1.5">
                <div className="text-emerald-300 font-semibold font-mono text-[11px]">
                  Notice of Modification (AGPLv3 Section 5a &amp; 5b)
                </div>
                <p>
                  This work bundles and extends{' '}
                  <a
                    href="https://github.com/p-e-w/heretic"
                    target="_blank"
                    rel="noreferrer"
                    className="text-cyan-400 underline"
                  >
                    p-e-w/heretic
                  </a>
                  . Modified and extended on <strong>November 3, 2026</strong> by Vincent Serpico to provide an interactive Electron + React + TypeScript desktop studio, live Optuna JournalStorage parser, multi-objective Pareto &amp; layer ablation kernel visualizers, bidirectional <code className="text-cyan-300">config.toml</code> architect, prompt sandbox, plugin IDE, and Grimoire reproducibility inspector. The entire combined work is released under the <strong>GNU Affero General Public License v3.0 or later (AGPL-3.0-or-later)</strong>.
                </p>
              </div>

              <div className="bg-obsidian-950 border border-obsidian-800 rounded-lg p-3.5 space-y-1.5 font-mono text-[11px]">
                <div className="text-amber-300 font-semibold">
                  Free Software &amp; Disclaimer of Warranty (AGPLv3 Sections 15 &amp; 16)
                </div>
                <p>
                  This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
                </p>
                <p>
                  This program is distributed in the hope that it will be useful, but <strong>WITHOUT ANY WARRANTY</strong>; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License (<code className="text-cyan-300">LICENSE</code> in the repository root and <code className="text-cyan-300">vendor/heretic/LICENSE</code>) for more details.
                </p>
              </div>

              <div className="bg-obsidian-950 border border-obsidian-800 rounded-lg p-3.5 space-y-2">
                <div className="text-cyan-300 font-semibold font-mono text-[11px]">
                  Corresponding Source Code &amp; License Links (AGPLv3 Section 13)
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <a
                    href="https://github.com/VincentAZ/Heretic"
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 rounded-lg bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 font-mono text-[11px] hover:bg-cyan-500/25"
                  >
                    Heretic Studio Source (GitHub) ↗
                  </a>
                  <a
                    href="https://github.com/p-e-w/heretic"
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 rounded-lg bg-obsidian-800 border border-obsidian-700 text-slate-200 font-mono text-[11px] hover:bg-obsidian-700"
                  >
                    Upstream p-e-w/heretic Source ↗
                  </a>
                  <a
                    href="https://www.gnu.org/licenses/agpl-3.0.html"
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 rounded-lg bg-obsidian-800 border border-obsidian-700 text-slate-200 font-mono text-[11px] hover:bg-obsidian-700"
                  >
                    Full GNU AGPL v3.0 Text ↗
                  </a>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setShowLegalModal(false)}
                className="px-4 py-2 rounded-lg bg-heretic-cyan text-obsidian-950 font-semibold text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
