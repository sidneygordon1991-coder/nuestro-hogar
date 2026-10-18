import type {SVGProps} from 'react';

export type ModuleIconName =
  | 'home'
  | 'finance'
  | 'calendar'
  | 'lists'
  | 'family'
  | 'documents'
  | 'meals'
  | 'maintenance'
  | 'planning'
  | 'health'
  | 'monthly_close'
  | 'automations'
  | 'backups'
  | 'diagnostics'
  | 'pay'
  | 'allowance';

/** Detailed, duotone objects share the surrounding category's accessible theme color. */
export default function ModuleIcon({
  name,
  size = 24,
  ...props
}: SVGProps<SVGSVGElement> & {name: ModuleIconName; size?: number}) {
  const objects: Record<ModuleIconName, React.ReactNode> = {
    home: (
      <>
        <path className="nh-icon-detail" d="M5 13 16 4l11 9v15H5z" />
        <path d="m3 14 13-11 13 11M6 12v16h20V12M13 28v-9h6v9" />
        <path d="M9 14h3v3H9zM22 6V4h4v6" />
      </>
    ),
    finance: (
      <>
        <rect className="nh-icon-detail" x="3" y="8" width="26" height="20" rx="3" />
        <rect x="3" y="8" width="26" height="20" rx="3" />
        <path d="M3 14h26M7 22h6M7 25h3M7 8V4h19v4" />
        <rect x="21" y="20" width="4" height="4" rx="1" />
      </>
    ),
    calendar: (
      <>
        <rect className="nh-icon-detail" x="4" y="6" width="24" height="23" rx="3" />
        <rect x="4" y="6" width="24" height="23" rx="3" />
        <path d="M4 13h24M10 3v6M22 3v6M9 18h3M16 18h3M9 24h3" />
        <path d="m20 24 2 2 4-5" />
      </>
    ),
    lists: (
      <>
        <rect className="nh-icon-detail" x="7" y="5" width="21" height="25" rx="3" />
        <rect x="7" y="5" width="21" height="25" rx="3" />
        <rect x="12" y="2" width="11" height="6" rx="2" />
        <path d="m11 14 1.5 1.5 3-3M18 14h6m-13 7 1.5 1.5 3-3M18 21h6M11 27h13M4 11v14" />
      </>
    ),
    family: (
      <>
        <path className="nh-icon-detail" d="M2 29v-4c0-4 3-7 7-7h14c4 0 7 3 7 7v4z" />
        <circle cx="10" cy="9" r="5" />
        <circle cx="23" cy="10" r="4" />
        <path d="M2 28v-3a8 8 0 0 1 12-7M26 18a7 7 0 0 1 4 7v3" />
        <circle cx="17" cy="19" r="3.5" />
        <path d="M10 29v-2c0-3.2 3-5 7-5s7 1.8 7 5v2" />
      </>
    ),
    documents: (
      <>
        <path className="nh-icon-detail" d="M3 9V6h10l3 3h13v20H3z" />
        <path d="M3 13V6h9l4 4h12v4M3 29h24l3-15H6z" />
        <path d="M10 13V4h10l5 5v5M20 4v5h5M14 9h3" />
        <path d="M14 21h8M14 25h5" />
      </>
    ),
    meals: (
      <>
        <path className="nh-icon-detail" d="M5 14h22v10a6 6 0 0 1-6 6H11a6 6 0 0 1-6-6z" />
        <path d="M5 14h22v10a6 6 0 0 1-6 6H11a6 6 0 0 1-6-6zM2 17h3m22 0h3M3 14h26M11 11h10" />
        <path d="M11 3c-4 3 4 4 0 7M17 2c-4 3 4 4 0 7M23 3c-4 3 4 4 0 7" />
      </>
    ),
    maintenance: (
      <>
        <path className="nh-icon-detail" d="m5 29-2-2 14-14c-3-7 1-12 8-10l-4 4 4 4 4-4c2 7-3 11-10 8z" />
        <path d="m5 29-2-2 14-14c-3-7 1-12 8-10l-4 4 4 4 4-4c2 7-3 11-10 8z" />
        <path d="m5 4 4 4-2 2-4-4zM8 9l5 5M20 21l7 7M23 18l6 6a3 3 0 0 1-4 4l-6-6" />
        <circle cx="7" cy="25" r="1" />
      </>
    ),
    planning: (
      <>
        <rect className="nh-icon-detail" x="3" y="5" width="26" height="21" rx="2" />
        <rect x="3" y="5" width="26" height="21" rx="2" />
        <path d="M16 2v3M16 26v4M9 30l7-4 7 4M7 9h4v5H7zM14 9h4v9h-4zM21 9h4v13h-4z" />
      </>
    ),
    health: (
      <>
        <path className="nh-icon-detail" d="M16 28 4 17C-3 7 9 0 16 10 23 0 35 7 28 17z" />
        <path d="M16 28 4 17C-3 7 9 0 16 10 23 0 35 7 28 17z" />
        <path d="M4 17h6l3-6 4 12 3-7h8" />
      </>
    ),
    monthly_close: (
      <>
        <rect className="nh-icon-detail" x="4" y="5" width="21" height="23" rx="3" />
        <rect x="4" y="5" width="21" height="23" rx="3" />
        <path d="M4 11h21M10 2v6M19 2v6M9 16h10M9 21h6" />
        <circle cx="24" cy="25" r="6" />
        <path d="m21 25 2 2 4-4" />
      </>
    ),
    automations: (
      <>
        <path className="nh-icon-detail" d="M10 3h12v7H10zM3 22h9v7H3zM21 22h9v7h-9z" />
        <rect x="10" y="3" width="12" height="7" rx="2" />
        <rect x="3" y="22" width="9" height="7" rx="2" />
        <rect x="21" y="22" width="9" height="7" rx="2" />
        <path d="M16 10v6H7v6m9-6h9v6M5 25h5m13 0h5" />
      </>
    ),
    backups: (
      <>
        <rect className="nh-icon-detail" x="3" y="14" width="26" height="15" rx="3" />
        <rect x="3" y="14" width="26" height="15" rx="3" />
        <path d="M3 22h26M8 26h1m4 0h1M12 10H8a4 4 0 0 1-1-8 7 7 0 0 1 12-1 5 5 0 0 1 7 9h-6" />
        <path d="M16 6v12m-4-4 4 4 4-4" />
      </>
    ),
    diagnostics: (
      <>
        <rect className="nh-icon-detail" x="2" y="4" width="25" height="20" rx="3" />
        <rect x="2" y="4" width="25" height="20" rx="3" />
        <path d="m6 14 4-5 4 9 3-5h5M11 24v5m-5 0h12" />
        <circle cx="25" cy="24" r="4" />
        <path d="m28 27 3 3" />
      </>
    ),
    pay: (
      <>
        {/* A pay envelope with the quetzal coin of the extra pay. */}
        <rect className="nh-icon-detail" x="3" y="9" width="22" height="16" rx="2.5" />
        <rect x="3" y="9" width="22" height="16" rx="2.5" />
        <path d="m3 11 11 7 11-7M7 21h5" />
        <circle cx="25" cy="8" r="5" />
        <path d="M26.5 9.6 28 11M25 5.5a2.5 2.5 0 1 0 0 5" />
      </>
    ),
    allowance: (
      <>
        {/* Three jars: spend, save, share. */}
        <path className="nh-icon-detail" d="M13 12h7v15a2 2 0 0 1-2 2h-3a2 2 0 0 1-2-2z" />
        <path d="M4 15h6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM13 12h7v15a2 2 0 0 1-2 2h-3a2 2 0 0 1-2-2zM23 17h6v10a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z" />
        <path d="M3.5 15h7M12.5 12h8M22.5 17h7M16.5 4v4M14.5 6h4" />
      </>
    )
  };
  return (
    <svg
      {...props}
      className={['nh-object-icon', props.className].filter(Boolean).join(' ')}
      width={props.width || size}
      height={props.height || size}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {objects[name]}
    </svg>
  );
}
