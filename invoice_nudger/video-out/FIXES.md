# App bugs found while recording, and what I changed

These are in `/home/juswasif/Documents/work/mel/invoice_nudger` (the app). Each was a real
breakage that would have shown up on camera; none is cosmetic.

1. **Approve was wired to the wrong route.** `app/(dashboard)/queue/page.tsx` posted to
   `/api/owner/approve`, which expects `{reminderId}`; the queue sent `{invoice_id, subject,
   body, stage}` → every Approve returned **400 "Invalid input"** and the card showed
   "Could not approve". Now posts to `/api/reminders/approve` (the zod-validated route).

2. **Skip was wired to the wrong route.** Same file posted to `/api/owner/reject`
   (`{reminderId}`) → every Skip 400'd. Now `/api/reminders/skip` (`{invoice_id, reason}`).

3. **"Pull overdue" called a route that does not exist.** `app/components/dashboard-shell.tsx`
   posted to `/api/runs` → **404**, so the pull always failed with a toast. Now `/api/pull`.

4. **The reminder card invented its own text.** The queue built a client-side template instead
   of showing the draft the pull had stored, so the email on screen was not the one that would
   be sent (no stage wording, no due date). `/api/queue` now returns `draft_subject`,
   `draft_body`, `draft_stage` and `due_date`, and the card shows that text.

5. **Overview "Top 5 to chase" was all zeros.** `app/api/overview/route.ts` mapped raw reminder
   rows through `rowToQueueInvoice`, so tier read "Watch", days overdue 0, score 0, on every
   row. It now builds the ranked queue the same way `/api/queue` does.

6. **Chart right axis showed `$0.01 … $0.04`.** With zero outstanding, Recharts chose
   fractional ticks on a cents axis. `app/components/recovered-chart.tsx` now pins the right
   axis to a rounded whole-dollar domain.

7. **Re-pulling resurrected a skipped reminder.** `lib/pull.ts` only skipped invoices that had
   an open draft, so a skip was undone by the next pull. Skipped invoices are now excluded.

8. **The reminder card overflowed the viewport.** The long Stripe pay URL is one unbroken
   token; `min-w-0`/`break-words` on the card and preview keep it inside the pane.

Verified after the fixes: `npx tsc --noEmit` clean, `npx vitest run` **47/47 pass**,
`npm run build` OK, and the recorded take ends with the outcomes listed in README-video.md.
