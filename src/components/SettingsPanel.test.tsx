// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, type Settings } from '@/lib/settings'
import { SettingsPanel } from './SettingsPanel'

// Both steps on, so their options show.
const BOTH: Settings = { ...DEFAULT_SETTINGS, denoise: true, clean: true }

function Harness({ onChange = () => {}, initial = BOTH }: { onChange?: (s: Settings) => void; initial?: Settings }) {
  const [settings, setSettings] = useState(initial)
  return (
    <SettingsPanel
      settings={settings}
      onChange={(s) => {
        setSettings(s)
        onChange(s)
      }}
    />
  )
}

describe('SettingsPanel', () => {
  it('starts with neither step on', () => {
    render(<Harness initial={DEFAULT_SETTINGS} />)
    expect(screen.getByRole('switch', { name: 'Denoise' })).not.toBeChecked()
    expect(screen.getByRole('switch', { name: 'Clean' })).not.toBeChecked()
  })

  it('starts with the recommended denoiser and the 2× size off', () => {
    render(<Harness />)
    expect(screen.getByRole('radio', { name: 'GRD' })).toBeChecked()
    expect(screen.getByText(/GRD is recommended/)).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Keep 2× size' })).not.toBeChecked()
  })

  it('names the one cleaner model rather than offering a choice', () => {
    render(<Harness />)
    expect(screen.getByText(/IllustrationJaNai/)).toBeInTheDocument()
    expect(screen.queryByRole('radiogroup', { name: 'Cleaner model' })).not.toBeInTheDocument()
  })

  it("hides a step's options while it's off", async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('switch', { name: 'Clean' }))
    expect(screen.queryByRole('switch', { name: 'Keep 2× size' })).not.toBeInTheDocument()
  })

  it('reports each change', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    await user.click(screen.getByRole('switch', { name: 'Keep 2× size' }))
    expect(onChange).toHaveBeenLastCalledWith({ ...BOTH, keepUpscaled: true })
    await user.click(screen.getByRole('radio', { name: 'Lossy WebP' }))
    expect(onChange).toHaveBeenLastCalledWith({ ...BOTH, keepUpscaled: true, format: 'webp' })
  })

  it('keeps denoise passes and maximum quality under More options', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    expect(screen.queryByRole('switch', { name: /Maximum quality/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'More options' }))
    await user.click(screen.getByRole('radio', { name: '2' }))
    expect(onChange).toHaveBeenLastCalledWith({ ...BOTH, passes: 2 })
    await user.click(screen.getByRole('switch', { name: /Maximum quality/ }))
    expect(onChange).toHaveBeenLastCalledWith({ ...BOTH, passes: 2, maxQuality: true })
  })

  it('offers DenoiseGAN, with its noise translator', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    expect(screen.getByRole('radio', { name: 'GRD' })).toBeChecked()
    expect(screen.queryByRole('switch', { name: /Noise translator/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'DenoiseGAN' }))
    expect(onChange).toHaveBeenLastCalledWith({ ...BOTH, denoiser: 'gan' })
    await user.click(screen.getByRole('switch', { name: /Noise translator/ }))
    expect(onChange).toHaveBeenLastCalledWith({ ...BOTH, denoiser: 'gan', translator: true })
    await user.click(screen.getByRole('switch', { name: 'Denoise' }))
    expect(screen.queryByRole('radiogroup', { name: 'Denoiser model' })).not.toBeInTheDocument()
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
