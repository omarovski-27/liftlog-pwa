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
          "rir": "2",
          "rest": "3 min",
          "type": "working",
          "muscles": ["chest", "triceps"],
          "section": "Main work",
          "notes": "Optional exercise note"
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
- `muscles`: one or more of `chest`, `back`, `quads`, `hamstrings`, `glutes`, `calves`, `core`, `biceps`, `triceps`, `shoulders`, `side-delts`, `rear-delts`, `traps`, `forearms`, `grip`, or `prehab`.

For a paired set, add the same group to both exercises and use positions `A` and `B`:

```json
"pair": { "group": "Pair 1", "position": "A" }
```

Program JSON never carries database ids or workout history. LiftLog generates new identities, opens the imported prescription in the visual builder, and saves it only after review.
