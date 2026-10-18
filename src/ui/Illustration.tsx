import type {ReactElement} from 'react';
/**
 * Nuestro Hogar illustrations: original, theme-aware SVGs (colors come from the --nh-* roles, so they follow
 * day/night and the chosen accent). Motifs are local: the Volcán de Agua for goals, a tile-roof house for home,
 * the quetzal coin, a barrilete (kite) for extra pay. Decorative: always aria-hidden.
 */
export type IllustrationName =
  | 'movements'
  | 'budget'
  | 'goal'
  | 'accounts'
  | 'calendar'
  | 'done'
  | 'home'
  | 'savings'
  | 'solo'
  | 'couple'
  | 'family'
  | 'kite';

// Dedicated illustration roles (theme.css), tuned for both themes.
const S = {
  line: 'var(--nh-ill-line)',
  soft: 'var(--nh-ill-1)',
  warm: 'var(--nh-ill-warm)',
  warmSoft: 'var(--nh-ill-2)',
  blueSoft: 'var(--nh-ill-3)',
  blue: 'var(--nh-ill-line)',
  surface: 'var(--nh-ill-paper)',
  muted: 'var(--nh-muted)'
};
const stroke = {stroke: S.line, strokeWidth: 2.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const};

/** Quetzal coin: a "Q" on a warm disc. */
function Coin({x, y, r = 11}: {x: number; y: number; r?: number}) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={S.warmSoft} stroke={S.warm} strokeWidth={2.2} />
      <text
        x={x}
        y={y + r * 0.36}
        textAnchor="middle"
        fontSize={r * 1.05}
        fontWeight={700}
        fill={S.warm}
        fontFamily="var(--ds-font-display)"
      >
        Q
      </text>
    </g>
  );
}

function Ground() {
  return <path d="M18 104h124" {...stroke} stroke={S.muted} strokeOpacity={0.35} />;
}

const art: Record<IllustrationName, ReactElement> = {
  movements: (
    <>
      <Ground />
      <path d="M48 18h52v80l-6.5-5-6.5 5-6.5-5-6.5 5-6.5-5-6.5 5-6.5-5-6.5 5z" fill={S.surface} {...stroke} />
      <path d="M58 34h32M58 46h24M58 58h28M58 70h18" {...stroke} strokeWidth={2} strokeOpacity={0.55} />
      <Coin x={108} y={78} r={13} />
    </>
  ),
  budget: (
    <>
      <Ground />
      {[30, 66, 102].map((x, i) => (
        <g key={x}>
          <path
            d={`M${x} 52h30v44a6 6 0 0 1-6 6H${x + 6}a6 6 0 0 1-6-6z`}
            fill={i === 1 ? S.soft : S.surface}
            {...stroke}
          />
          <path d={`M${x - 2} 46h34v8H${x - 2}z`} fill={S.surface} {...stroke} />
          <rect x={x + 6} y={102 - [24, 38, 14][i]} width={18} height={[24, 38, 14][i] - 6} rx={3} fill={S.soft} />
        </g>
      ))}
      <Coin x={81} y={30} r={10} />
    </>
  ),
  goal: (
    <>
      <Ground />
      {/* Volcán de Agua: a wide symmetric cone, with the path up and a flag at the crater. */}
      <path d="M20 104 66 40c4-5 10-5 14 0l46 64z" fill={S.soft} {...stroke} />
      <path d="M58 52c6-4 22-4 30 0" {...stroke} strokeOpacity={0.6} />
      <path d="M40 98c14-6 10-16 26-20s10-16 18-22" {...stroke} strokeDasharray="3 6" strokeOpacity={0.7} />
      <path d="M84 50V22l18 7-18 7" fill={S.warmSoft} {...stroke} stroke={S.warm} />
      <circle cx={118} cy={28} r={8} fill={S.warmSoft} />
    </>
  ),
  accounts: (
    <>
      <Ground />
      <rect x={30} y={46} width={84} height={54} rx={10} fill={S.soft} {...stroke} />
      <path d="M30 60h84" {...stroke} />
      <rect x={86} y={68} width={34} height={20} rx={8} fill={S.surface} {...stroke} />
      <circle cx={96} cy={78} r={3} fill={S.line} />
      <rect
        x={52}
        y={22}
        width={70}
        height={40}
        rx={8}
        fill={S.blueSoft}
        stroke={S.blue}
        strokeWidth={2.2}
        transform="rotate(-8 87 42)"
      />
      <path d="M58 34h22" stroke={S.blue} strokeWidth={2.2} strokeLinecap="round" transform="rotate(-8 87 42)" />
    </>
  ),
  calendar: (
    <>
      <Ground />
      <rect x={36} y={30} width={76} height={70} rx={10} fill={S.surface} {...stroke} />
      <path d="M36 48h76M54 22v14M94 22v14" {...stroke} />
      {[0, 1, 2].map(r =>
        [0, 1, 2, 3].map(c => (
          <rect
            key={r + '-' + c}
            x={46 + c * 15}
            y={56 + r * 13}
            width={8}
            height={7}
            rx={2}
            fill={r === 1 && c === 2 ? S.warm : S.soft}
          />
        ))
      )}
      <circle cx={118} cy={30} r={10} fill={S.warmSoft} stroke={S.warm} strokeWidth={2.2} />
    </>
  ),
  done: (
    <>
      <Ground />
      <path d="M38 62 74 34l36 28" fill="none" {...stroke} />
      <path
        d="M32 64 74 30l42 34"
        fill="none"
        stroke={S.warm}
        strokeWidth={5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M44 60v42h60V60" fill={S.surface} {...stroke} />
      <path d="M66 102V80a8 8 0 0 1 16 0v22" fill={S.soft} {...stroke} />
      <circle cx={112} cy={86} r={15} fill={S.soft} {...stroke} />
      <path d="m105 86 5 5 9-10" {...stroke} />
    </>
  ),
  home: (
    <>
      <Ground />
      {/* Colonial facade: tile roof, arched door, two windows with ironwork. */}
      <path d="M26 54h96l-10-16H36z" fill={S.warmSoft} stroke={S.warm} strokeWidth={2.4} strokeLinejoin="round" />
      <path d="M34 54v48h80V54" fill={S.surface} {...stroke} />
      <path d="M64 102V80a10 10 0 0 1 20 0v22" fill={S.soft} {...stroke} />
      <rect x={42} y={64} width={14} height={16} rx={2} fill={S.soft} {...stroke} strokeWidth={2} />
      <rect x={92} y={64} width={14} height={16} rx={2} fill={S.soft} {...stroke} strokeWidth={2} />
      <path d="M49 64v16M99 64v16" {...stroke} strokeWidth={1.6} />
    </>
  ),
  savings: (
    <>
      <Ground />
      <path
        d="M40 70c0-18 16-30 36-30s36 12 36 28c0 9-5 16-12 21v12H88v-6H66v6H54V90c-8-5-14-12-14-20z"
        fill={S.soft}
        {...stroke}
      />
      <path d="M66 46h18" {...stroke} />
      <circle cx={96} cy={62} r={2.6} fill={S.line} />
      <path d="M112 66h8" {...stroke} />
      <Coin x={76} y={22} r={11} />
    </>
  ),
  solo: (
    <>
      <circle cx={80} cy={46} r={16} fill={S.soft} {...stroke} />
      <path d="M50 102c2-20 14-30 30-30s28 10 30 30" fill={S.surface} {...stroke} />
      <Coin x={116} y={34} r={10} />
    </>
  ),
  couple: (
    <>
      <circle cx={62} cy={46} r={14} fill={S.soft} {...stroke} />
      <circle cx={100} cy={50} r={13} fill={S.warmSoft} stroke={S.warm} strokeWidth={2.4} />
      <path d="M36 102c2-18 12-28 26-28s22 8 25 20" fill={S.surface} {...stroke} />
      <path
        d="M76 102c2-16 11-25 24-25s22 9 24 25"
        fill={S.surface}
        stroke={S.warm}
        strokeWidth={2.4}
        strokeLinejoin="round"
      />
    </>
  ),
  family: (
    <>
      <circle cx={48} cy={44} r={13} fill={S.soft} {...stroke} />
      <circle cx={112} cy={44} r={13} fill={S.warmSoft} stroke={S.warm} strokeWidth={2.4} />
      <circle cx={80} cy={62} r={10} fill={S.blueSoft} stroke={S.blue} strokeWidth={2.4} />
      <path d="M24 102c2-18 11-28 24-28s20 8 23 18" fill={S.surface} {...stroke} />
      <path
        d="M89 92c3-10 10-18 23-18s22 10 24 28"
        fill={S.surface}
        stroke={S.warm}
        strokeWidth={2.4}
        strokeLinejoin="round"
      />
      <path
        d="M62 102c1-14 8-22 18-22s17 8 18 22"
        fill={S.surface}
        stroke={S.blue}
        strokeWidth={2.4}
        strokeLinejoin="round"
      />
    </>
  ),
  kite: (
    <>
      {/* Barrilete: the November kites of Sumpango and Santiago Sacatepéquez. */}
      <path d="M80 14 112 46 80 78 48 46z" fill={S.warmSoft} stroke={S.warm} strokeWidth={2.4} strokeLinejoin="round" />
      <path d="M80 14v64M48 46h64" stroke={S.warm} strokeWidth={2} />
      <path d="M80 26 100 46 80 66 60 46z" fill={S.soft} {...stroke} strokeWidth={2} />
      <path d="M80 78c-6 8 6 12 0 20s6 10 0 16" {...stroke} strokeWidth={2} />
      <path d="M74 88h-8M88 98h8" stroke={S.blue} strokeWidth={4} strokeLinecap="round" />
    </>
  )
};

export default function Illustration({
  name,
  size = 132,
  className = ''
}: {
  name: IllustrationName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={'ds-illustration ' + className}
      width={size}
      height={(size * 120) / 160}
      viewBox="0 0 160 120"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {art[name]}
    </svg>
  );
}
