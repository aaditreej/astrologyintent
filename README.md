# astrology-interest-check

Standalone qualifying survey, no branding. Static file, no build, no dependencies.

Deploy `index.html` as-is, from any host -- no domain restriction like the
intent-pass pair (there's no branded counterpart to keep separate from here).

## Flow

Three questions, all on one page, no navigation, no conditional reveals:

1. **Do you believe in astrology?** (Yes, I do / A little / Not really) --
   the only required field. Everything else is optional, matching the
   subhead's promise that nothing here commits the user to anything.
2. **Which of these have you done before?** (select any) -- multi-select:
   used an astrology app / talked to an astrologer / neither. "Neither" is
   exclusive: picking it clears the other two, and picking either of the
   other two clears "Neither".
3. **What are you looking for?** (optional, pick any) -- unchanged from the
   previous version: a personalised reading / something specific / a free
   first chat. No longer gated behind a "are you interested" question --
   always visible, since the user already showed interest by reaching this
   page via a cross-app link.

Progress dots below the subhead track which of the three sections the user
has engaged with (monotonic -- stays lit even if they deselect back to
nothing). CTA is disabled until Q1 is answered; label reads "Answer the
question above" -> "Show me what fits".

## Identity, gating, tracking

Same plumbing as the other pages in this project: `?user_id=` (base64 or
plain) / `?u=` short alias, `?source=` for channel attribution, stable
anonymous fallback, once-per-user completion gate (local + server), and
`navigator.sendBeacon` drop-off tracking for anyone who leaves partway
through.

## Data captured

Per event, into `SurveyEvents`: `q1_answered` .. `q4_answered`,
`q4b_changed`, `session_start`, `survey_submitted`, `session_end`,
`already_completed`.

Per session, into `SurveySessions` -- **one row whether or not they
finished**:

| Column | Note |
|---|---|
| `completed` | false for drop-offs |
| `furthest_question_reached` | 1-3, based on which sections were touched (monotonic, same principle as before, recalibrated to 3 questions instead of 5) |
| `believes_in_astrology` | the one required answer |
| `prior_experience_flat` | csv of `used_app` / `talked_to_astrologer` / `neither`, any combination except neither-plus-another |
| `interest_types_flat` | unchanged in meaning from before -- no longer gated, so it can be populated regardless of any other answer |
| `time_to_first_answer_ms` / `time_to_submit_ms` | null when they dropped off |

## Deploy

Paste `Code.gs` into the Sheet's Apps Script editor and deploy a **new
version of the same deployment** (Manage deployments -> edit -> New version),
not a fresh deployment -- that would mint a different URL and this page
would keep posting to the old one. Adds two new tabs (`SurveyEvents`,
`SurveySessions`) alongside the existing VIP and intent-pass ones; nothing
in the existing sheets is touched.
