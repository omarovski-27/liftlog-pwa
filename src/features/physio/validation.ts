import {
  DISPOSITIONS,
  GROUPS,
  OUTCOMES,
  emptyDose,
  type Dose,
  type RehabData,
  type RehabExercise,
  type RehabPlanVersion,
} from './types'

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected an object.')
  return value as Record<string, unknown>
}
function keys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    throw new Error('Unsupported physio field.')
}
export function textValue(value: unknown, max = 2000): asserts value is string {
  if (typeof value !== 'string' || value.length > max)
    throw new Error('Invalid physio text.')
}
function id(value: unknown): asserts value is string {
  textValue(value, 200)
  if (!value.length) throw new Error('Missing physio identity.')
}
function choice(value: unknown, choices: readonly unknown[]) {
  if (!choices.includes(value)) throw new Error('Invalid physio option.')
}
function numberValue(value: unknown, max = 100000, integer = true) {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > max ||
    (integer && !Number.isInteger(value))
  )
    throw new Error('Invalid physio number.')
}
function nullableNumber(value: unknown, max = 100000, integer = true) {
  if (value !== null) numberValue(value, max, integer)
}
export function dateValue(value: unknown) {
  textValue(value, 40)
  if (
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value.slice(0, 10)
  )
    throw new Error('Invalid physio timestamp.')
}
export function localDate(value: unknown) {
  textValue(value, 10)
  if (
    !/^\d{4}-\d\d-\d\d$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  )
    throw new Error('Invalid physio local date.')
}
export function timezoneValue(value: unknown) {
  textValue(value, 100)
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format()
  } catch {
    throw new Error('Invalid timezone.')
  }
}
function list(value: unknown, max = 10000): unknown[] {
  if (!Array.isArray(value) || value.length > max)
    throw new Error('Invalid physio list.')
  return value
}
function unique(values: unknown[]) {
  if (new Set(values).size !== values.length)
    throw new Error('Duplicate physio identities.')
}
export function safeDemoUrl(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('Use a complete HTTPS video URL.')
  }
  const hosts = [
    'youtube.com',
    'www.youtube.com',
    'youtu.be',
    'vimeo.com',
    'www.vimeo.com',
    'player.vimeo.com',
  ]
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    !hosts.includes(url.hostname)
  )
    throw new Error('Use an HTTPS YouTube or Vimeo video link.')
  const youtube = url.hostname.endsWith('youtube.com')
  const videoId = youtube
    ? (url.searchParams.get('v') ??
      url.pathname.match(/^\/(?:embed|shorts)\/([\w-]{11})\/?$/)?.[1])
    : url.hostname === 'youtu.be'
      ? url.pathname.slice(1)
      : null
  if (youtube || url.hostname === 'youtu.be') {
    if (!videoId || !/^[\w-]{11}$/.test(videoId))
      throw new Error('Use a video link, not a search or channel page.')
    return `https://www.youtube.com/watch?v=${videoId}`
  }
  const match = url.pathname.match(/^\/(?:video\/)?(\d+)\/?$/)
  if (!match) throw new Error('Use a direct Vimeo video link.')
  return `https://vimeo.com/${match[1]}`
}
function doseValue(value: unknown) {
  const dose = record(value)
  keys(dose, Object.keys(emptyDose()))
  for (const field of [
    'sets',
    'reps',
    'holdSecondsPerRep',
    'durationSeconds',
    'restSeconds',
    'frequencyPerWeek',
  ])
    nullableNumber(dose[field], field === 'frequencyPerWeek' ? 100 : 100000)
  choice(dose.repBasis, [null, 'total', 'per side'])
  choice(dose.side, [null, 'left', 'right', 'bilateral', 'alternating'])
}
export function validateExercise(
  value: unknown,
): asserts value is RehabExercise {
  const e = record(value)
  keys(e, [
    'id',
    'name',
    'group',
    'disposition',
    'dose',
    'doseOrigin',
    'sourceDoseText',
    'sourceImages',
    'sourceInstructions',
    'notes',
    'variantConfirmed',
    'weekdays',
    'demo',
  ])
  id(e.id)
  id(e.name)
  choice(e.group, GROUPS)
  choice(e.disposition, DISPOSITIONS)
  doseValue(e.dose)
  choice(e.doseOrigin, ['source screenshot', 'user entered'])
  if (e.sourceDoseText !== null) textValue(e.sourceDoseText)
  list(e.sourceImages, 100).forEach((item) => textValue(item, 200))
  textValue(e.sourceInstructions)
  textValue(e.notes)
  choice(e.variantConfirmed, [true, false])
  const days = list(e.weekdays, 7)
  unique(days)
  days.forEach((day) => numberValue(day, 6))
  if (e.demo !== null) {
    const d = record(e.demo)
    keys(d, [
      'url',
      'title',
      'provider',
      'variant',
      'checkedOn',
      'reviewer',
      'status',
    ])
    textValue(d.url, 1000)
    safeDemoUrl(d.url)
    for (const field of ['title', 'provider', 'variant', 'reviewer'])
      textValue(d[field])
    localDate(d.checkedOn)
    choice(d.status, ['candidate', 'user supplied', 'clinician supplied'])
  }
}
export function validatePlan(
  value: unknown,
): asserts value is RehabPlanVersion {
  const p = record(value)
  keys(p, [
    'id',
    'planId',
    'version',
    'createdAt',
    'effectiveDate',
    'source',
    'exercises',
  ])
  id(p.id)
  id(p.planId)
  numberValue(p.version)
  if (!p.version) throw new Error('Invalid plan version.')
  dateValue(p.createdAt)
  localDate(p.effectiveDate)
  choice(p.source, ['private source inventory', 'user entered'])
  const exercises = list(p.exercises, 500)
  exercises.forEach(validateExercise)
  unique(exercises.map((e) => record(e).id))
}
export function validateRehabData(value: unknown): asserts value is RehabData {
  const data = record(value)
  keys(data, [
    'rehabPlanVersions',
    'rehabDayPlans',
    'rehabSessions',
    'rehabCheckIns',
    'rehabSettings',
  ])
  Object.values(data).forEach((values) => {
    const items = list(values)
    items.forEach((item) => id(record(item).id))
    unique(items.map((item) => record(item).id))
  })
  const plans = list(data.rehabPlanVersions)
  plans.forEach(validatePlan)
  unique(plans.map((p) => `${record(p).planId}:${record(p).version}`))
  const planIds = new Set(plans.map((p) => record(p).planId))
  const versions = new Map(
    plans.map((p) => [record(p).id, p as RehabPlanVersion]),
  )
  const dayPlans = list(data.rehabDayPlans)
  unique(dayPlans.map((p) => `${record(p).planId}:${record(p).localDate}`))
  for (const item of dayPlans) {
    const d = record(item)
    keys(d, [
      'id',
      'planId',
      'planVersionId',
      'localDate',
      'timezone',
      'createdAt',
      'occurrences',
    ])
    id(d.planId)
    id(d.planVersionId)
    localDate(d.localDate)
    timezoneValue(d.timezone)
    dateValue(d.createdAt)
    const plan = versions.get(d.planVersionId)
    if (!plan || plan.planId !== d.planId)
      throw new Error('Missing physio plan reference.')
    const occurrences = list(d.occurrences, 500)
    unique(occurrences.map((o) => record(o).id))
    for (const item of occurrences) {
      const o = record(item)
      keys(o, ['id', 'exercise', 'required'])
      id(o.id)
      validateExercise(o.exercise)
      choice(o.required, [true, false])
      if (
        !plan.exercises.some((e) => e.id === (o.exercise as RehabExercise).id)
      )
        throw new Error('Missing exercise reference.')
    }
  }
  const days = new Map(dayPlans.map((d) => [record(d).id, record(d)]))
  const sessions = list(data.rehabSessions)
  const unfinished = sessions.filter((s) =>
    ['active', 'paused'].includes(String(record(s).status)),
  )
  if (unfinished.length > 1)
    throw new Error('More than one unfinished physio session.')
  unique(sessions.map((s) => record(s).dayPlanId))
  for (const item of sessions) {
    const s = record(item)
    keys(s, [
      'id',
      'dayPlanId',
      'revision',
      'startedAt',
      'updatedAt',
      'finishedAt',
      'status',
      'logs',
    ])
    id(s.dayPlanId)
    numberValue(s.revision)
    dateValue(s.startedAt)
    dateValue(s.updatedAt)
    choice(s.status, ['active', 'paused', 'finished', 'abandoned'])
    if (s.finishedAt !== null) dateValue(s.finishedAt)
    if (
      ['finished', 'abandoned'].includes(String(s.status)) !==
      (s.finishedAt !== null)
    )
      throw new Error('Invalid physio lifecycle.')
    const day = days.get(s.dayPlanId)
    if (!day) throw new Error('Missing day-plan reference.')
    const occurrences = day.occurrences as { id: string }[]
    const logs = list(s.logs, 500)
    unique(logs.map((l) => record(l).occurrenceId))
    if (logs.length !== occurrences.length)
      throw new Error('Missing physio exercise logs.')
    for (const item of logs) {
      const l = record(item)
      keys(l, ['occurrenceId', 'outcome', 'actual', 'notes'])
      id(l.occurrenceId)
      choice(l.outcome, OUTCOMES)
      textValue(l.notes)
      if (!occurrences.some((o) => o.id === l.occurrenceId))
        throw new Error('Missing occurrence reference.')
      const a = record(l.actual)
      keys(a, [
        'sets',
        'reps',
        'holdSecondsPerRep',
        'durationSeconds',
        'breaths',
        'steps',
        'side',
        'setup',
      ])
      for (const field of [
        'sets',
        'reps',
        'holdSecondsPerRep',
        'durationSeconds',
        'breaths',
        'steps',
      ])
        nullableNumber(a[field])
      choice(a.side, [null, 'left', 'right', 'bilateral', 'alternating'])
      textValue(a.setup)
    }
  }
  const sessionIds = new Set(sessions.map((s) => record(s).id))
  for (const item of list(data.rehabCheckIns)) {
    const c = record(item)
    keys(c, [
      'id',
      'localDate',
      'timezone',
      'observedAt',
      'recordedAt',
      'region',
      'pain',
      'swelling',
      'instability',
      'response',
      'sessionId',
      'notes',
    ])
    localDate(c.localDate)
    timezoneValue(c.timezone)
    dateValue(c.observedAt)
    dateValue(c.recordedAt)
    choice(c.region, GROUPS)
    nullableNumber(c.pain, 10)
    choice(c.swelling, [null, true, false])
    choice(c.instability, [null, true, false])
    choice(c.response, ['before', 'after', 'next day', 'rest'])
    textValue(c.notes)
    if (c.sessionId !== null && !sessionIds.has(c.sessionId))
      throw new Error('Missing check-in session reference.')
  }
  const settings = list(data.rehabSettings, 1)
  for (const item of settings) {
    const s = record(item)
    keys(s, ['id', 'activePlanId', 'timezone', 'updatedAt'])
    choice(s.id, ['physio'])
    id(s.activePlanId)
    timezoneValue(s.timezone)
    dateValue(s.updatedAt)
    if (!planIds.has(s.activePlanId))
      throw new Error('Missing active physio plan.')
  }
}

export function parseInventory(raw: string): RehabExercise[] {
  if (new TextEncoder().encode(raw).byteLength > 2 * 1024 * 1024)
    throw new Error('Physio inventory must be smaller than 2 MB.')
  const data = record(JSON.parse(raw))
  if (data.format === 'liftlog-physio-library') {
    keys(data, ['format', 'schemaVersion', 'exercises'])
    if (data.schemaVersion !== 1)
      throw new Error('Unsupported physio library version.')
    const exercises = list(data.exercises, 500)
    if (!exercises.length) throw new Error('The physio library is empty.')
    exercises.forEach(validateExercise)
    unique(exercises.map((e) => record(e).id))
    return exercises as RehabExercise[]
  }
  keys(data, [
    'format',
    'inventorySchemaVersion',
    'preparedOn',
    'sourceProgrammeDate',
    'privacy',
    'compatibility',
    'notMedicalPrescription',
    'uniqueExerciseCount',
    'exercises',
  ])
  if (
    data.format !== 'liftlog-physio-source-inventory' ||
    data.inventorySchemaVersion !== 1
  )
    throw new Error('Unsupported physio inventory format.')
  localDate(data.preparedOn)
  localDate(data.sourceProgrammeDate)
  for (const key of ['privacy', 'compatibility', 'notMedicalPrescription'])
    textValue(data[key])
  const entries = list(data.exercises, 500)
  if (!entries.length || entries.length !== data.uniqueExerciseCount)
    throw new Error('Inventory exercise count does not match.')
  const exercises = entries.map((item) => {
    const e = record(item)
    keys(e, [
      'sourceId',
      'sourceName',
      'proposedUiGroup',
      'groupingOrigin',
      'sourceImages',
      'nameVerification',
      'visibleDoseText',
      'dose',
      'doseStatus',
      'routineStatus',
      'variantReviewStatus',
      'demonstration',
      'completedSessions',
      'sourceInstructions',
    ])
    for (const key of [
      'groupingOrigin',
      'nameVerification',
      'doseStatus',
      'routineStatus',
      'variantReviewStatus',
    ])
      textValue(e[key])
    if (list(e.completedSessions).length)
      throw new Error('Source inventory cannot import historical completions.')
    const demo = record(e.demonstration)
    keys(demo, ['url', 'verificationStatus'])
    textValue(demo.verificationStatus)
    if (demo.url !== null)
      throw new Error('Import demonstration links separately for review.')
    const exercise: RehabExercise = {
      id: e.sourceId as string,
      name: e.sourceName as string,
      group: e.proposedUiGroup as RehabExercise['group'],
      disposition: 'awaiting clarification',
      dose: e.dose as Dose,
      doseOrigin: 'source screenshot',
      sourceDoseText: e.visibleDoseText as string | null,
      sourceImages: e.sourceImages as string[],
      sourceInstructions: (e.sourceInstructions ?? '') as string,
      notes: '',
      variantConfirmed: false,
      weekdays: [],
      demo: null,
    }
    validateExercise(exercise)
    return exercise
  })
  unique(exercises.map((e) => e.id))
  return exercises
}
