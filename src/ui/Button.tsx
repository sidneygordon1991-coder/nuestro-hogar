import type {ButtonHTMLAttributes, ReactNode} from 'react';

type Variant = 'primary' | 'secondary' | 'quiet' | 'danger';
/** Buttons with one vocabulary: primary (one per view), secondary, quiet (links) and danger. */
export function Button({
  variant = 'secondary',
  icon,
  children,
  className = '',
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {variant?: Variant; icon?: ReactNode; children: ReactNode}) {
  return (
    <button type={type} className={'ds-button ds-button--' + variant + (className ? ' ' + className : '')} {...rest}>
      {icon}
      <span>{children}</span>
    </button>
  );
}

/** Icon-only buttons always carry a label (read by screen readers) and a 44px touch target. */
export function IconButton({
  label,
  icon,
  className = '',
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {label: string; icon: ReactNode}) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={'ds-icon-button' + (className ? ' ' + className : '')}
      {...rest}
    >
      {icon}
    </button>
  );
}
