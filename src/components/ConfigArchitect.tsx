import React, { useState, useMemo } from 'react';
import {
  Sliders,
  Cpu,
  Layers,
  Target,
  FileCode2,
  Save,
  Plus,
  Trash2,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Search,
} from 'lucide-react';
import {
  HereticConfig,
  PresetItem,
  HardwareTelemetry,
} from '../types/heretic';

interface ConfigArchitectProps {
  config: HereticConfig;
  rawToml: string;
  tomlError: string | null;
  presets: PresetItem[];
  activePresetId: string;
  telemetry: HardwareTelemetry | null;
  onUpdateConfig: (next: HereticConfig) => void;
  onUpdateRawToml: (raw: string) => void;
  onSelectPreset: (preset: PresetItem) => void;
  onSaveConfigToDisk: () => void;
  onSaveCustomPreset: (name: string) => void;
}

export const ConfigArchitect: React.FC<ConfigArchitectProps> = ({
  config,
  rawToml,
  tomlError,
  presets,
  activePresetId,
  telemetry,
  onUpdateConfig,
  onUpdateRawToml,
  onSelectPreset,
  onSaveConfigToDisk,
  onSaveCustomPreset,
}) => {
  const [subTab, setSubTab] = useState<
    'general' | 'modifier' | 'scorers' | 'toml'
  >('general');
  const [newMarkerText, setNewMarkerText] = useState('');
  const [markerSearch, setMarkerSearch] = useState('');
  const [customPresetName, setCustomPresetName] = useState('');
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  // Estimate memory footprint
  const memEst = useMemo(() => {
    const m = String(config.model || '').match(/(\d+(?:\.\d+)?)\s*[bB]\b/);
    const paramsB = m ? parseFloat(m[1]) : 4.0;
    const bf16 = Number((paramsB * 2.0 + Math.max(2, paramsB * 0.45)).toFixed(1));
    const bnb4 = Number((paramsB * 0.65 + Math.max(2, paramsB * 0.45)).toFixed(1));
    const cpuMerge = Number((paramsB * 3.0).toFixed(1));
    return {
      paramsB,
      activeVram: config.quantization === 'bnb_4bit' ? bnb4 : bf16,
      bf16,
      bnb4,
      cpuMerge,
    };
  }, [config.model, config.quantization]);

  const activeModifierPlugin =
    config.modifiers?.[0]?.plugin || 'heretic.modifiers.ara.ARA';
  const isAbliteration = activeModifierPlugin
    .toLowerCase()
    .includes('abliteration');

  const keywordMarkers: string[] =
    config.scorer?.KeywordRate?.keyword_markers || [];

  const filteredMarkers = useMemo(() => {
    if (!markerSearch.trim()) return keywordMarkers;
    const q = markerSearch.toLowerCase();
    return keywordMarkers.filter((m) => m.toLowerCase().includes(q));
  }, [keywordMarkers, markerSearch]);

  const patchField = (key: keyof HereticConfig, value: any) => {
    onUpdateConfig({
      ...config,
      [key]: value,
    });
  };

  const patchModifierSetting = (
    modClass: 'ARA' | 'Abliteration',
    key: string,
    value: any
  ) => {
    const existingMod = config.modifier || {};
    const currentClassObj = existingMod[modClass] || {};
    onUpdateConfig({
      ...config,
      modifier: {
        ...existingMod,
        [modClass]: {
          ...currentClassObj,
          [key]: value,
        },
      },
    });
  };

  const patchScorerSetting = (
    scorerClass: string,
    key: string,
    value: any
  ) => {
    const existingScorer = config.scorer || {};
    const currentObj = existingScorer[scorerClass] || {};
    onUpdateConfig({
      ...config,
      scorer: {
        ...existingScorer,
        [scorerClass]: {
          ...currentObj,
          [key]: value,
        },
      },
    });
  };

  const handleAddMarker = () => {
    const clean = newMarkerText.trim();
    if (!clean) return;
    if (!keywordMarkers.includes(clean)) {
      patchScorerSetting('KeywordRate', 'keyword_markers', [
        ...keywordMarkers,
        clean,
      ]);
    }
    setNewMarkerText('');
  };

  const handleRemoveMarker = (marker: string) => {
    if (keywordMarkers.length <= 1) return; // Heretic requires at least 1 marker
    patchScorerSetting(
      'KeywordRate',
      'keyword_markers',
      keywordMarkers.filter((m) => m !== marker)
    );
  };

  const triggerSavedBanner = (msg: string) => {
    setSavedNotice(msg);
    setTimeout(() => setSavedNotice(null), 2500);
  };

  const totalGpuVram = telemetry?.accelerator?.totalVramGb || 95.59;

  return (
    <div className="space-y-5">
      {/* Top Official & Custom Presets Ribbon */}
      <div className="bg-obsidian-900 border border-obsidian-700 rounded-xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-heretic-cyan" />
              Official Heretic 2.x Steering Presets & Templates
            </h2>
            <p className="text-xs text-slate-400">
              Select a preset to configure modifiers, contrasting datasets, and scorers, or customize below.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {savedNotice && (
              <span className="text-xs text-emerald-400 font-mono flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {savedNotice}
              </span>
            )}
            <input
              type="text"
              value={customPresetName}
              onChange={(e) => setCustomPresetName(e.target.value)}
              placeholder="Save as preset name..."
              className="bg-obsidian-950 border border-obsidian-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-heretic-cyan"
            />
            <button
              onClick={() => {
                if (!customPresetName.trim()) return;
                onSaveCustomPreset(customPresetName.trim());
                setCustomPresetName('');
                triggerSavedBanner('Preset saved!');
              }}
              className="px-3 py-1.5 rounded-lg bg-obsidian-800 hover:bg-obsidian-700 border border-obsidian-600 text-xs text-slate-200 font-medium transition"
            >
              Save Preset
            </button>
            <button
              onClick={() => {
                onSaveConfigToDisk();
                triggerSavedBanner('Saved config.toml');
              }}
              className="px-3.5 py-1.5 rounded-lg bg-heretic-cyan hover:opacity-90 text-obsidian-950 font-semibold text-xs flex items-center gap-1.5 transition"
            >
              <Save className="w-3.5 h-3.5" />
              Write config.toml
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-2.5">
          {presets.map((p) => {
            const active = activePresetId === p.id;
            return (
              <button
                key={p.id}
                onClick={() => onSelectPreset(p)}
                className={`text-left p-3 rounded-xl border transition flex flex-col justify-between ${
                  active
                    ? 'bg-cyan-500/15 border-heretic-cyan text-slate-100 shadow-[0_0_15px_-5px_rgba(0,240,255,0.4)]'
                    : 'bg-obsidian-950/80 border-obsidian-800 text-slate-300 hover:border-obsidian-600'
                }`}
              >
                <div>
                  <span className="inline-block px-1.5 py-0.5 rounded bg-obsidian-800 text-[10px] font-mono text-cyan-300 mb-1.5">
                    {p.badge}
                  </span>
                  <div className="text-xs font-semibold leading-snug">
                    {p.name}
                  </div>
                </div>
                <div className="text-[10px] text-slate-400 line-clamp-2 mt-1.5">
                  {p.description}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Sub-Navigation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-obsidian-900 border border-obsidian-700 rounded-xl p-2">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setSubTab('general')}
            className={`px-3.5 py-2 rounded-lg text-xs font-medium flex items-center gap-2 transition ${
              subTab === 'general'
                ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            1. Model, Hardware & Optuna Study
          </button>
          <button
            onClick={() => setSubTab('modifier')}
            className={`px-3.5 py-2 rounded-lg text-xs font-medium flex items-center gap-2 transition ${
              subTab === 'modifier'
                ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            2. Modifier Engine ({isAbliteration ? 'Abliteration / MPOA' : 'ARA'})
          </button>
          <button
            onClick={() => setSubTab('scorers')}
            className={`px-3.5 py-2 rounded-lg text-xs font-medium flex items-center gap-2 transition ${
              subTab === 'scorers'
                ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Target className="w-3.5 h-3.5" />
            3. Multi-Objective Scorers & Markers ({config.scorers?.length || 0})
          </button>
          <button
            onClick={() => setSubTab('toml')}
            className={`px-3.5 py-2 rounded-lg text-xs font-medium flex items-center gap-2 transition ${
              subTab === 'toml'
                ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileCode2 className="w-3.5 h-3.5" />
            4. Bidirectional Raw config.toml Editor
          </button>
        </div>

        {/* Live VRAM Footprint Meter */}
        <div className="flex items-center gap-3 px-3 py-1 rounded-lg bg-obsidian-950 border border-obsidian-800 text-xs font-mono">
          <span className="text-slate-400">Est. Peak VRAM:</span>
          <span
            className={
              memEst.activeVram > totalGpuVram
                ? 'text-rose-400 font-semibold'
                : 'text-emerald-400 font-semibold'
            }
          >
            ~{memEst.activeVram} GB / {totalGpuVram} GB
          </span>
        </div>
      </div>

      {/* Sub-Tab 1: General Model, Hardware & Study Settings */}
      {subTab === 'general' && (
        <div className="grid grid-cols-12 gap-5">
          <div className="col-span-12 lg:col-span-6 bg-obsidian-900 border border-obsidian-700 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-heretic-cyan" />
              Model, Quantization & Hardware Allocation
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs text-slate-400 mb-1">
                  Hugging Face Model ID or Local Path (<code className="text-cyan-300">model</code>)
                </label>
                <input
                  type="text"
                  value={config.model}
                  onChange={(e) => patchField('model', e.target.value)}
                  className="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Quantization (<code className="text-cyan-300">quantization</code>)
                </label>
                <select
                  value={config.quantization}
                  onChange={(e) =>
                    patchField(
                      'quantization',
                      e.target.value as 'none' | 'bnb_4bit'
                    )
                  }
                  className="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-100"
                >
                  <option value="none">none (Full BF16/FP16)</option>
                  <option value="bnb_4bit">bnb_4bit (bitsandbytes 4-bit)</option>
                </select>
              </div>
            </div>

            {config.quantization === 'bnb_4bit' && (
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold">
                    4-Bit Quantization Merge RAM Advisory
                  </div>
                  <div className="text-[11px] text-amber-200/80 mt-0.5">
                    Loading with <code>bnb_4bit</code> reduces GPU VRAM to ~{memEst.bnb4} GB,
                    but merging the LoRA adapter into full weights requires dequantizing the
                    base model in CPU system RAM (est. <strong>~{memEst.cpuMerge} GB RAM</strong>).
                    You can also export the LoRA adapter only.
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Batch Size (0 = Auto Benchmark)
                </label>
                <input
                  type="number"
                  min={0}
                  value={config.batch_size}
                  onChange={(e) =>
                    patchField('batch_size', parseInt(e.target.value, 10) || 0)
                  }
                  className="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Max Batch Size
                </label>
                <input
                  type="number"
                  min={1}
                  value={config.max_batch_size}
                  onChange={(e) =>
                    patchField(
                      'max_batch_size',
                      parseInt(e.target.value, 10) || 128
                    )
                  }
                  className="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Max Response Tokens
                </label>
                <input
                  type="number"
                  min={10}
                  value={config.max_response_length}
                  onChange={(e) =>
                    patchField(
                      'max_response_length',
                      parseInt(e.target.value, 10) || 100
                    )
                  }
                  className="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-100"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Device Map (<code className="text-cyan-300">device_map</code>)
                </label>
                <input
                  type="text"
                  value={
                    typeof config.device_map === 'string'
                      ? config.device_map
                      : JSON.stringify(config.device_map)
                  }
                  onChange={(e) => patchField('device_map', e.target.value)}
                  className="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Max Safetensors Shard Size
                </label>
                <input
                  type="text"
                  value={String(config.max_shard_size)}
                  onChange={(e) => patchField('max_shard_size', e.target.value)}
                  className="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-100"
                />
              </div>
            </div>

            <div className="flex items-center gap-6 pt-2">
              <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.offload_outputs_to_cpu}
                  onChange={(e) =>
                    patchField('offload_outputs_to_cpu', e.target.checked)
                  }
                  className="rounded border-obsidian-600 text-cyan-500"
                />
                Offload intermediate residuals &amp; logprobs to CPU RAM (lowers peak VRAM)
              </label>
            </div>
          </div>

          <div className="col-span-12 lg:col-span-6 bg-obsidian-900 border border-obsidian-700 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-heretic-magenta" />
              Optuna TPE Study & Prompt Framing Settings
            </h3>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Total Trials (<code className="text-cyan-300">n_trials</code>)
                </label>
                <input
                  type="number"
                  min={1}
                  value={config.n_trials}
                  onChange={(e) =>
                    patchField('n_trials', parseInt(e.target.value, 10) || 100)
                  }
                  className="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Random Startup Trials
                </label>
                <input
                  type="number"
                  min={0}
                  value={config.n_startup_trials}
                  onChange={(e) =>
                    patchField(
                      'n_startup_trials',
                      parseInt(e.target.value, 10) || 30
                    )
                  }
                  className="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Modified Model Adjective
                </label>
                <input
                  type="text"
                  value={config.modified_model_type}
                  onChange={(e) =>
                    patchField('modified_model_type', e.target.value)
                  }
                  className="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-100"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Global System Prompt (<code className="text-cyan-300">system_prompt</code>)
              </label>
              <textarea
                rows={2}
                value={config.system_prompt}
                onChange={(e) => patchField('system_prompt', e.target.value)}
                className="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Hugging Face Upload Tags (comma-separated)
              </label>
              <input
                type="text"
                value={(config.upload_tags || []).join(', ')}
                onChange={(e) =>
                  patchField(
                    'upload_tags',
                    e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean)
                  )
                }
                className="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-100"
              />
            </div>
          </div>
        </div>
      )}

      {/* Sub-Tab 2: Modifier Engine Settings (ARA vs Abliteration) */}
      {subTab === 'modifier' && (
        <div className="bg-obsidian-900 border border-obsidian-700 rounded-xl p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-obsidian-800">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">
                Active Model Modification Algorithm
              </h3>
              <p className="text-xs text-slate-400">
                Switch between Heretic 2.x&apos;s Arbitrary-Rank Ablation (ARA) and Directional Abliteration / MPOA.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  patchField('modifiers', [
                    { plugin: 'heretic.modifiers.ara.ARA' },
                  ])
                }
                className={`px-4 py-2 rounded-lg text-xs font-semibold border transition ${
                  !isAbliteration
                    ? 'bg-cyan-500/20 border-heretic-cyan text-cyan-200'
                    : 'bg-obsidian-950 border-obsidian-700 text-slate-400'
                }`}
              >
                Arbitrary-Rank Ablation (ARA) — Default
              </button>
              <button
                onClick={() =>
                  patchField('modifiers', [
                    { plugin: 'heretic.modifiers.abliteration.Abliteration' },
                  ])
                }
                className={`px-4 py-2 rounded-lg text-xs font-semibold border transition ${
                  isAbliteration
                    ? 'bg-fuchsia-500/20 border-heretic-magenta text-fuchsia-200'
                    : 'bg-obsidian-950 border-obsidian-700 text-slate-400'
                }`}
              >
                Directional Abliteration / MPOA
              </button>
            </div>
          </div>

          {!isAbliteration ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-3 bg-obsidian-950 border border-obsidian-800 rounded-xl p-4">
                <h4 className="text-xs font-semibold text-cyan-300 uppercase tracking-wider">
                  [modifier.ARA] L-BFGS &amp; Adapter Hyperparameters
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      LoRA Rank (<code>lora_rank</code>)
                    </label>
                    <input
                      type="number"
                      value={config.modifier?.ARA?.lora_rank ?? 50}
                      onChange={(e) =>
                        patchModifierSetting(
                          'ARA',
                          'lora_rank',
                          parseInt(e.target.value, 10) || 50
                        )
                      }
                      className="w-full bg-obsidian-900 border border-obsidian-700 rounded px-2.5 py-1.5 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Outer L-BFGS Steps (<code>n_optimization_steps</code>)
                    </label>
                    <input
                      type="number"
                      value={config.modifier?.ARA?.n_optimization_steps ?? 5}
                      onChange={(e) =>
                        patchModifierSetting(
                          'ARA',
                          'n_optimization_steps',
                          parseInt(e.target.value, 10) || 5
                        )
                      }
                      className="w-full bg-obsidian-900 border border-obsidian-700 rounded px-2.5 py-1.5 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Learning Rate (<code>learning_rate</code>)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={config.modifier?.ARA?.learning_rate ?? 1.0}
                      onChange={(e) =>
                        patchModifierSetting(
                          'ARA',
                          'learning_rate',
                          parseFloat(e.target.value) || 1.0
                        )
                      }
                      className="w-full bg-obsidian-900 border border-obsidian-700 rounded px-2.5 py-1.5 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Max Inner Iterations (<code>max_iter</code>)
                    </label>
                    <input
                      type="number"
                      value={config.modifier?.ARA?.max_iter ?? 20}
                      onChange={(e) =>
                        patchModifierSetting(
                          'ARA',
                          'max_iter',
                          parseInt(e.target.value, 10) || 20
                        )
                      }
                      className="w-full bg-obsidian-900 border border-obsidian-700 rounded px-2.5 py-1.5 text-xs font-mono"
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-200 pt-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={
                      config.modifier?.ARA?.preserve_row_magnitudes ?? true
                    }
                    onChange={(e) =>
                      patchModifierSetting(
                        'ARA',
                        'preserve_row_magnitudes',
                        e.target.checked
                      )
                    }
                    className="rounded border-obsidian-600 text-cyan-500"
                  />
                  Preserve original matrix row magnitudes (MPOA intelligence retention)
                </label>
              </div>

              <div className="space-y-3 bg-obsidian-950 border border-obsidian-800 rounded-xl p-4">
                <h4 className="text-xs font-semibold text-emerald-300 uppercase tracking-wider">
                  Contrasting Datasets (Good vs. Bad Prompts)
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Good Prompts Dataset
                    </label>
                    <input
                      type="text"
                      value={
                        config.modifier?.ARA?.good_prompts?.dataset ||
                        'mlabonne/harmless_alpaca'
                      }
                      onChange={(e) =>
                        patchModifierSetting('ARA', 'good_prompts', {
                          ...(config.modifier?.ARA?.good_prompts || {}),
                          dataset: e.target.value,
                        })
                      }
                      className="w-full bg-obsidian-900 border border-obsidian-700 rounded px-2.5 py-1.5 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Good Split
                    </label>
                    <input
                      type="text"
                      value={
                        config.modifier?.ARA?.good_prompts?.split ||
                        'train[:400]'
                      }
                      onChange={(e) =>
                        patchModifierSetting('ARA', 'good_prompts', {
                          ...(config.modifier?.ARA?.good_prompts || {}),
                          split: e.target.value,
                        })
                      }
                      className="w-full bg-obsidian-900 border border-obsidian-700 rounded px-2.5 py-1.5 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Bad Prompts Dataset
                    </label>
                    <input
                      type="text"
                      value={
                        config.modifier?.ARA?.bad_prompts?.dataset ||
                        'mlabonne/harmful_behaviors'
                      }
                      onChange={(e) =>
                        patchModifierSetting('ARA', 'bad_prompts', {
                          ...(config.modifier?.ARA?.bad_prompts || {}),
                          dataset: e.target.value,
                        })
                      }
                      className="w-full bg-obsidian-900 border border-obsidian-700 rounded px-2.5 py-1.5 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Bad Split
                    </label>
                    <input
                      type="text"
                      value={
                        config.modifier?.ARA?.bad_prompts?.split ||
                        'train[:400]'
                      }
                      onChange={(e) =>
                        patchModifierSetting('ARA', 'bad_prompts', {
                          ...(config.modifier?.ARA?.bad_prompts || {}),
                          split: e.target.value,
                        })
                      }
                      className="w-full bg-obsidian-900 border border-obsidian-700 rounded px-2.5 py-1.5 text-xs font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-obsidian-950 border border-obsidian-800 rounded-xl p-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Row Normalization (<code>row_normalization</code>)
                </label>
                <select
                  value={
                    config.modifier?.Abliteration?.row_normalization || 'full'
                  }
                  onChange={(e) =>
                    patchModifierSetting(
                      'Abliteration',
                      'row_normalization',
                      e.target.value
                    )
                  }
                  className="w-full bg-obsidian-900 border border-obsidian-700 rounded px-2.5 py-1.5 text-xs font-mono"
                >
                  <option value="full">full (MPOA Low-Rank SVD Norm Preserving)</option>
                  <option value="pre">pre (Pre-normalized rank-1)</option>
                  <option value="none">none (Classic Arditi et al. Abliteration)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Full Normalization SVD LoRA Rank
                </label>
                <input
                  type="number"
                  min={1}
                  value={
                    config.modifier?.Abliteration
                      ?.full_normalization_lora_rank ?? 3
                  }
                  onChange={(e) =>
                    patchModifierSetting(
                      'Abliteration',
                      'full_normalization_lora_rank',
                      parseInt(e.target.value, 10) || 3
                    )
                  }
                  className="w-full bg-obsidian-900 border border-obsidian-700 rounded px-2.5 py-1.5 text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Winsorization Quantile (Clamp massive activations)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min={0.5}
                  max={1.0}
                  value={
                    config.modifier?.Abliteration?.winsorization_quantile ?? 1.0
                  }
                  onChange={(e) =>
                    patchModifierSetting(
                      'Abliteration',
                      'winsorization_quantile',
                      parseFloat(e.target.value) || 1.0
                    )
                  }
                  className="w-full bg-obsidian-900 border border-obsidian-700 rounded px-2.5 py-1.5 text-xs font-mono"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sub-Tab 3: Multi-Objective Scorers & Interactive Keyword Marker Manager */}
      {subTab === 'scorers' && (
        <div className="grid grid-cols-12 gap-5">
          {/* Active Scorers Pipeline */}
          <div className="col-span-12 lg:col-span-5 bg-obsidian-900 border border-obsidian-700 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-100">
                Co-Optimization Scorer Pipeline
              </h3>
              <button
                onClick={() =>
                  patchField('scorers', [
                    ...(config.scorers || []),
                    {
                      plugin:
                        'heretic.scorers.bert_classifier.BERTClassifier',
                      optimization: 'minimize',
                    },
                  ])
                }
                className="px-2.5 py-1 rounded bg-cyan-500/20 border border-cyan-500/40 text-cyan-200 text-xs flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Scorer
              </button>
            </div>

            <div className="space-y-2.5">
              {(config.scorers || []).map((sc, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-lg bg-obsidian-950 border border-obsidian-800 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <input
                      type="text"
                      value={sc.plugin}
                      onChange={(e) => {
                        const next = [...config.scorers];
                        next[idx] = { ...next[idx], plugin: e.target.value };
                        patchField('scorers', next);
                      }}
                      className="flex-1 bg-obsidian-900 border border-obsidian-700 rounded px-2.5 py-1 text-xs font-mono text-cyan-300"
                    />
                    <button
                      onClick={() => {
                        if (config.scorers.length <= 1) return;
                        patchField(
                          'scorers',
                          config.scorers.filter((_, i) => i !== idx)
                        );
                      }}
                      className="p-1 text-slate-500 hover:text-rose-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-slate-400">
                        Optimization Direction
                      </label>
                      <select
                        value={sc.optimization}
                        onChange={(e) => {
                          const next = [...config.scorers];
                          next[idx] = {
                            ...next[idx],
                            optimization: e.target.value as any,
                          };
                          patchField('scorers', next);
                        }}
                        className="w-full bg-obsidian-900 border border-obsidian-700 rounded px-2 py-1 text-xs font-mono"
                      >
                        <option value="minimize">minimize</option>
                        <option value="maximize">maximize</option>
                        <option value="none">none (reference only)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400">
                        Instance Name (optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. negative_emotions"
                        value={sc.instance_name || ''}
                        onChange={(e) => {
                          const next = [...config.scorers];
                          const val = e.target.value.trim();
                          if (val) {
                            next[idx] = { ...next[idx], instance_name: val };
                          } else {
                            const copy = { ...next[idx] };
                            delete copy.instance_name;
                            next[idx] = copy;
                          }
                          patchField('scorers', next);
                        }}
                        className="w-full bg-obsidian-900 border border-obsidian-700 rounded px-2 py-1 text-xs font-mono"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Interactive KeywordRate Marker Bank */}
          <div className="col-span-12 lg:col-span-7 bg-obsidian-900 border border-obsidian-700 rounded-xl p-5 flex flex-col justify-between">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-100">
                    [scorer.KeywordRate] Marker Bank ({keywordMarkers.length} markers)
                  </h3>
                  <p className="text-xs text-slate-400">
                    Case-insensitive substrings that identify a response as a match (e.g. Refusals, Slop, Sycophancy).
                  </p>
                </div>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2" />
                  <input
                    type="text"
                    value={markerSearch}
                    onChange={(e) => setMarkerSearch(e.target.value)}
                    placeholder="Filter markers..."
                    className="bg-obsidian-950 border border-obsidian-700 rounded-lg pl-8 pr-2.5 py-1 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={newMarkerText}
                  onChange={(e) => setNewMarkerText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddMarker()}
                  placeholder="Add new keyword marker (e.g. 'as an ai', 'tapestry')..."
                  className="flex-1 bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-1.5 text-xs font-mono"
                />
                <button
                  onClick={handleAddMarker}
                  className="px-3 py-1.5 rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-200 text-xs font-medium"
                >
                  + Add Marker
                </button>
              </div>

              <div className="flex flex-wrap gap-1.5 max-h-64 overflow-y-auto p-3 rounded-lg bg-obsidian-950 border border-obsidian-800">
                {filteredMarkers.map((m) => (
                  <span
                    key={m}
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-obsidian-800 border border-obsidian-700 text-xs font-mono text-slate-200"
                  >
                    {m}
                    <button
                      onClick={() => handleRemoveMarker(m)}
                      className="text-slate-500 hover:text-rose-400"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sub-Tab 4: Bidirectional Raw TOML Code Editor */}
      {subTab === 'toml' && (
        <div className="bg-obsidian-900 border border-obsidian-700 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-100 font-mono">
                config.toml (Bidirectional Live Sync)
              </h3>
              <p className="text-xs text-slate-400">
                Any edits here immediately synchronize with the visual studio controls above.
              </p>
            </div>
            {tomlError ? (
              <span className="px-2.5 py-1 rounded bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs font-mono">
                TOML Error: {tomlError}
              </span>
            ) : (
              <span className="px-2.5 py-1 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-mono">
                ✓ Valid Heretic 2.x TOML
              </span>
            )}
          </div>
          <textarea
            value={rawToml}
            onChange={(e) => onUpdateRawToml(e.target.value)}
            rows={24}
            className="w-full bg-obsidian-950 border border-obsidian-800 rounded-lg p-4 text-xs font-mono text-cyan-100 leading-relaxed focus:outline-none focus:border-heretic-cyan"
          />
        </div>
      )}
    </div>
  );
};
