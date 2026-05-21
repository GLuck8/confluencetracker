import { scoreColor } from '../lib/utils'

export default function ScoreRing({ score, size = 52 }) {
  const r = (size / 2) - 5
  const c = 2 * Math.PI * r
  const pct = score / 100
  const color = scoreColor(score)

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke="var(--border)" strokeWidth={4}
      />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke={color} strokeWidth={4}
        strokeDasharray={c} strokeDashoffset={c * (1 - pct)}
        strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`}
        style={{ transition: 'stroke-dashoffset .4s ease' }}
      />
      <text
        x={size / 2} y={size / 2}
        textAnchor="middle" dominantBaseline="central"
        fontSize={11} fontWeight={600} fill={color}
        fontFamily="var(--font-mono)"
      >
        {score}
      </text>
    </svg>
  )
}
