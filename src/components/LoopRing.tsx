import { useRef } from 'react';
import { motion } from 'framer-motion';
import { useI18n } from '../i18n/I18nProvider';
import type { Mode, Stage } from '../sim/types';
import { laneVar, type Lane } from './Panel';

interface Station {
  id: string;
  label: string;
  angle: number; // degrees, 0 = top, clockwise
  lane: Lane;
}

const W = 300;
const H = 270;
const CX = W / 2;
const CY = H / 2;
const R = 82;

const point = (angle: number, r = R) => {
  const rad = ((angle - 90) * Math.PI) / 180;
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
};

function browserStations(t: (k: string) => string): Station[] {
  return [
    { id: 'task', label: t('stage.task'), angle: 0, lane: 'task' },
    { id: 'micro', label: t('stage.micro'), angle: 120, lane: 'micro' },
    { id: 'render', label: t('stage.render'), angle: 240, lane: 'render' },
  ];
}

function nodeStations(t: (k: string) => string): Station[] {
  return [
    { id: 'timers', label: t('stage.timers'), angle: 0, lane: 'task' },
    { id: 'pending', label: t('ring.pending'), angle: 72, lane: 'muted' },
    { id: 'poll', label: t('stage.poll'), angle: 144, lane: 'api' },
    { id: 'check', label: t('stage.check'), angle: 216, lane: 'render' },
    { id: 'close', label: t('ring.close'), angle: 288, lane: 'muted' },
  ];
}

function activeStation(stage: Stage, mode: Mode): string | null {
  if (mode === 'browser') {
    if (stage === 'script' || stage === 'task') return 'task';
    if (stage === 'micro') return 'micro';
    if (stage === 'render') return 'render';
    return null;
  }
  if (stage === 'timers' || stage === 'poll' || stage === 'check') return stage;
  return null;
}

export function LoopRing({ stage, mode, time }: { stage: Stage; mode: Mode; time: number }) {
  const { t, num } = useI18n();
  const stations = mode === 'browser' ? browserStations(t) : nodeStations(t);
  const active = activeStation(stage, mode);
  const activeSt = stations.find((s) => s.id === active);

  // the marker only ever travels forward around the loop
  const angleRef = useRef(0);
  if (activeSt) {
    const cur = angleRef.current;
    const delta = (((activeSt.angle - cur) % 360) + 360) % 360;
    angleRef.current = cur + delta;
  }
  const markerAngle = angleRef.current;

  const innerActive = mode === 'node' && (stage === 'nextTick' || stage === 'micro');
  const centerLabel = t(`stage.${stage}`);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto block w-full max-w-[300px]" role="img" aria-label={`${t('panel.loop')}: ${centerLabel}`}>
      <circle cx={CX} cy={CY} r={R} fill="none" stroke="rgb(var(--line))" strokeWidth={10} />
      <circle cx={CX} cy={CY} r={R} fill="none" stroke="rgb(var(--ink) / 0.08)" strokeWidth={1} strokeDasharray="2 6" />

      <motion.g
        initial={false}
        animate={{ rotate: markerAngle, opacity: activeSt ? 1 : 0.2 }}
        transition={{ type: 'spring', stiffness: 90, damping: 18 }}
        style={{ originX: `${CX}px`, originY: `${CY}px` }}
      >
        <path d={`M ${CX} ${CY - R + 18} l 7 10 h -14 z`} fill="rgb(var(--ink))" />
      </motion.g>

      {stations.map((s) => {
        const p = point(s.angle);
        const lp = point(s.angle, R + 30);
        const on = s.id === active;
        return (
          <g key={s.id}>
            <motion.circle
              cx={p.x}
              cy={p.y}
              initial={false}
              animate={{ r: on ? 13 : 8 }}
              r={on ? 13 : 8}
              fill={on ? `rgb(${laneVar(s.lane)})` : 'rgb(var(--surface))'}
              stroke={`rgb(${laneVar(s.lane)})`}
              strokeWidth={3}
            />
            <text
              x={lp.x}
              y={lp.y}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-current text-[11.5px]"
              style={{ fontWeight: on ? 600 : 400, opacity: on ? 1 : 0.7 }}
            >
              {s.label}
            </text>
          </g>
        );
      })}

      {mode === 'node' && (
        <g>
          <circle
            cx={CX}
            cy={CY}
            r={34}
            fill={innerActive ? 'rgb(var(--lane-micro) / 0.12)' : 'transparent'}
            stroke={innerActive ? 'rgb(var(--lane-micro))' : 'rgb(var(--line))'}
            strokeWidth={2}
            strokeDasharray={innerActive ? undefined : '4 4'}
          />
        </g>
      )}

      <text x={CX} y={CY - 4} textAnchor="middle" className="fill-current text-[15px]" style={{ fontWeight: 600 }}>
        {centerLabel}
      </text>
      <text x={CX} y={CY + 16} textAnchor="middle" className="fill-current text-[11px] tabular-nums" style={{ opacity: 0.6 }}>
        {t('tl.clock', { t: num(time, 1) })}
      </text>
    </svg>
  );
}
