// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { App } from './App'
import type { EngineApi } from './hooks/useBatch'
import type { JobEvent, JobResult } from './lib/engine'
import type { Hello } from './lib/protocol'
import type { Settings } from './lib/settings'

class FakeClient implements EngineApi {
  jobs: { settings: Settings; onEvent: (e: JobEvent) => void; resolve: (r: JobResult) => void }[] = []
  downloads: string[][] = []
  info: Hello = { backend: 'webgpu', cached: [], isolated: true, threads: 8 }
  async hello() {
    return this.info
  }
  process(_b: ArrayBuffer, _m: string, settings: Settings, onEvent: (e: JobEvent) => void) {
    return new Promise<JobResult>((resolve) => this.jobs.push({ settings, onEvent, resolve }))
  }
  async download(ids: string[]) {
    this.downloads.push(ids)
  }
  removed: string[][] = []
  cleared = 0
  async remove(ids: string[]) {
    this.removed.push(ids)
    this.info = { ...this.info, cached: this.info.cached.filter((id) => !ids.includes(id)) }
  }
  async clear() {
    this.cleared++
    this.info = { ...this.info, cached: [] }
  }
}

const png = (name: string) => new File([new Uint8Array(4)], name, { type: 'image/png' })

beforeEach(() => localStorage.clear())

describe('App', () => {
  it('says nothing leaves the device and invites images', async () => {
    render(<App client={new FakeClient()} />)
    expect(screen.getByText(/Nothing is uploaded/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Clean/ })).toBeDisabled()
    expect(await screen.findByText('WebGPU')).toBeInTheDocument()
  })

  it('adds images, cleans them and offers the result', async () => {
    const user = userEvent.setup()
    const client = new FakeClient()
    render(<App client={client} />)
    await user.click(screen.getByRole('switch', { name: 'Denoise' }))
    await user.click(screen.getByRole('switch', { name: 'Clean' }))
    await user.upload(screen.getByLabelText('Add images'), [png('cat.png'), png('dog.png')])

    const strip = screen.getByRole('list', { name: 'Images' })
    expect(within(strip).getAllByRole('listitem')).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: 'Clean 2 images' }))

    await waitFor(() => expect(client.jobs).toHaveLength(1))
    act(() => client.jobs[0].onEvent({ phase: 'run', done: 1, total: 4 }))
    expect(within(strip).getByRole('progressbar', { name: 'cat.png' })).toHaveAttribute('aria-valuenow', '25')
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()

    await act(async () => client.jobs[0].resolve({ bytes: new ArrayBuffer(3), width: 8, height: 6, mime: 'image/png' }))
    const download = await screen.findByRole('link', { name: /Download/ })
    expect(download).toHaveAttribute('download', 'cat-denoised-cleaned.png')
  })

  it('takes dropped files anywhere on the page', async () => {
    render(<App client={new FakeClient()} />)
    fireEvent.drop(document.body.firstElementChild!, { dataTransfer: { files: [png('a.png')], types: ['Files'] } })
    const strip = await screen.findByRole('list', { name: 'Images' })
    expect(within(strip).getAllByRole('listitem')).toHaveLength(1)
  })

  it('never lets the browser open what is dragged onto the page', () => {
    render(<App client={new FakeClient()} />)
    // An image dragged from another page may only carry its URL, not a file.
    const dataTransfer = { files: [], types: ['text/uri-list', 'text/html'] }
    expect(fireEvent.dragOver(document.body.firstElementChild!, { dataTransfer })).toBe(false)
    expect(fireEvent.drop(document.body.firstElementChild!, { dataTransfer })).toBe(false)
  })

  it('remembers settings between visits', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<App client={new FakeClient()} />)
    await user.click(screen.getByRole('radio', { name: 'Lossy WebP' }))
    unmount()
    render(<App client={new FakeClient()} />)
    expect(screen.getByRole('radio', { name: 'Lossy WebP' })).toBeChecked()
  })

  it('remembers how results are compared between visits', async () => {
    const user = userEvent.setup()
    async function cleanOne() {
      const client = new FakeClient()
      const view = render(<App client={client} />)
      await user.upload(screen.getByLabelText('Add images'), [png('cat.png')])
      await user.click(screen.getByRole('button', { name: 'Clean 1 image' }))
      await waitFor(() => expect(client.jobs).toHaveLength(1))
      await act(async () =>
        client.jobs[0].resolve({ bytes: new ArrayBuffer(3), width: 8, height: 6, mime: 'image/png' }),
      )
      return view
    }
    localStorage.setItem('art-cleaner:settings', JSON.stringify({ clean: true }))
    const first = await cleanOne()
    await user.click(await screen.findByRole('radio', { name: 'Side by side' }))
    first.unmount()
    await cleanOne()
    expect(await screen.findByRole('radio', { name: 'Side by side' })).toBeChecked()
  })

  it('downloads what the current settings need for offline use', async () => {
    const user = userEvent.setup()
    const client = new FakeClient()
    render(<App client={client} />)
    await user.click(screen.getByRole('switch', { name: 'Denoise' }))
    await user.click(screen.getByRole('switch', { name: 'Clean' }))
    await user.click(await screen.findByRole('button', { name: /Save for offline use/ }))
    await waitFor(() => expect(client.downloads).toEqual([['denoiser', 'cleanerFast']]))
  })

  it('says why saving for offline use failed', async () => {
    const user = userEvent.setup()
    const client = new FakeClient()
    client.download = async () => Promise.reject(new Error('Failed to fetch'))
    render(<App client={client} />)
    await user.click(await screen.findByRole('button', { name: /Save for offline use/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Couldn't save the files: Failed to fetch/)
    expect(screen.getByRole('button', { name: /Save for offline use/ })).toBeEnabled()
  })

  it('lists every saved file, including ones the settings do not use', async () => {
    const client = new FakeClient()
    client.info = { ...client.info, cached: ['ort', 'denoiserGan'] }
    render(<App client={client} />)
    expect(await screen.findByText('ONNX Runtime')).toBeInTheDocument()
    expect(screen.getByText('Denoiser, DenoiseGAN')).toBeInTheDocument()
    expect(screen.queryByText('Denoiser, GRD')).not.toBeInTheDocument()
  })

  it('deletes one saved file', async () => {
    const user = userEvent.setup()
    const client = new FakeClient()
    client.info = { ...client.info, cached: ['ort', 'denoiserGan'] }
    render(<App client={client} />)
    // Hidden until asked for, so they can't be clicked by mistake.
    await screen.findByText('Denoiser, DenoiseGAN')
    expect(screen.queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Manage saved files' }))
    await user.click(screen.getByRole('button', { name: 'Delete Denoiser, DenoiseGAN' }))
    expect(client.removed).toEqual([['denoiserGan']])
    await waitFor(() => expect(screen.queryByText('Denoiser, DenoiseGAN')).not.toBeInTheDocument())
  })

  it('deletes every saved file once confirmed', async () => {
    const user = userEvent.setup()
    const client = new FakeClient()
    client.info = { ...client.info, cached: ['ort', 'denoiser'] }
    render(<App client={client} />)
    await user.click(await screen.findByRole('button', { name: 'Manage saved files' }))
    await user.click(screen.getByRole('button', { name: /Delete all/ }))
    const dialog = screen.getByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(client.cleared).toBe(0)

    await user.click(screen.getByRole('button', { name: /Delete all/ }))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }))
    expect(client.cleared).toBe(1)
    // Nothing left to manage.
    await waitFor(() => expect(screen.queryByRole('button', { name: /Delete all/ })).not.toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /Manage saved files|Done/ })).not.toBeInTheDocument()
  })

  it('shows the credits and licences', async () => {
    const user = userEvent.setup()
    render(<App client={new FakeClient()} />)
    await user.click(screen.getByRole('button', { name: 'About' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/CC BY-NC-SA 4.0/)).toBeInTheDocument()
    expect(within(dialog).getAllByText(/Kim2091/).length).toBeGreaterThan(0)
    expect(within(dialog).getAllByText(/livinginparadise/)).toHaveLength(2)
    expect(within(dialog).getByText(/DenoiseGAN/)).toBeInTheDocument()
    expect(within(dialog).getByRole('link', { name: /MIT licence/ })).toHaveAttribute(
      'href',
      'https://github.com/livinginparadise/OmniGAN/blob/main/LICENSE',
    )
    expect(within(dialog).getByRole('link', { name: /Source code/ })).toHaveAttribute(
      'href',
      'https://github.com/HyphenSam/art-cleaner',
    )
  })

  it('moves between images with the arrow keys', async () => {
    const user = userEvent.setup()
    render(<App client={new FakeClient()} />)
    await user.upload(screen.getByLabelText('Add images'), [png('one.png'), png('two.png')])
    const current = () =>
      screen.getByRole('list', { name: 'Images' }).querySelector('[aria-current="true"]')?.textContent
    expect(current()).toMatch(/one\.png/)
    await user.keyboard('{ArrowRight}')
    expect(current()).toMatch(/two\.png/)
    await user.keyboard('{ArrowRight}')
    expect(current()).toMatch(/two\.png/)
    await user.keyboard('{ArrowLeft}')
    expect(current()).toMatch(/one\.png/)
  })
})
