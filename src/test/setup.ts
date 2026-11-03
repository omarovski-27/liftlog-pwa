import 'fake-indexeddb/auto'
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'
import { liftLogDb } from '../data/db'

beforeEach(async () => {
  localStorage.clear()
  await liftLogDb.sessions.clear()
  await liftLogDb.alternatives.clear()
  await liftLogDb.programVersions.clear()
  await liftLogDb.settings.clear()
  await liftLogDb.rehabPlanVersions.clear()
  await liftLogDb.rehabDayPlans.clear()
  await liftLogDb.rehabSessions.clear()
  await liftLogDb.rehabCheckIns.clear()
  await liftLogDb.rehabSettings.clear()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})
