import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-text';

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  variant?: ButtonVariant;
  size?: 'md' | 'sm';
  /** Keeps the label, adds a spinner and `aria-busy`; the button stays visible and non-interactive. */
  loading?: boolean;
  full?: boolean;
  icon?: ReactNode;
  /** Square icon-only button; `aria-label` is then required. */
  iconOnly?: boolean;
  href?: string;
  children?: ReactNode;
};

/**
 * Exactly one `primary` per screen. 48 px tall (`sm` = 36). Never removes the focus ring.
 */
export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  full = false,
  icon,
  iconOnly = false,
  href,
  className,
  disabled,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  const classes = [
    'kl-btn',
    `kl-btn--${variant}`,
    size === 'sm' ? 'kl-btn--sm' : '',
    full ? 'kl-btn--full' : '',
    iconOnly ? 'kl-btn--icon' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  const content = (
    <>
      {loading ? <span className="kl-spinner" aria-hidden="true" /> : icon}
      {!iconOnly && children}
    </>
  );

  if (href && !disabled && !loading) {
    return (
      <a className={classes} href={href} aria-label={rest['aria-label']}>
        {content}
      </a>
    );
  }

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {content}
    </button>
  );
}
