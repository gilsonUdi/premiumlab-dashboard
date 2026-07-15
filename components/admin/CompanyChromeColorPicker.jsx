'use client'

import { useMemo, useRef } from 'react'
import { RotateCcw, SlidersHorizontal } from 'lucide-react'
import {
  DEFAULT_COMPANY_APPEARANCE,
  hexToRgb,
  hsvToHex,
  normalizeCompanyAppearance,
  resolveCompanyChrome,
  rgbToHsv,
} from '@/lib/company-appearance'

function RangeControl({ label, value, minimum, maximum, suffix, onChange }) {
  return (
    <label className="block space-y-2">
      <span className="flex items-center justify-between gap-3 text-xs font-medium text-[#AEC3DF]">
        <span>{label}</span>
        <span className="tabular-nums text-white">{value}{suffix}</span>
      </span>
      <input
        type="range"
        min={minimum}
        max={maximum}
        value={value}
        onChange={event => onChange(Number(event.target.value))}
        className="company-color-range w-full"
      />
    </label>
  )
}

export default function CompanyChromeColorPicker({ value, onChange }) {
  const wheelRef = useRef(null)
  const squareRef = useRef(null)
  const appearance = normalizeCompanyAppearance(value)
  const hsv = useMemo(() => rgbToHsv(hexToRgb(appearance.chromeColor)), [appearance.chromeColor])
  const resolved = useMemo(() => resolveCompanyChrome(appearance), [appearance])

  const emit = patch => onChange(normalizeCompanyAppearance({ ...appearance, ...patch }))

  const updateHue = event => {
    const bounds = wheelRef.current?.getBoundingClientRect()
    if (!bounds) return
    const centerX = bounds.left + bounds.width / 2
    const centerY = bounds.top + bounds.height / 2
    const hue = (Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180 / Math.PI + 90 + 360) % 360
    emit({ chromeColor: hsvToHex({ ...hsv, h: hue }) })
  }

  const updateSaturationValue = event => {
    const bounds = squareRef.current?.getBoundingClientRect()
    if (!bounds) return
    const saturation = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width))
    const brightness = 1 - Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height))
    emit({ chromeColor: hsvToHex({ h: hsv.h, s: saturation, v: brightness }) })
  }

  const startPointerInteraction = (event, handler) => {
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    handler(event)
  }

  const hueRadians = (hsv.h - 90) * Math.PI / 180

  return (
    <div className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
      <div className="flex justify-center xl:justify-start">
        <div
          ref={wheelRef}
          className="relative h-[280px] w-[280px] touch-none rounded-full"
          style={{
            background: 'conic-gradient(#ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)',
            boxShadow: '0 18px 48px rgba(3,8,20,0.4)',
          }}
          onPointerDown={event => startPointerInteraction(event, updateHue)}
          onPointerMove={event => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) updateHue(event)
          }}
        >
          <div
            className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_2px_rgba(0,0,0,0.35)]"
            style={{
              left: `${50 + Math.cos(hueRadians) * 45}%`,
              top: `${50 + Math.sin(hueRadians) * 45}%`,
            }}
          />
          <div className="absolute inset-[18%] rounded-xl bg-[#0A162B] p-2 shadow-[0_0_0_1px_rgba(255,255,255,0.12),0_10px_30px_rgba(0,0,0,0.35)]">
            <div
              ref={squareRef}
              className="relative h-full w-full touch-none overflow-hidden rounded-md"
              style={{
                background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv.h}, 100%, 50%))`,
              }}
              onPointerDown={event => startPointerInteraction(event, updateSaturationValue)}
              onPointerMove={event => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) updateSaturationValue(event)
              }}
            >
              <div
                className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_2px_rgba(0,0,0,0.35)]"
                style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
          <div className="space-y-2">
            <label className="portal-label">Cor das barras</label>
            <div className="flex h-11 items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3">
              <span className="h-6 w-6 shrink-0 rounded-md border border-white/20" style={{ background: resolved.background }} />
              <input
                value={appearance.chromeColor}
                readOnly
                className="min-w-0 flex-1 bg-transparent text-sm font-medium uppercase text-white outline-none"
                aria-label="Cor hexadecimal das barras"
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="portal-label">Resultado</label>
            <div className="flex h-11 items-center justify-center rounded-xl border border-white/10 text-xs font-semibold" style={{ background: resolved.background, color: resolved.foreground }}>
              {resolved.background}
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-white/10 bg-[#071225]">
          <div className="flex h-8 items-center px-3 text-[9px] font-bold uppercase tracking-[0.2em]" style={{ background: resolved.background, color: resolved.foreground }}>
            Axis
          </div>
          <div className="grid h-24 grid-cols-[82px_1fr]">
            <div className="space-y-2 p-2" style={{ background: resolved.background, borderRight: `1px solid ${resolved.border}` }}>
              <div className="h-2 w-10 rounded-full" style={{ background: resolved.muted }} />
              <div className="h-6 rounded-md" style={{ background: resolved.subtle }} />
              <div className="h-6 rounded-md" style={{ background: resolved.subtle }} />
            </div>
            <div className="m-3 rounded-lg border border-white/5 bg-[#112345]" />
          </div>
        </div>

        <button
          type="button"
          className="portal-ghost-button w-full justify-center"
          onClick={() => emit({ advancedEnabled: !appearance.advancedEnabled })}
          aria-pressed={appearance.advancedEnabled}
        >
          <SlidersHorizontal size={15} />
          {appearance.advancedEnabled ? 'Ocultar ajustes avançados' : 'Habilitar ajustes avançados'}
        </button>

        {appearance.advancedEnabled ? (
          <div className="space-y-5 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <RangeControl label="Saturação" value={appearance.saturation} minimum={0} maximum={200} suffix="%" onChange={saturation => emit({ saturation })} />
            <RangeControl label="Matiz" value={appearance.hue} minimum={-180} maximum={180} suffix="°" onChange={hue => emit({ hue })} />
            <RangeControl label="Brilho" value={appearance.brightness} minimum={50} maximum={150} suffix="%" onChange={brightness => emit({ brightness })} />
          </div>
        ) : null}

        <button
          type="button"
          className="inline-flex items-center gap-2 text-xs font-medium text-[#AEC3DF] transition hover:text-white"
          onClick={() => onChange({ ...DEFAULT_COMPANY_APPEARANCE })}
        >
          <RotateCcw size={13} />
          Restaurar padrão
        </button>
      </div>
    </div>
  )
}
