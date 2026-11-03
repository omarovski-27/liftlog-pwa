import { webcrypto } from 'node:crypto'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { liftLogDb } from '../../data/db'
import { emptyDose, type RehabExercise } from './types'
import {
  decryptSetupPack,
  loadPrivateSetup,
  MAX_SETUP_BYTES,
  SETUP_AAD,
  SETUP_PACK_PATH,
} from './privateSetup'
import { PhysioView } from './PhysioView'
import { readRehabData, savePlan } from './repository'

const exercise: RehabExercise = {
  id: 'synthetic-movement',
  name: 'Synthetic movement',
  group: 'back_core_hip',
  disposition: 'awaiting clarification',
  dose: emptyDose(),
  doseOrigin: 'source screenshot',
  sourceDoseText: null,
  sourceImages: [],
  sourceInstructions: '',
  notes: '',
  variantConfirmed: false,
  weekdays: [],
  demo: {
    url: 'https://www.youtube.com/watch?v=abcdefghijk',
    title: 'Synthetic demo',
    provider: 'Synthetic provider',
    variant: 'Unconfirmed',
    checkedOn: '2026-11-03',
    reviewer: 'Synthetic research',
    status: 'candidate',
  },
}
const library = JSON.stringify({
  format: 'liftlog-physio-library',
  schemaVersion: 1,
  exercises: [exercise],
})
const keyBytes = new Uint8Array(32).fill(7)
const code = Buffer.from(keyBytes).toString('base64url')
beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

async function pack(plaintext = library) {
  const iv = webcrypto.getRandomValues(new Uint8Array(12))
  const key = await webcrypto.subtle.importKey(
    'raw',
    keyBytes,
    'AES-GCM',
    false,
    ['encrypt'],
  )
  const ciphertext = await webcrypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: new TextEncoder().encode(SETUP_AAD),
      tagLength: 128,
    },
    key,
    new TextEncoder().encode(plaintext),
  )
  return {
    format: 'liftlog-encrypted-physio',
    schemaVersion: 1,
    algorithm: 'A256GCM',
    iv: Buffer.from(iv).toString('base64url'),
    ciphertext: Buffer.from(ciphertext).toString('base64url'),
  }
}
describe('private exercise setup', () => {
  it('authenticates/decrypts a pack without changing missing doses or candidate metadata', async () => {
    expect(await decryptSetupPack(JSON.stringify(await pack()), code)).toEqual([
      exercise,
    ])
    expect(await liftLogDb.rehabPlanVersions.count()).toBe(0)
  })
  it('rejects the wrong key and modified authenticated ciphertext without exposing input', async () => {
    const encrypted = await pack()
    const wrong = Buffer.from(new Uint8Array(32).fill(8)).toString('base64url')
    await expect(
      decryptSetupPack(JSON.stringify(encrypted), wrong),
    ).rejects.toThrow('did not unlock')
    const damaged = Buffer.from(encrypted.ciphertext, 'base64url')
    damaged[0] ^= 1
    await expect(
      decryptSetupPack(
        JSON.stringify({
          ...encrypted,
          ciphertext: damaged.toString('base64url'),
        }),
        code,
      ),
    ).rejects.toThrow('did not unlock')
    expect(await liftLogDb.rehabPlanVersions.count()).toBe(0)
  })
  it.each(['version', 'algorithm', 'iv', 'extra', 'truncated'] as const)(
    'rejects an invalid %s envelope',
    async (field) => {
      const encrypted = await pack()
      const changed =
        field === 'version'
          ? { ...encrypted, schemaVersion: 2 }
          : field === 'algorithm'
            ? { ...encrypted, algorithm: 'A128GCM' }
            : field === 'iv'
              ? { ...encrypted, iv: Buffer.alloc(11).toString('base64url') }
              : field === 'extra'
                ? { ...encrypted, command: 'execute' }
                : {
                    ...encrypted,
                    ciphertext: encrypted.ciphertext.slice(0, -8),
                  }
      await expect(
        decryptSetupPack(JSON.stringify(changed), code),
      ).rejects.toThrow('did not unlock')
    },
  )
  it('validates the inner library even after successful authentication', async () => {
    for (const plaintext of [
      'not json',
      JSON.stringify({
        format: 'liftlog-physio-library',
        schemaVersion: 1,
        exercises: [
          { ...exercise, demo: { ...exercise.demo, url: 'javascript:bad()' } },
        ],
      }),
    ]) {
      await expect(
        decryptSetupPack(JSON.stringify(await pack(plaintext)), code),
      ).rejects.toThrow('did not unlock')
    }
    expect(await liftLogDb.rehabPlanVersions.count()).toBe(0)
  })
  it('downloads only the fixed same-site asset and never sends the secret', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(await pack())))
    vi.stubGlobal('fetch', fetchMock)
    expect(await loadPrivateSetup(code)).toEqual([exercise])
    expect(fetchMock).toHaveBeenCalledWith(
      `${import.meta.env.BASE_URL}${SETUP_PACK_PATH}`,
      { credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' },
    )
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain(code)
    expect(localStorage.length).toBe(0)
  })
  it('bounds download sizes before decoding/decryption', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response('oversized', {
            headers: { 'content-length': String(MAX_SETUP_BYTES + 1) },
          }),
        ),
    )
    await expect(loadPrivateSetup(code)).rejects.toThrow('too large')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('x'.repeat(MAX_SETUP_BYTES + 1))),
    )
    await expect(loadPrivateSetup(code)).rejects.toThrow('too large')
  })
  it('does not fetch malformed codes and explains network failures', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('', { status: 404 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(loadPrivateSetup('short')).rejects.toThrow('43-character')
    expect(fetchMock).not.toHaveBeenCalled()
    await expect(loadPrivateSetup(code)).rejects.toThrow('downloaded')
  })
  it('clears the code, previews contents and adds locally without changing lifting', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(await pack()))),
    )
    const view = render(<PhysioView onUnsavedChange={vi.fn()} />)
    const input = await screen.findByLabelText('Private setup code')
    fireEvent.change(input, { target: { value: code } })
    fireEvent.click(screen.getByRole('button', { name: 'Load my exercises' }))
    await screen.findByRole('heading', { name: 'Review 1 exercises' })
    expect(
      screen.queryByLabelText('Private setup code'),
    ).not.toBeInTheDocument()
    expect(await liftLogDb.rehabPlanVersions.count()).toBe(0)
    fireEvent.click(screen.getByRole('button', { name: 'Add exercises' }))
    await waitFor(async () =>
      expect(await liftLogDb.rehabPlanVersions.count()).toBe(1),
    )
    const data = await readRehabData()
    expect(data.rehabPlanVersions[0].exercises).toEqual([exercise])
    expect(data.rehabSessions).toHaveLength(0)
    expect(await liftLogDb.sessions.count()).toBe(0)
    expect(await liftLogDb.programVersions.count()).toBe(0)
    expect(localStorage.length).toBe(0)
    view.unmount()
    render(<PhysioView onUnsavedChange={vi.fn()} />)
    await screen.findByRole('heading', { name: 'Today’s routine' })
    expect(
      screen.queryByLabelText('Private setup code'),
    ).not.toBeInTheDocument()
    await expect(savePlan([exercise])).rejects.toThrow('another window')
    expect(await liftLogDb.rehabPlanVersions.count()).toBe(1)
  })
  it('wrong codes produce no writes and allow a corrected attempt', async () => {
    const encrypted = JSON.stringify(await pack())
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation(() => Promise.resolve(new Response(encrypted))),
    )
    render(<PhysioView onUnsavedChange={vi.fn()} />)
    const input = await screen.findByLabelText('Private setup code')
    fireEvent.change(input, {
      target: { value: Buffer.alloc(32, 8).toString('base64url') },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Load my exercises' }))
    await screen.findByRole('alert')
    expect(input).toHaveValue('')
    expect(await liftLogDb.rehabPlanVersions.count()).toBe(0)
    fireEvent.change(input, { target: { value: code } })
    fireEvent.click(screen.getByRole('button', { name: 'Load my exercises' }))
    await screen.findByRole('heading', { name: 'Review 1 exercises' })
  })
})
