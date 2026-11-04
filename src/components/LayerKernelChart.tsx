import React, { useMemo } from 'react';
import { OptunaStudy, OptunaTrial } from '../types/heretic';

interface LayerKernelChartProps {
  study: OptunaStudy;
  trial: OptunaTrial | null;
  totalLayers?: number;
}

export const LayerKernelChart: React.FC<LayerKernelChartProps> = ({
  study,
  trial,
  totalLayers = 32,
}) => {
  const isAbliteration =
    study.modifierType === 'Abliteration' ||
    Boolean(trial?.parameters?.weight_distributions);

  const abliterationSeries = useMemo(() => {
    if (!isAbliteration || !trial?.parameters?.weight_distributions) return null;
    const dists = trial.parameters.weight_distributions;
    const comps = Object.keys(dists);
    const layers = Array.from({ length: totalLayers }, (_, layerIdx) => {
      const point: Record<string, number> = { layerIndex: layerIdx };
      for (const comp of comps) {
        const wd = dists[comp];
        const dist = Math.abs(layerIdx - wd.max_weight_position);
        let w = 0;
        if (dist <= wd.min_weight_distance && wd.min_weight_distance > 0) {
          w =
            wd.max_weight +
            (dist / wd.min_weight_distance) * (wd.min_weight - wd.max_weight);
        }
        point[comp] = Math.max(0, w);
      }
      return point;
    });
    return { comps, layers, directionIndex: trial.parameters.direction_index };
  }, [isAbliteration, trial, totalLayers]);

  if (!trial) {
    return (
      <div className="bg-obsidian-900/90 border border-obsidian-700 rounded-xl p-4 text-xs text-slate-400">
        Select a trial to inspect its layer modification topology.
      </div>
    );
  }

  // Render Abliteration / MPOA Trapezoidal Layer Weight Kernels
  if (isAbliteration && abliterationSeries) {
    const w = 520;
    const h = 210;
    const padL = 42;
    const padR = 20;
    const padT = 20;
    const padB = 34;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;
    const maxWeightY = 1.6;

    const toX = (layerIdx: number) =>
      padL + (layerIdx / Math.max(1, totalLayers - 1)) * plotW;
    const toY = (weight: number) =>
      padT + plotH - (Math.min(maxWeightY, weight) / maxWeightY) * plotH;

    const colors: Record<string, string> = {
      'attn.o_proj': '#00f0ff',
      'mlp.down_proj': '#ff2a85',
    };

    return (
      <div className="bg-obsidian-900/90 border border-obsidian-700 rounded-xl p-4 flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">
              MPOA / Abliteration Layer Weight Kernel (Trial #{trial.index})
            </h3>
            <p className="text-xs text-slate-400">
              Direction scope:{' '}
              <span className="font-mono text-cyan-300">
                {abliterationSeries.directionIndex === null ||
                abliterationSeries.directionIndex === undefined
                  ? 'per-layer residual direction'
                  : `global interpolated @ layer ${Number(
                      abliterationSeries.directionIndex
                    ).toFixed(2)}`}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs font-mono">
            {abliterationSeries.comps.map((c) => (
              <span key={c} className="flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-sm"
                  style={{ backgroundColor: colors[c] || '#8b5cf6' }}
                />
                {c}
              </span>
            ))}
          </div>
        </div>

        <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto select-none">
          {[0, 0.5, 1.0, 1.5].map((yv) => (
            <g key={yv}>
              <line
                x1={padL}
                y1={toY(yv)}
                x2={w - padR}
                y2={toY(yv)}
                stroke="#1f2536"
                strokeDasharray="3 3"
              />
              <text
                x={padL - 6}
                y={toY(yv) + 3}
                textAnchor="end"
                className="fill-slate-400 text-[9px] font-mono"
              >
                {yv.toFixed(1)}
              </text>
            </g>
          ))}

          {[0, 8, 16, 24, totalLayers - 1].map((lv) => (
            <text
              key={lv}
              x={toX(lv)}
              y={h - 10}
              textAnchor="middle"
              className="fill-slate-400 text-[9px] font-mono"
            >
              L{lv}
            </text>
          ))}

          {/* Direction index vertical marker */}
          {typeof abliterationSeries.directionIndex === 'number' && (
            <g>
              <line
                x1={toX(abliterationSeries.directionIndex)}
                y1={padT}
                x2={toX(abliterationSeries.directionIndex)}
                y2={h - padB}
                stroke="#f59e0b"
                strokeWidth={1.5}
                strokeDasharray="4 2"
              />
              <text
                x={toX(abliterationSeries.directionIndex)}
                y={padT - 5}
                textAnchor="middle"
                className="fill-amber-400 text-[9px] font-mono"
              >
                dir={abliterationSeries.directionIndex.toFixed(1)}
              </text>
            </g>
          )}

          {abliterationSeries.comps.map((comp) => {
            const color = colors[comp] || '#8b5cf6';
            const pathD = abliterationSeries.layers
              .map((pt, i) => {
                const x = toX(pt.layerIndex);
                const y = toY(pt[comp] ?? 0);
                return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
              })
              .join(' ');
            return (
              <path
                key={comp}
                d={pathD}
                fill="none"
                stroke={color}
                strokeWidth={2.2}
              />
            );
          })}
        </svg>
      </div>
    );
  }

  // Render Arbitrary-Rank Ablation (ARA) Layer Span & L-BFGS Loss Weights
  const p = trial.parameters || {};
  const startLayer = Number(p.start_layer_index ?? 8);
  const endLayer = Number(p.end_layer_index ?? 28);
  const preserveWeight = Number(p.preserve_good_behavior_weight ?? 0.5);
  const steerWeight = Number(p.steer_bad_behavior_weight ?? 0.1);
  const overcorrectWeight = Number(p.overcorrect_relative_weight ?? 0.7);
  const neighborCount = Number(p.neighbor_count ?? 8);

  return (
    <div className="bg-obsidian-900/90 border border-obsidian-700 rounded-xl p-4 flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">
              ARA Layer Topology & L-BFGS Steering Objective (Trial #{trial.index})
            </h3>
            <p className="text-xs text-slate-400">
              Active Low-Rank Adapter Span:{' '}
              <span className="text-cyan-300 font-mono font-semibold">
                Layers [{startLayer} .. {endLayer})
              </span>{' '}
              ({Math.max(0, endLayer - startLayer)} modified transformer blocks)
            </p>
          </div>
          <span className="px-2 py-0.5 rounded bg-violet-500/15 border border-violet-500/40 text-violet-300 text-xs font-mono">
            k-NN = {neighborCount}
          </span>
        </div>

        {/* Visual Transformer Layer Stack */}
        <div className="mt-3 mb-4">
          <div className="flex items-center gap-0.5 h-7 bg-obsidian-950 p-1 rounded-lg border border-obsidian-700">
            {Array.from({ length: totalLayers }, (_, idx) => {
              const active = idx >= startLayer && idx < endLayer;
              return (
                <div
                  key={idx}
                  title={`Layer ${idx}: ${active ? 'Modified by ARA L-BFGS' : 'Frozen Base Layer'}`}
                  className={`flex-1 h-full rounded-[2px] transition-all ${
                    active
                      ? 'bg-gradient-to-t from-cyan-500 to-emerald-400 shadow-[0_0_6px_rgba(0,240,255,0.4)]'
                      : 'bg-obsidian-800/80'
                  }`}
                />
              );
            })}
          </div>
          <div className="flex justify-between text-[10px] font-mono text-slate-500 mt-1 px-1">
            <span>Layer 0 (Embeddings)</span>
            <span className="text-cyan-400">
              Start: L{startLayer} → End: L{endLayer}
            </span>
            <span>Layer {totalLayers - 1} (LM Head)</span>
          </div>
        </div>
      </div>

      {/* ARA Objective Weight Bars */}
      <div className="grid grid-cols-3 gap-3 pt-2 border-t border-obsidian-700/80">
        <div className="bg-obsidian-950/90 border border-obsidian-800 rounded-lg p-2.5">
          <div className="flex justify-between text-[11px] mb-1">
            <span className="text-slate-400">Preserve Good</span>
            <span className="font-mono text-emerald-300 font-semibold">
              {preserveWeight.toFixed(4)}
            </span>
          </div>
          <div className="w-full h-1.5 bg-obsidian-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-400"
              style={{ width: `${Math.min(100, preserveWeight * 100)}%` }}
            />
          </div>
        </div>

        <div className="bg-obsidian-950/90 border border-obsidian-800 rounded-lg p-2.5">
          <div className="flex justify-between text-[11px] mb-1">
            <span className="text-slate-400">Steer Bad (log)</span>
            <span className="font-mono text-cyan-300 font-semibold">
              {steerWeight.toFixed(4)}
            </span>
          </div>
          <div className="w-full h-1.5 bg-obsidian-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-heretic-cyan"
              style={{
                width: `${Math.min(
                  100,
                  Math.max(8, ((Math.log10(Math.max(1e-4, steerWeight)) + 4) / 4) * 100)
                )}%`,
              }}
            />
          </div>
        </div>

        <div className="bg-obsidian-950/90 border border-obsidian-800 rounded-lg p-2.5">
          <div className="flex justify-between text-[11px] mb-1">
            <span className="text-slate-400">Overcorrect</span>
            <span className="font-mono text-fuchsia-300 font-semibold">
              {overcorrectWeight.toFixed(4)}
            </span>
          </div>
          <div className="w-full h-1.5 bg-obsidian-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-fuchsia-400"
              style={{ width: `${Math.min(100, (overcorrectWeight / 1.3) * 100)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
