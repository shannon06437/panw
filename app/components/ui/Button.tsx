import React from 'react'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger'
  isLoading?: boolean
  children: React.ReactNode
}

export function Button({
  variant = 'primary',
  isLoading = false,
  disabled,
  children,
  className = '',
  ...props
}: ButtonProps) {
  const baseStyles = 'button'
  const variantStyles = {
    primary: 'button',
    secondary: 'button-secondary',
    outline: 'button-outline',
    danger: 'button-danger',
  }

  return (
    <button
      className={`${baseStyles} ${variantStyles[variant]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && <span className="spinner" style={{ marginRight: '0.5rem' }}></span>}
      {children}
    </button>
  )
}
