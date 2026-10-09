import React from 'react';

export default function Button({
  children,
  variant = 'primary',
  className = '',
  loading = false,
  disabled = false,
  ...props
}) {
  const baseClasses = `inline-flex items-center justify-center min-h-[48px] rounded-[14px] font-semibold transition-all duration-200 active:scale-98 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/40 disabled:opacity-50 disabled:pointer-events-none disabled:active:scale-100 disabled:bg-disabled disabled:text-disabled-text disabled:border-transparent`;

  const variants = {
    primary: 'bg-primary text-white hover:bg-primary-hover active:bg-primary-active',
    accent: 'bg-accent text-white hover:bg-accent-hover',
    secondary: 'bg-transparent border border-border text-text hover:bg-bg hover:border-text-muted',
    hint: 'bg-hint-bg text-hint hover:bg-yellow-200',
    danger: 'bg-danger text-white hover:bg-red-600',
    ghost: 'bg-transparent text-text hover:bg-bg',
  };

  return (
    <button
      className={`${baseClasses} ${variants[variant]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="animate-spin mr-2 border-2 border-current border-t-transparent rounded-full w-5 h-5"></span>
      ) : null}
      {children}
    </button>
  );
}
