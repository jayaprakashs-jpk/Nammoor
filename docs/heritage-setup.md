# Heritage features: setup and rules

Voice stories, album, old photo clean up, AI restore, polls, recipes, PDF poster and story book, duplicate hints.
Everything is private to one family. Nothing here talks to another family's data.

## What needs setup

| Feature | Needs setup? |
|---|---|
| Voice stories, album, clean up, polls, recipes, PDF, duplicate hints | No. Works after the database migration `20261125000009_heritage_features.sql` |
| AI photo restore | Yes, 3 steps below. Without them the button says **Coming soon** and nothing else happens |

## Turn on AI photo restore (optional)

1. Make a Replicate account and an API token (replicate.com, Account, API tokens).
2. Save the token as a function secret. Never put it in the app or in a file:
   `supabase secrets set REPLICATE_API_TOKEN=r8_xxx --project-ref ijvisbjyhkpifhyltrxk`
3. Deploy the function from this repo:
   `supabase functions deploy restore-photo --project-ref ijvisbjyhkpifhyltrxk`

The function uses the Replicate model `flux-kontext-apps/restore-image`. It is paid per run by Replicate.
Colour models (`piddnad/ddcolor`, `sczhou/codeformer`) need a pinned version hash from Replicate. They are not wired in.

**Limit:** 3 AI restores per family per day (India time). It is enforced in the database (`ai_restore_begin`), not in the app.
A failed run gives the slot back. A run stuck for more than 10 minutes also frees its slot.

**Privacy:** the photo is sent to Replicate only when someone taps the button and confirms. The original is never changed.
The restored copy is saved next to it in the family album, marked AI.

## Voice stories

* Max 3 minutes. The app stops by itself at 3:00.
* Android: `@capgo/capacitor-audio-recorder` in `aac` format (frames), so a crash or an empty battery keeps what was said so far. The plugin adds the `RECORD_AUDIO` permission.
* Website: the browser's MediaRecorder.
* Stored in the private bucket `family-audio` at `{family_id}/{person_id}/{id}.{aac|m4a|webm}`. Playback uses a signed link (1 hour), fetched only when someone taps play.

## Who can do what

| | Viewer | Editor | Admin / Owner |
|---|---|---|---|
| See album, voice stories, recipes, polls | yes | yes | yes |
| Add photo, voice story, recipe | no | yes | yes |
| Delete | no | own items | any |
| Vote and make polls (in a chat room they belong to) | yes | yes | yes |
| Close a poll | no | own polls | any |
| Approve a merge | no | no | yes |

Private group polls are invisible to family members who are not in that group.

## Duplicate hints

Run in the phone, over the family tree you can already see. Compares name (spelling tolerant, English or Tamil), birth year within 3 years, and native place.
Close relatives (parents, children, partner, brothers and sisters) are never flagged, because a son often shares his father's name.
One tap sends a merge request. Only an admin can approve it (`merge_persons`).

## PDF

Made on the phone. No server, no upload. Each page is painted by the browser (so Tamil letters are shaped correctly) and stored as a JPEG inside the PDF.
Trade off: text in the PDF cannot be searched or copied. On Android the PDF opens in the Share sheet (WhatsApp, Drive, Save, Print).

## Tests

* `npm run db:test` blocks 16h to 16l: album, voice, recipes, storage buckets, polls, AI limit, graph.
* `npm test`: duplicates, enhance, recorder, PDF writer, poster, story book, polls, recipes, restore function.
* `npm run e2e:heritage`: all screens in a phone browser with a fake microphone and a simulated Android bridge.
