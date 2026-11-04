import React, { useMemo, useState } from 'react';
import { OptunaStudy, OptunaTrial } from '../types/heretic';

interface ParetoChartProps {
  study: OptunaStudy;
  selectedTrialIndex: number | null;
  onSelectTrial: (trial: OptunaTrial) => void;
}

export const ParetoChart: React.FC<ParetoChartProps> = ({
  study,
  selectedTrialIndex,
  onSelectTrial,
}) => {
  const [hoveredTrial, setHoveredTrial] = useState<OptunaTrial | null>(null);

  const completedTrials = useMemo(
    () => study.trials.filter((t) => t.state === 1 && t.values.length >= 2),
    [study.trials]
  );

  // X axis = Objective 2 (usually KL Divergence), Y axis = Objective 1 (usually Refusals / KeywordRate)
  const metricYName = study.scoreMetrics[0]?.name || 'Objective 1 (Refusals)';
  const metricXName = study.scoreMetrics[1]?.name || 'Objective 2 (KL Divergence)';
  const dirY = study.scoreMetrics[0]?.direction || 'minimize';
  const dirX = study.scoreMetrics[1]?.direction || 'minimize';

  const bounds = useMemo(() => {
    if (completedTrials.length === 0) {
      return { minX: 0, maxX: 1, minY: 0, maxY: 1 };
    }
    const xs = completedTrials.map((t) => t.values[1] ?? 0);
    const ys = completedTrials.map((t) => t.values[0] ?? 0);
    const minX = Math.min(0, ...xs);
    const maxX = Math.max(0.15, ...xs) * 1.08;
    const minY = Math.min(0, ...ys);
    const maxY = Math.max(0.25, ...ys) * 1.08;
    return { minX, maxX, minY, maxY };
  }, [completedTrials]);

  const width = 680;
  const height = 340;
  const padLeft = 58;
  const padRight = 28;
  const padTop = 24;
  const padBottom = 44;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const toScreenX = (val: number) => {
    const span = Math.max(1e-6, bounds.maxX - bounds.minX);
    return padLeft + ((val - bounds.minX) / span) * plotW;
  };

  const toScreenY = (val: number) => {
    const span = Math.max(1e-6, bounds.maxY - bounds.minY);
    return padTop + plotH - ((val - bounds.minY) / span) * plotH;
  };

  // Sort Pareto points by X coordinate to draw the frontier line
  const paretoPath = useMemo(() => {
    const pts = completedTrials
      .filter((t) => t.isParetoOptimal)
      .sort((a, b) => (a.values[1] ?? 0) - (b.values[1] ?? 0));
    if (pts.length < 2) return '';
    return pts
      .map((t, idx) => {
        const x = toScreenX(t.values[1] ?? 0);
        const y = toScreenY(t.values[0] ?? 0);
        return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
  }, [completedTrials, bounds]);

  const xTicks = [0, 0.25, 0.5, 0.75, 1].map(
    (p) => bounds.minX + p * (bounds.maxX - bounds.minX)
  );
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(
    (p) => bounds.minY + p * (bounds.maxY - bounds.minY)
  );

  const activeInspect =
    hoveredTrial ||
    completedTrials.find((t) => t.index === selectedTrialIndex) ||
    study.paretoTrials[0] ||
    null;

  return (
    <div className="relative bg-obsidian-900/90 border border-obsidian-700 rounded-xl p-4 flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-heretic-cyan animate-pulse" />
            Multi-Objective Pareto Frontier
          </h3>
          <p className="text-xs text-slate-400">
            Co-optimizing <span className="text-cyan-300 font-medium">{metricYName}</span> ({dirY}) vs.{' '}
            <span className="text-fuchsia-300 font-medium">{metricXName}</span> ({dirX})
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5 text-cyan-300">
            <span className="w-2.5 h-2.5 rounded-full bg-heretic-cyan shadow-[0_0_8px_#00f0ff]" />
            Pareto Optimal ({study.paretoCount})
          </span>
          <span className="flex items-center gap-1.5 text-slate-400">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-600" />
            Dominated ({Math.max(0, completedTrials.length - study.paretoCount)})
          </span>
        </div>
      </div>

      <div className="relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto select-none overflow-visible"
        >
          <defs>
            <linearGradient id="paretoGlow" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.9" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {yTicks.map((val, i) => {
            const y = toScreenY(val);
            return (
              <g key={`y-${i}`}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={width - padRight}
                  y2={y}
                  stroke="#1f2536"
                  strokeDasharray="3 3"
                />
                <text
                  x={padLeft - 8}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-slate-400 text-[10px] font-mono"
                >
                  {(val * 100).toFixed(0)}%
                </text>
              </g>
            );
          })}

          {xTicks.map((val, i) => {
            const x = toScreenX(val);
            return (
              <g key={`x-${i}`}>
                <line
                  x1={x}
                  y1={padTop}
                  x2={x}
                  y2={height - padBottom}
                  stroke="#1f2536"
                  strokeDasharray="3 3"
                />
                <text
                  x={x}
                  y={height - padBottom + 16}
                  textAnchor="middle"
                  className="fill-slate-400 text-[10px] font-mono"
                >
                  {val.toFixed(3)}
                </text>
              </g>
            );
          })}

          {/* Axes */}
          <line
            x1={padLeft}
            y1={padTop}
            x2={padLeft}
            y2={height - padBottom}
            stroke="#334155"
            strokeWidth={1.5}
          />
          <line
            x1={padLeft}
            y1={height - padBottom}
            x2={width - padRight}
            y2={height - padBottom}
            stroke="#334155"
            strokeWidth={1.5}
          />

          {/* Axis Titles */}
          <text
            x={padLeft + plotW / 2}
            y={height - 6}
            textAnchor="middle"
            className="fill-slate-300 text-[11px] font-medium"
          >
            {metricXName} ({dirX === 'minimize' ? 'Lower is less drift ←' : 'Higher is better →'})
          </text>
          <text
            x={14}
            y={padTop + plotH / 2}
            textAnchor="middle"
            transform={`rotate(-90, 14, ${padTop + plotH / 2})`}
            className="fill-slate-300 text-[11px] font-medium"
          >
            {metricYName} Rate (%)
          </text>

          {/* Ideal Corner Indicator */}
          <circle
            cx={padLeft}
            cy={height - padBottom}
            r={5}
            fill="none"
            stroke="#10b981"
            strokeDasharray="2 2"
          />

          {/* Pareto Frontier Curve */}
          {paretoPath && (
            <>
              <path
                d={paretoPath}
                fill="none"
                stroke="#00f0ff"
                strokeWidth={5}
                strokeOpacity={0.18}
              />
              <path
                d={paretoPath}
                fill="none"
                stroke="url(#paretoGlow)"
                strokeWidth={2.2}
              />
            </>
          )}

          {/* Dominated Trials first */}
          {completedTrials
            .filter((t) => !t.isParetoOptimal)
            .map((trial) => {
              const cx = toScreenX(trial.values[1] ?? 0);
              const cy = toScreenY(trial.values[0] ?? 0);
              const isSelected = trial.index === selectedTrialIndex;
              return (
                <g
                  key={trial.trialId}
                  className="cursor-pointer transition-transform"
                  onClick={() => onSelectTrial(trial)}
                  onMouseEnter={() => setHoveredTrial(trial)}
                  onMouseLeave={() => setHoveredTrial(null)}
                >
                  {isSelected && (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={10}
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth={2}
                    />
                  )}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={isSelected ? 6 : 4.5}
                    fill={isSelected ? '#f59e0b' : '#475569'}
                    fillOpacity={0.8}
                    stroke="#0f172a"
                    strokeWidth={1}
                  />
                </g>
              );
            })}

          {/* Pareto Optimal Trials on top */}
          {completedTrials
            .filter((t) => t.isParetoOptimal)
            .map((trial) => {
              const cx = toScreenX(trial.values[1] ?? 0);
              const cy = toScreenY(trial.values[0] ?? 0);
              const isSelected = trial.index === selectedTrialIndex;
              return (
                <g
                  key={trial.trialId}
                  className="cursor-pointer"
                  onClick={() => onSelectTrial(trial)}
                  onMouseEnter={() => setHoveredTrial(trial)}
                  onMouseLeave={() => setHoveredTrial(null)}
                >
                  <circle
                    cx={cx}
                    cy={cy}
                    r={isSelected ? 12 : 8}
                    fill="#00f0ff"
                    fillOpacity={isSelected ? 0.3 : 0.15}
                  />
                  <circle
                    cx={cx}
                    cy={cy}
                    r={isSelected ? 6.5 : 5.5}
                    fill={isSelected ? '#ffffff' : '#00f0ff'}
                    stroke={isSelected ? '#00f0ff' : '#07080c'}
                    strokeWidth={2}
                  />
                  <text
                    x={cx}
                    y={cy - 9}
                    textAnchor="middle"
                    className="fill-cyan-200 text-[9px] font-mono font-semibold pointer-events-none"
                  >
                    #{trial.index}
                  </text>
                </g>
              );
            })}
        </svg>
      </div>

      {/* Bottom quick HUD for hovered/selected trial */}
      {activeInspect && (
        <div className="mt-2 pt-2.5 border-t border-obsidian-700/80 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span
              className={`px-2 py-0.5 rounded font-mono font-semibold ${
                activeInspect.isParetoOptimal
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'bg-slate-800 text-slate-300 border border-slate-700'
              }`}
            >
              Trial #{activeInspect.index}
            </span>
            {activeInspect.isParetoOptimal && (
              <span className="text-[11px] text-emerald-400 font-medium">
                ★ Pareto Optimal Frontier
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 font-mono">
            {activeInspect.scores.map((s) => (
              <div key={s.name} className="flex items-center gap-1.5">
                <span className="text-slate-400">{s.name}:</span>
                <span className="text-slate-100 font-semibold">{s.score.md_display}</span>
                <span className="text-slate-500 text-[10px]">
                  (base: {s.baseline.md_display})
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
