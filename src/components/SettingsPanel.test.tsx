// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, type Settings } from '@/lib/settings'
import { SettingsPanel } from './SettingsPanel'

function Harness({
  onChange = () => {},
  backend = 'webgpu' as const,
}: {
  onChange?: (s: Settings) => void
  backend?: 'webgpu' | 'wasm'
}) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  return (
    <SettingsPanel
      settings={settings}
      backend={backend}
      onChange={(s) => {
        setSettings(s)
        onChange(s)
      }}
    />
  )
}

describe('SettingsPanel', () => {
  it('starts with both steps on and the 2× size off', () => {
    render(<Harness />)
    expect(screen.getByRole('switch', { name: 'Denoise' })).toBeChecked()
    expect(screen.getByRole('switch', { name: 'Clean' })).toBeChecked()
    expect(screen.getByRole('switch', { name: 'Keep 2× size' })).not.toBeChecked()
  })

  it("hides a step's options while it's off", async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('switch', { name: 'Clean' }))
    expect(screen.queryByRole('switch', { name: 'Keep 2× size' })).not.toBeInTheDocument()
    expect(screen.queryByRole('radiogroup', { name: 'Cleaner model' })).not.toBeInTheDocument()
  })

  it('reports each change', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    await user.click(screen.getByRole('switch', { name: 'Keep 2× size' }))
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_SETTINGS, keepUpscaled: true })
    await user.click(screen.getByRole('radio', { name: 'Fast' }))
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_SETTINGS, keepUpscaled: true, cleaner: 'fast' })
  })

  it('keeps denoise passes and maximum quality under More options', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    expect(screen.queryByRole('switch', { name: /Maximum quality/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'More options' }))
    await user.click(screen.getByRole('radio', { name: '2' }))
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_SETTINGS, passes: 2 })
    await user.click(screen.getByRole('switch', { name: /Maximum quality/ }))
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_SETTINGS, passes: 2, maxQuality: true })
  })

  it('says which model Auto picks on this device', () => {
    const { unmount } = render(<Harness backend="webgpu" />)
    expect(screen.getByText(/Auto uses Full on this device/)).toBeInTheDocument()
    unmount()
    render(<Harness backend="wasm" />)
    expect(screen.getByText(/Auto uses Fast on this device/)).toBeInTheDocument()
  })

  it('asks for a quality only for lossy WebP', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    expect(screen.queryByRole('slider', { name: 'Quality' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'Lossy WebP' }))
    expect(screen.getByRole('slider', { name: 'Quality' })).toHaveAttribute('aria-valuenow', '95')
    await user.click(screen.getByRole('radio', { name: 'WebP' }))
    expect(screen.queryByRole('slider', { name: 'Quality' })).not.toBeInTheDocument()
  })
})
