import 'fake-indexeddb/auto'
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'
import { liftLogDb } from '../data/db'

beforeEach(async () => {
  await liftLogDb.sessions.clear()
  await liftLogDb.alternatives.clear()
  await liftLogDb.programVersions.clear()
  await liftLogDb.settings.clear()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})
