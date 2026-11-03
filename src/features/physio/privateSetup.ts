import type { RehabExercise } from './types'
import { parseInventory, record } from './validation'

export const SETUP_PACK_PATH = 'setup/physio-v1.enc.json'
export const SETUP_AAD = 'liftlog-physio-setup:v1'
export const MAX_SETUP_BYTES = 3 * 1024 * 1024
const failed =
  'The setup code did not unlock this pack. Check that you copied the complete private code.'

function decodeBase64Url(value: unknown): Uint8Array<ArrayBuffer> {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value))
    throw new Error('Invalid setup encoding.')
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'))
  if (
    btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') !==
    value
  )
    throw new Error('Invalid setup encoding.')
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

// Decryption is local. The key is never sent to fetch, URLs, storage or logs.
export async function decryptSetupPack(
  raw: string,
  code: string,
): Promise<RehabExercise[]> {
  const trimmed = code.trim()
  if (!/^[A-Za-z0-9_-]{43}$/.test(trimmed))
    throw new Error('Paste the complete 43-character private setup code.')
  if (new TextEncoder().encode(raw).byteLength > MAX_SETUP_BYTES)
    throw new Error('The setup pack is too large.')
  if (!globalThis.crypto?.subtle)
    throw new Error(
      'Private setup requires a browser with secure encryption support. Open LiftLog over HTTPS.',
    )
  let keyBytes: Uint8Array<ArrayBuffer> | undefined
  let plaintext: ArrayBuffer | undefined
  try {
    const envelope = record(JSON.parse(raw))
    if (
      Object.keys(envelope).sort().join(',') !==
        'algorithm,ciphertext,format,iv,schemaVersion' ||
      envelope.format !== 'liftlog-encrypted-physio' ||
      envelope.schemaVersion !== 1 ||
      envelope.algorithm !== 'A256GCM'
    )
      throw new Error('Unsupported setup pack.')
    const iv = decodeBase64Url(envelope.iv)
    const ciphertext = decodeBase64Url(envelope.ciphertext)
    keyBytes = decodeBase64Url(trimmed)
    if (
      keyBytes.length !== 32 ||
      iv.length !== 12 ||
      ciphertext.length < 17 ||
      ciphertext.length > 2 * 1024 * 1024 + 16
    )
      throw new Error('Invalid setup lengths.')
    const key = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      'AES-GCM',
      false,
      ['decrypt'],
    )
    keyBytes.fill(0)
    plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv,
        additionalData: new TextEncoder().encode(SETUP_AAD),
        tagLength: 128,
      },
      key,
      ciphertext,
    )
    return parseInventory(
      new TextDecoder('utf-8', { fatal: true }).decode(plaintext),
    )
  } catch {
    // Never expose parser/crypto internals or any supplied secret in UI errors.
    throw new Error(failed)
  } finally {
    keyBytes?.fill(0)
    if (plaintext) new Uint8Array(plaintext).fill(0)
  }
}

export async function loadPrivateSetup(code: string): Promise<RehabExercise[]> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(code.trim()))
    throw new Error('Paste the complete 43-character private setup code.')
  const response = await fetch(
    `${import.meta.env.BASE_URL}${SETUP_PACK_PATH}`,
    { credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' },
  )
  if (!response.ok)
    throw new Error(
      'The exercise pack could not be downloaded. Connect to the internet and try again.',
    )
  const length = Number(response.headers.get('content-length'))
  if (Number.isFinite(length) && length > MAX_SETUP_BYTES)
    throw new Error('The setup pack is too large.')
  if (!response.body)
    throw new Error(
      'The exercise pack could not be read. Try again when connected.',
    )
  const reader = response.body.getReader()
  const chunks: Uint8Array<ArrayBuffer>[] = []
  let bytes = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > MAX_SETUP_BYTES)
        throw new Error('The setup pack is too large.')
      chunks.push(new Uint8Array(value))
    }
  } finally {
    await reader.cancel().catch(() => {})
  }
  const payload = new Uint8Array(bytes)
  let offset = 0
  for (const chunk of chunks) {
    payload.set(chunk, offset)
    offset += chunk.byteLength
  }
  return decryptSetupPack(
    new TextDecoder('utf-8', { fatal: true }).decode(payload),
    code,
  )
}
