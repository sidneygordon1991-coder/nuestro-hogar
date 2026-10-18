import type {ReactNode} from 'react';
import Illustration, {type IllustrationName} from './Illustration';

/** An empty screen is an invitation to act: picture, one line on what goes here, and the action that fills it. */
export default function EmptyState({
  art,
  title,
  children,
  action,
  compact = false
}: {
  art?: IllustrationName;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={'ds-empty' + (compact ? ' ds-empty--compact' : '')}>
      {art && <Illustration name={art} size={compact ? 96 : 132} />}
      <div className="ds-empty-copy">
        <strong>{title}</strong>
        {children && <p>{children}</p>}
      </div>
      {action && <div className="ds-empty-action">{action}</div>}
    </div>
  );
}
