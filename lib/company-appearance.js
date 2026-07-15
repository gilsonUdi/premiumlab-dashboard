export const DEFAULT_COMPANY_APPEARANCE = Object.freeze({
  chromeColor: '#0D1D38',
  advancedEnabled: false,
  saturation: 100,
  hue: 0,
  contrast: 100,
})

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, Number(value)))
}

export function normalizeHexColor(value, fallback = DEFAULT_COMPANY_APPEARANCE.chromeColor) {
  const text = String(value || '').trim()
  const shortMatch = text.match(/^#([\da-f]{3})$/i)
  if (shortMatch) {
    return `#${shortMatch[1].split('').map(character => `${character}${character}`).join('')}`.toUpperCase()
  }

  const longMatch = text.match(/^#([\da-f]{6})$/i)
  return longMatch ? `#${longMatch[1].toUpperCase()}` : fallback
}

export function normalizeCompanyAppearance(value = {}) {
  const source = value?.portalAppearance || value?.appearance || value || {}

  return {
    chromeColor: normalizeHexColor(source.chromeColor || source.navigationColor),
    advancedEnabled: source.advancedEnabled === true,
    saturation: clamp(Number.isFinite(Number(source.saturation)) ? source.saturation : 100, 0, 200),
    hue: clamp(Number.isFinite(Number(source.hue)) ? source.hue : 0, -180, 180),
    contrast: clamp(Number.isFinite(Number(source.contrast)) ? source.contrast : 100, 50, 150),
  }
}

export function hexToRgb(hex) {
  const normalized = normalizeHexColor(hex)
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  }
}

function rgbToHex({ r, g, b }) {
  const toHex = channel => Math.round(clamp(channel, 0, 255)).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase()
}

export function rgbToHsv({ r, g, b }) {
  const red = r / 255
  const green = g / 255
  const blue = b / 255
  const maximum = Math.max(red, green, blue)
  const minimum = Math.min(red, green, blue)
  const difference = maximum - minimum
  let hue = 0

  if (difference !== 0) {
    if (maximum === red) hue = 60 * (((green - blue) / difference) % 6)
    else if (maximum === green) hue = 60 * ((blue - red) / difference + 2)
    else hue = 60 * ((red - green) / difference + 4)
  }

  return {
    h: (hue + 360) % 360,
    s: maximum === 0 ? 0 : difference / maximum,
    v: maximum,
  }
}

export function hsvToHex({ h, s, v }) {
  const hue = ((Number(h) % 360) + 360) % 360
  const saturation = clamp(s, 0, 1)
  const value = clamp(v, 0, 1)
  const chroma = value * saturation
  const section = hue / 60
  const intermediate = chroma * (1 - Math.abs((section % 2) - 1))
  const offset = value - chroma
  let channels = [0, 0, 0]

  if (section < 1) channels = [chroma, intermediate, 0]
  else if (section < 2) channels = [intermediate, chroma, 0]
  else if (section < 3) channels = [0, chroma, intermediate]
  else if (section < 4) channels = [0, intermediate, chroma]
  else if (section < 5) channels = [intermediate, 0, chroma]
  else channels = [chroma, 0, intermediate]

  return rgbToHex({
    r: (channels[0] + offset) * 255,
    g: (channels[1] + offset) * 255,
    b: (channels[2] + offset) * 255,
  })
}

function rgbToHsl({ r, g, b }) {
  const red = r / 255
  const green = g / 255
  const blue = b / 255
  const maximum = Math.max(red, green, blue)
  const minimum = Math.min(red, green, blue)
  const lightness = (maximum + minimum) / 2
  const difference = maximum - minimum
  let hue = 0
  let saturation = 0

  if (difference !== 0) {
    saturation = difference / (1 - Math.abs(2 * lightness - 1))
    if (maximum === red) hue = 60 * (((green - blue) / difference) % 6)
    else if (maximum === green) hue = 60 * ((blue - red) / difference + 2)
    else hue = 60 * ((red - green) / difference + 4)
  }

  return { h: (hue + 360) % 360, s: saturation, l: lightness }
}

function hslToRgb({ h, s, l }) {
  const hue = ((h % 360) + 360) % 360
  const saturation = clamp(s, 0, 1)
  const lightness = clamp(l, 0, 1)
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const section = hue / 60
  const intermediate = chroma * (1 - Math.abs((section % 2) - 1))
  const offset = lightness - chroma / 2
  let channels = [0, 0, 0]

  if (section < 1) channels = [chroma, intermediate, 0]
  else if (section < 2) channels = [intermediate, chroma, 0]
  else if (section < 3) channels = [0, chroma, intermediate]
  else if (section < 4) channels = [0, intermediate, chroma]
  else if (section < 5) channels = [intermediate, 0, chroma]
  else channels = [chroma, 0, intermediate]

  return {
    r: (channels[0] + offset) * 255,
    g: (channels[1] + offset) * 255,
    b: (channels[2] + offset) * 255,
  }
}

export function resolveCompanyChrome(value = {}) {
  const appearance = normalizeCompanyAppearance(value)
  let rgb = hexToRgb(appearance.chromeColor)

  if (appearance.advancedEnabled) {
    const hsl = rgbToHsl(rgb)
    rgb = hslToRgb({
      h: hsl.h + appearance.hue,
      s: hsl.s * (appearance.saturation / 100),
      l: hsl.l,
    })

    const contrastFactor = appearance.contrast / 100
    rgb = {
      r: (rgb.r - 128) * contrastFactor + 128,
      g: (rgb.g - 128) * contrastFactor + 128,
      b: (rgb.b - 128) * contrastFactor + 128,
    }
  }

  const background = rgbToHex(rgb)
  const normalizedRgb = hexToRgb(background)
  const luminance = (0.2126 * normalizedRgb.r + 0.7152 * normalizedRgb.g + 0.0722 * normalizedRgb.b) / 255
  const isLight = luminance > 0.58

  return {
    appearance,
    background,
    foreground: isLight ? '#08162B' : '#FFFFFF',
    muted: isLight ? 'rgba(8, 22, 43, 0.68)' : 'rgba(255, 255, 255, 0.68)',
    subtle: isLight ? 'rgba(8, 22, 43, 0.08)' : 'rgba(255, 255, 255, 0.07)',
    border: isLight ? 'rgba(8, 22, 43, 0.16)' : 'rgba(255, 255, 255, 0.12)',
  }
}
