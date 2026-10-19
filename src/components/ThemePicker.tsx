import { useEffect, useRef, useState } from 'react'
import { applyTheme, loadFonts, storedTheme, THEMES } from '../themes'

export function ThemePicker() {
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState(storedTheme)
  const pickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    // Load every theme's fonts so each name previews in its own type.
    THEMES.forEach(loadFonts)
    const onClick = (event: MouseEvent) => {
      if (event.target instanceof Node && !pickerRef.current?.contains(event.target)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('click', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={pickerRef} className="theme-picker">
      <button
        type="button"
        className="theme-button"
        aria-label="Change theme"
        aria-expanded={open}
        title="Theme"
        onClick={() => setOpen((value) => !value)}
      />
      {open && (
        <div className="theme-menu" role="radiogroup" aria-label="Theme">
          {THEMES.map((theme) => (
            <button
              key={theme.id}
              type="button"
              role="radio"
              aria-checked={theme.id === current}
              className="theme-option"
              onClick={() => {
                applyTheme(theme.id)
                setCurrent(theme.id)
              }}
            >
              <span className="theme-swatch" aria-hidden="true">
                {theme.swatch.map((color) => (
                  <span key={color} style={{ background: color }} />
                ))}
              </span>
              <span>
                <span className="theme-name" style={{ fontFamily: theme.displayFont }}>
                  {theme.name}
                </span>
                <span className="theme-description">{theme.description}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
