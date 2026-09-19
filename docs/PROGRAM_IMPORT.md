# LiftLog Program JSON

LiftLog accepts local JSON files using `liftlog-program` schema version 1. The same JSON can be pasted into the app. Markdown-fenced JSON from an external AI is also accepted.

## Shape

```json
{
  "format": "liftlog-program",
  "schemaVersion": 1,
  "name": "Eight Week Strength",
  "durationWeeks": 8,
  "startingWeek": 1,
  "fullRestDay": "Sunday",
  "progression": ["Add weight after every set reaches the top of its range."],
  "constraints": [],
  "stopTriggers": [],
  "workouts": [
    {
      "name": "Upper A",
      "day": "Monday",
      "focus": "Heavy pressing and pulling",
      "notes": "Optional workout note",
      "exercises": [
        {
          "name": "Bench press",
          "sets": 4,
          "reps": "6-10",
          "metric": "reps",
          "rir": "2",
          "rest": "3 min",
          "type": "working",
          "muscles": ["chest", "triceps"],
          "section": "Main work",
          "notes": "Optional exercise note",
          "weekOverrides": [
            { "startWeek": 1, "endWeek": 2, "sets": 3, "reps": "8-10" }
          ]
        }
      ]
    }
  ]
}
```

## Values

- `durationWeeks`: whole number from 1 to 104.
- `startingWeek`: whole number within the program duration. It defaults to 1.
- `day` and `fullRestDay`: weekday names. Common abbreviations are accepted. `fullRestDay` may be `None`.
- `type`: `working`, `warm-up`, or `prehab`. It defaults to `working`.
- `sets`: whole number from 1 to 99.
- `reps`, `rir`, and `rest`: text targets. Numeric reps and RIR are also accepted.
- `metric`: `reps`, `seconds`, or `meters`. For carries or holds use, for example, `reps: "30-45 sec"` and `metric: "seconds"`; for distances use `metric: "meters"`. Without an explicit metric, seconds and meters are inferred from the target. Logged duration and distance remain separate from reps and are excluded from rep-volume and estimated strength calculations.
- `muscles`: one or more of `chest`, `back`, `quads`, `hamstrings`, `glutes`, `calves`, `core`, `biceps`, `triceps`, `shoulders`, `side-delts`, `rear-delts`, `traps`, `forearms`, `grip`, or `prehab`.
- `weekOverrides`: optional, non-overlapping week ranges that replace `sets`, `reps`, or both. Omit a field to keep its base value.

For a paired set, add the same group to both exercises and use positions `A` and `B`:
Each group must contain exactly one `A` exercise and one `B` exercise within its workout.

```json
"pair": { "group": "Pair 1", "position": "A" }
```

Program JSON never carries database ids or workout history. LiftLog generates new identities, opens the imported prescription in the visual builder, and saves it only after review.
