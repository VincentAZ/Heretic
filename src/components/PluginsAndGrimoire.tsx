import React, { useState, useEffect } from 'react';
import {
  Code2,
  Plus,
  Save,
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  Play,
  DownloadCloud,
  FileCheck2,
  Sparkles,
} from 'lucide-react';
import {
  PluginItem,
  GrimoireManifestSummary,
  GrimoireInspection,
} from '../types/heretic';

interface PluginsStudioProps {
  plugins: PluginItem[];
  onRefreshPlugins: () => void;
  onAddScorerToConfig: (importPath: string) => void;
}

const CUSTOM_SCORER_TEMPLATE = `from pydantic import BaseModel, Field
from heretic.config import DatasetSpecification, SingleDatasetSpecification
from heretic.scorer import Context, Score, Scorer


class Settings(BaseModel):
    score_name: str = Field(
        default="Custom Behavior Score",
        description="Name displayed in CLI and Hugging Face model card.",
    )
    prompts: DatasetSpecification = Field(
        default=SingleDatasetSpecification(
            dataset="mlabonne/harmless_alpaca",
            split="test[:100]",
            column="text",
        ),
        description="Prompts used to evaluate the custom score.",
    )


class CustomScorer(Scorer):
    """Custom Heretic 2.x Scorer Plugin."""

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
        matches = sum(1 for r in responses if "as an ai" in r.lower())
        val = float(matches / max(1, len(self.prompts)))
        return Score(
            value=val,
            rich_display=f"[bold]{matches}[/]/{len(self.prompts)}",
            md_display=f"{matches}/{len(self.prompts)}",
        )
`;

export const PluginStudioView: React.FC<PluginsStudioProps> = ({
  plugins,
  onRefreshPlugins,
  onAddScorerToConfig,
}) => {
  const [selectedPlugin, setSelectedPlugin] = useState<PluginItem | null>(
    plugins[0] || null
  );
  const [codeContent, setCodeContent] = useState('');
  const [newFilename, setNewFilename] = useState('custom_scorer.py');
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedPlugin && plugins.length > 0) {
      setSelectedPlugin(plugins[0]);
    }
  }, [plugins]);

  useEffect(() => {
    if (selectedPlugin && !isCreatingNew && window.hereticAPI) {
      window.hereticAPI
        .readPluginFile(selectedPlugin.relativePath)
        .then((txt) => setCodeContent(txt));
    }
  }, [selectedPlugin, isCreatingNew]);

  const handleStartNewPlugin = () => {
    setIsCreatingNew(true);
    setNewFilename('my_custom_scorer.py');
    setCodeContent(CUSTOM_SCORER_TEMPLATE);
  };

  const handleSavePlugin = async () => {
    if (!window.hereticAPI) return;
    const targetName = isCreatingNew
      ? newFilename
      : selectedPlugin?.name || 'custom_scorer.py';
    await window.hereticAPI.savePluginFile(targetName, codeContent);
    setIsCreatingNew(false);
    setSaveMessage(`Saved to plugins/${targetName}`);
    setTimeout(() => setSaveMessage(null), 2500);
    onRefreshPlugins();
  };

  return (
    <div className="grid grid-cols-12 gap-5">
      {/* Left Sidebar: Built-in & Custom Plugins */}
      <div className="col-span-12 lg:col-span-4 bg-obsidian-900 border border-obsidian-700 rounded-xl p-4 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <Code2 className="w-4 h-4 text-heretic-cyan" />
              Heretic 2.x Plugin Registry
            </h2>
            <button
              onClick={handleStartNewPlugin}
              className="px-2.5 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-200 text-xs font-medium flex items-center gap-1 transition"
            >
              <Plus className="w-3.5 h-3.5" />
              New Plugin
            </button>
          </div>

          <div className="space-y-1.5 max-h-[540px] overflow-y-auto pr-1">
            {plugins.map((pl) => {
              const active =
                !isCreatingNew && selectedPlugin?.relativePath === pl.relativePath;
              return (
                <div
                  key={pl.relativePath}
                  onClick={() => {
                    setIsCreatingNew(false);
                    setSelectedPlugin(pl);
                  }}
                  className={`p-3 rounded-lg border cursor-pointer transition ${
                    active
                      ? 'bg-cyan-500/15 border-cyan-500/50 text-slate-100'
                      : 'bg-obsidian-950/80 border-obsidian-800 text-slate-300 hover:border-obsidian-600'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold font-mono">{pl.name}</span>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono uppercase ${
                          pl.type === 'modifier'
                            ? 'bg-fuchsia-500/20 text-fuchsia-300'
                            : 'bg-cyan-500/20 text-cyan-300'
                        }`}
                      >
                        {pl.type}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-obsidian-800 text-slate-400 text-[10px]">
                        {pl.builtin ? 'Built-in' : 'Custom'}
                      </span>
                    </div>
                  </div>
                  <div className="text-[11px] font-mono text-slate-400 truncate mt-1">
                    {pl.importPath}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-obsidian-800 text-[11px] text-slate-400">
          Heretic loads plugins via either qualified module path (
          <code className="text-cyan-300">heretic.scorers.keyword_rate.KeywordRate</code>
          ) or file path + class (
          <code className="text-cyan-300">plugins/my_plugin.py:MyClass</code>).
        </div>
      </div>

      {/* Right 8 Cols: Python Plugin Code Inspector & Editor */}
      <div className="col-span-12 lg:col-span-8 bg-obsidian-900 border border-obsidian-700 rounded-xl p-4 flex flex-col">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            {isCreatingNew ? (
              <input
                type="text"
                value={newFilename}
                onChange={(e) => setNewFilename(e.target.value)}
                className="bg-obsidian-950 border border-cyan-500/50 rounded px-2.5 py-1 text-xs font-mono text-slate-100"
              />
            ) : (
              <div>
                <h3 className="text-sm font-semibold text-slate-100 font-mono">
                  {selectedPlugin?.relativePath}
                </h3>
                <p className="text-xs text-slate-400 font-mono">
                  Import specification: <span className="text-cyan-300">{selectedPlugin?.importPath}</span>
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {saveMessage && (
              <span className="text-xs text-emerald-400 font-mono">{saveMessage}</span>
            )}
            {selectedPlugin?.type === 'scorer' && !isCreatingNew && (
              <button
                onClick={() => onAddScorerToConfig(selectedPlugin.importPath)}
                className="px-3 py-1.5 rounded-lg bg-obsidian-800 hover:bg-obsidian-700 border border-obsidian-600 text-cyan-300 text-xs font-medium flex items-center gap-1.5 transition"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Add Scorer to Active Config
              </button>
            )}
            {(!selectedPlugin?.builtin || isCreatingNew) && (
              <button
                onClick={handleSavePlugin}
                className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-obsidian-950 font-semibold text-xs flex items-center gap-1.5 transition"
              >
                <Save className="w-3.5 h-3.5" />
                Save Custom Plugin
              </button>
            )}
          </div>
        </div>

        <textarea
          value={codeContent}
          onChange={(e) => setCodeContent(e.target.value)}
          readOnly={Boolean(selectedPlugin?.builtin && !isCreatingNew)}
          rows={24}
          className="w-full flex-1 bg-obsidian-950 border border-obsidian-800 rounded-lg p-3.5 text-xs font-mono text-slate-200 leading-relaxed focus:outline-none focus:border-cyan-500/50"
        />
      </div>
    </div>
  );
};

interface GrimoireVaultProps {
  manifests: GrimoireManifestSummary[];
  onRefreshManifests: () => void;
  onRunReproduce: (manifestPath: string) => void;
  onRunCollectReproducibles: () => void;
}

export const GrimoireVaultView: React.FC<GrimoireVaultProps> = ({
  manifests,
  onRefreshManifests,
  onRunReproduce,
  onRunCollectReproducibles,
}) => {
  const [selectedManifest, setSelectedManifest] =
    useState<GrimoireManifestSummary | null>(manifests[0] || null);
  const [inspection, setInspection] = useState<GrimoireInspection | null>(null);

  useEffect(() => {
    if (!selectedManifest && manifests.length > 0) {
      setSelectedManifest(manifests[0]);
    }
  }, [manifests]);

  useEffect(() => {
    if (selectedManifest && window.hereticAPI) {
      window.hereticAPI
        .inspectGrimoireManifest(selectedManifest.filename)
        .then((res) => setInspection(res));
    }
  }, [selectedManifest]);

  const severityBadge = (sev: string) => {
    switch (sev) {
      case 'critical':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
      case 'high':
        return 'bg-orange-500/20 text-orange-300 border-orange-500/40';
      case 'medium':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      case 'low':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      default:
        return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40';
    }
  };

  return (
    <div className="grid grid-cols-12 gap-5">
      {/* Left 4 Cols: Grimoire Manifest Library */}
      <div className="col-span-12 lg:col-span-4 bg-obsidian-900 border border-obsidian-700 rounded-xl p-4 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-heretic-cyan" />
                The Heretic Grimoire
              </h2>
              <p className="text-[11px] text-slate-400">
                Portable 9KB <code className="text-cyan-300">reproduce.json</code> v4 manifests
              </p>
            </div>
            <button
              onClick={onRunCollectReproducibles}
              title="Run heretic --collect-reproducibles grimoire/"
              className="px-2.5 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-200 text-xs font-medium flex items-center gap-1.5 transition"
            >
              <DownloadCloud className="w-3.5 h-3.5" />
              Sync Hub
            </button>
          </div>

          <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
            {manifests.map((m) => {
              const active = selectedManifest?.filename === m.filename;
              return (
                <div
                  key={m.filename}
                  onClick={() => setSelectedManifest(m)}
                  className={`p-3 rounded-lg border cursor-pointer transition ${
                    active
                      ? 'bg-cyan-500/15 border-cyan-500/50 text-slate-100'
                      : 'bg-obsidian-950/80 border-obsidian-800 text-slate-300 hover:border-obsidian-600'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold truncate">{m.model}</span>
                    <span className="px-1.5 py-0.5 rounded bg-obsidian-800 text-cyan-300 text-[10px] font-mono">
                      {m.modifiedModelType}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-slate-400 truncate mt-1">
                    {m.filename}
                  </div>
                  <div className="flex items-center justify-between mt-2 text-[10px] text-slate-400">
                    <span>{m.accelerator}</span>
                    <span>{m.hashesCount} safetensor hash(es)</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-obsidian-800 text-[11px] text-slate-400">
          Reproducing from a manifest skips the multi-hour Optuna search and directly
          applies the winning trial parameters in minutes.
        </div>
      </div>

      {/* Right 8 Cols: Manifest Inspector & Environment Mismatch Checker */}
      <div className="col-span-12 lg:col-span-8 bg-obsidian-900 border border-obsidian-700 rounded-xl p-5 space-y-4">
        {inspection ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-obsidian-800">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-slate-100">
                    {inspection.manifest.settings?.model}
                  </h3>
                  <span className="px-2 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-xs font-mono">
                    Format v{inspection.manifest.version}
                  </span>
                </div>
                <p className="text-xs text-slate-400 font-mono mt-0.5">
                  Commit: {inspection.manifest.settings?.model_commit?.slice(0, 12) || 'latest'} • Seed:{' '}
                  {inspection.manifest.settings?.seed}
                </p>
              </div>

              <button
                onClick={() => onRunReproduce(inspection.filePath)}
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-emerald-500 hover:opacity-95 text-obsidian-950 font-semibold text-xs flex items-center gap-2 shadow-lg transition"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                Reproduce Model Now (--reproduce)
              </button>
            </div>

            {/* Recorded Scores & Parameters */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-obsidian-950 border border-obsidian-800 rounded-lg p-3.5">
                <h4 className="text-xs font-semibold text-slate-300 mb-2">
                  Recorded Winning Trial Scores
                </h4>
                <div className="space-y-2">
                  {(inspection.manifest.scores || []).map((s: any) => (
                    <div
                      key={s.name}
                      className="flex items-center justify-between text-xs font-mono"
                    >
                      <span className="text-slate-400">{s.name}:</span>
                      <div>
                        <span className="text-emerald-300 font-semibold">
                          {s.score?.md_display}
                        </span>{' '}
                        <span className="text-slate-500 text-[10px]">
                          (baseline: {s.baseline?.md_display})
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-obsidian-950 border border-obsidian-800 rounded-lg p-3.5">
                <h4 className="text-xs font-semibold text-slate-300 mb-2">
                  Recorded Modifier Parameters
                </h4>
                <div className="grid grid-cols-2 gap-1.5 text-[11px] font-mono">
                  {Object.entries(inspection.manifest.parameters || {}).map(
                    ([k, v]) => (
                      <div key={k} className="truncate">
                        <span className="text-slate-400">{k}:</span>{' '}
                        <span className="text-cyan-300">{String(v)}</span>
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>

            {/* Environment Compatibility & Mismatch Table (mirrors reproduce.py check_environment) */}
            <div className="bg-obsidian-950 border border-obsidian-800 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  {inspection.compatibility.maxSeverity === 'none' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                  )}
                  <h4 className="text-xs font-semibold text-slate-200">
                    Local Environment vs. Manifest Verification (Bitwise Reproducibility Check)
                  </h4>
                </div>
                <span
                  className={`px-2 py-0.5 rounded border text-[10px] font-mono uppercase ${severityBadge(
                    inspection.compatibility.maxSeverity
                  )}`}
                >
                  Max Drift Risk: {inspection.compatibility.maxSeverity}
                </span>
              </div>

              <div className="max-h-48 overflow-y-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="border-b border-obsidian-800 text-slate-400 text-[11px]">
                      <th className="py-1.5">Component / Package</th>
                      <th className="py-1.5">This Workstation</th>
                      <th className="py-1.5">Original System</th>
                      <th className="py-1.5 text-right">Severity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-obsidian-800/60">
                    {[
                      ...inspection.compatibility.systemMismatches,
                      ...inspection.compatibility.packageMismatches,
                    ].map((m, idx) => (
                      <tr key={idx}>
                        <td className="py-1.5 font-semibold text-slate-200">
                          {m.component}
                        </td>
                        <td className="py-1.5 text-slate-300 truncate max-w-[180px]">
                          {m.thisSystem}
                        </td>
                        <td className="py-1.5 text-slate-400 truncate max-w-[180px]">
                          {m.originalSystem}
                        </td>
                        <td className="py-1.5 text-right">
                          <span
                            className={`px-1.5 py-0.5 rounded border text-[10px] uppercase ${severityBadge(
                              m.severity
                            )}`}
                          >
                            {m.severity}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* SHA256 Weight Hashes */}
            <div className="bg-obsidian-950 border border-obsidian-800 rounded-lg p-3.5">
              <h4 className="text-xs font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
                <FileCheck2 className="w-3.5 h-3.5 text-emerald-400" />
                Expected Safetensors SHA-256 Checksums
              </h4>
              <div className="space-y-1 font-mono text-[11px]">
                {Object.entries(inspection.manifest.hashes || {}).map(
                  ([file, sha]) => (
                    <div
                      key={file}
                      className="flex items-center justify-between text-slate-300 bg-obsidian-900 px-2.5 py-1 rounded"
                    >
                      <span className="text-cyan-300">{file}</span>
                      <span className="text-slate-400 truncate max-w-[360px]">
                        {String(sha)}
                      </span>
                    </div>
                  )
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="text-xs text-slate-400">
            Select a manifest from the Heretic Grimoire to inspect its reproducibility
            parameters and hardware verification report.
          </div>
        )}
      </div>
    </div>
  );
};
