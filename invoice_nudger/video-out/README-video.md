# B2-05 Invoice Nudger — video package

## Deliverables (`out/`)
| File | Length | Format |
|---|---|---|
| `b2-05-invoice-nudger-full.mp4` | 141.4 s | 1920×1080, 30 fps, H.264 + silent stereo AAC |
| `b2-05-invoice-nudger-short.mp4` | 36.4 s | 1080×1920, 30 fps |
| `b2-05-invoice-nudger-cover.png` | — | 1920×1080 |

## How it was built
* `tools/demo.mjs` — Playwright recorder of the live app at 1440×810 (DPR 2), signed in
  off camera with `OWNER_EMAIL`/`OWNER_PASSWORD` from `.env.local` and passed as
  `storageState`. Also drives Mailpit and the Stripe hosted page in the same session.
* `tools/scenes.mjs` — motion cards, wallpaper/mask assets, caption pills, cover.
* `tools/segments.py` — the shot plan (22 segments) with camera keys.
* `tools/render.py` — engine: window + shadow on the 4K stage, eased zoompan camera.
* `tools/vertical.py` — the 9:16 short.
* `work/reset.mjs` — resets app rows, reminder metadata and Mailpit before a take.

## Colours
Emerald `#047857` is the primary accent (cards, section, checks, captions' button),
`#B42318` the second (tier chips, outstanding line, the "no human click" contrast).

## Verified outcomes (not claims)
* Queue: 12 overdue at the pull, ranked; #1 was the invoice approved on camera.
* Approve → `200`, card flips to "Sent", list advances (12 → 11 → 10 after skip).
* Stripe: `BAM6GVAQ-0001` `status=paid`, `amount_paid=10110.00 usd`,
  `metadata.reminder_count=1`, `livemode=false`.
* Mailpit: exactly **one** invoice reminder on the machine, the one approved on camera
  (the other 7 messages there belong to unrelated projects and are not invoice reminders).
* Recovery row `source=app`, `amount=10110.00`, `days_to_pay=0`.
* After the second pull: overdue `$47,220 → $37,110`, recovered `$32,810 → $32,920`,
  the paid invoice gone from the queue (that is the chart step-up on screen).
* Skip kept its reason: `Marble & Main / HUCAZRPV-0001 /
  "Customer already promised a payment date by phone."`
