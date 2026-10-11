import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { LoaderCircle } from 'lucide-react'
import { cx } from '../lib/cx.ts'

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('panel', className)}>{children}</div>
}

export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-400">{children}</h3>
      {right}
    </div>
  )
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  display,
  hint,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
  display?: string
  hint?: string
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-ink-200">{label}</span>
        <span className="rounded-md bg-ink-800 px-1.5 py-0.5 font-mono text-[11px] text-accent-300">{display ?? value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      {hint ? <span className="mt-1 block text-[11px] leading-snug text-ink-400">{hint}</span> : null}
    </label>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  hint?: string
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <p className="text-xs font-medium text-ink-200">{label}</p>
        {hint ? <p className="text-[11px] leading-snug text-ink-400">{hint}</p> : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative mt-0.5 h-5 w-9 shrink-0 rounded-full border transition-colors duration-150',
          checked ? 'border-accent-400 bg-accent-600/80' : 'border-ink-600 bg-ink-800',
        )}
      >
        <span
          className={cx(
            'absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow transition-all duration-150',
            checked ? 'left-[18px]' : 'left-0.5',
          )}
        />
      </button>
    </div>
  )
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
}: {
  value: T
  onChange: (value: T) => void
  options: Array<{ value: T; label: ReactNode; title?: string }>
  size?: 'sm' | 'md'
}) {
  return (
    <div className={cx('inline-flex items-center gap-0.5 rounded-lg border border-ink-700 bg-ink-900/70 p-0.5')}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          title={option.title}
          onClick={() => onChange(option.value)}
          className={cx(
            'rounded-md transition-colors duration-150',
            size === 'sm' ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1.5 text-xs',
            value === option.value
              ? 'bg-accent-600/20 text-accent-200 shadow-[inset_0_0_0_1px_rgba(129,140,248,0.45)]'
              : 'text-ink-300 hover:bg-ink-800 hover:text-ink-100',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

type ButtonVariant = 'primary' | 'ghost' | 'outline' | 'danger'

export function Button({
  variant = 'outline',
  children,
  icon,
  busy,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  icon?: ReactNode
  busy?: boolean
}) {
  const styles: Record<ButtonVariant, string> = {
    primary:
      'border-transparent bg-gradient-to-b from-accent-500 to-accent-600 text-white shadow-[0_10px_30px_-12px_rgba(79,70,229,0.9)] hover:from-accent-400 hover:to-accent-500',
    outline: 'border-ink-600 bg-ink-800/60 text-ink-100 hover:border-ink-500 hover:bg-ink-750',
    ghost: 'border-transparent bg-transparent text-ink-300 hover:bg-ink-800 hover:text-ink-100',
    danger: 'border-transparent bg-rose-600/15 text-rose-300 hover:bg-rose-600/25',
  }
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || busy}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50',
        styles[variant],
        className,
      )}
    >
      {busy ? <LoaderCircle size={14} className="spin-slow" /> : icon}
      {children}
    </button>
  )
}

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100
  return (
    <div className={cx('h-1.5 w-full overflow-hidden rounded-full bg-ink-800', className)}>
      <div
        className="h-full rounded-full bg-gradient-to-r from-accent-500 via-accent-400 to-aqua-400 transition-[width] duration-200"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'accent' | 'success' | 'warn' | 'danger' | 'aqua'
}) {
  const tones: Record<string, string> = {
    neutral: 'border-ink-600 bg-ink-800 text-ink-300',
    accent: 'border-accent-500/40 bg-accent-600/15 text-accent-300',
    success: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
    warn: 'border-amber-500/40 bg-amber-500/15 text-amber-300',
    danger: 'border-rose-500/40 bg-rose-500/15 text-rose-300',
    aqua: 'border-aqua-500/40 bg-aqua-500/15 text-aqua-300',
  }
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide', tones[tone])}>
      {children}
    </span>
  )
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <div className="rounded-lg border border-ink-700/70 bg-ink-900/50 px-2.5 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">{label}</p>
      <p className={cx('mt-0.5 font-mono text-sm', tone ?? 'text-ink-100')}>{value}</p>
    </div>
  )
}
