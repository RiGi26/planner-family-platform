# Masume 升目

*Masume* are the ruled squares on Japanese manuscript paper — the cells you write
into, one character per box.

A JLPT certification planner for three people in one family. The name is the app's
core primitive: every screen is built from the same grid of cells, filling with ink.

Every language app answers *how do I memorise this*. None of them answer **what do I
have to do today so that I pass on the sixth of December**. That second question is
the whole point of this one: it counts backwards from the exam date to a daily quota,
then runs that quota through a single FSRS engine.

The study app is the machine. The planner is the brain.

## What makes it different

**Progress is never a bar.** It is a sheet of 原稿用紙 cells that fills with ink. Thirty-eight
empty cells read as work left to do; "39%" reads as nothing at all. The same primitive
draws the daily quota, the streak, the answer-length hint in recall, the loading
screen, and the Kana Sheet.

**The numbers are honest.** When the pace needed to hit a target has drifted past what
you agreed to, the app says so and offers to move the exam date — presented as an
equal choice, not as a defeat. A planner that inflates the quota to keep you
motivated is a planner that lies.

**Writing rates itself.** Three of the four card modes ask you to grade your own
recall. The writing mode does not: the rating comes from how many strokes came out
wrong, which makes it the one mode you cannot fool.

**The Kana Sheet starts empty.** A gojūon grid with axis labels and nothing else. You
derive か from "row k, column a" yourself, and what fills the cell is your own
handwriting — not a printed glyph. After a few weeks you have a complete chart in
your own hand, and you can watch ね change from week one to week six.

## Stack

| | |
|---|---|
| Framework | Next.js 15 App Router, `output: 'export'` |
| Backend | Supabase — Postgres, Auth, RLS |
| Scheduling | ts-fsrs 5.4.1 |
| Offline | Dexie (IndexedDB) + Serwist service worker |
| Writing | hanzi-writer with Japanese stroke data |
| Styling | Tailwind v4 |

Static export is load-bearing rather than incidental: one build serves Vercel today
and drops into a Capacitor WebView later without a rewrite. It also means there is no
server tier at all — every read and write goes through the client, so **RLS is the
only security boundary** and every table has an explicit policy.

## Running it

```bash
npm install
cp .env.example .env.local   # then fill in your Supabase project's URL and anon key
npm run dev
```

The anon key is public by design and safe in the bundle. The service role key is not,
and must never appear outside a Supabase Edge Function.

Apply the migrations in `supabase/migrations/` in order, then create the accounts from
the Supabase dashboard (Authentication → Users → Add user). There is no signup page,
and so no unintended way in.

Two dashboard settings matter, both under Authentication → Sessions: **Time-box user
sessions** and **Inactivity timeout** must stay empty. They are the only things that
can cancel "log in once and stay logged in".

```bash
npm run kana      # regenerate src/data/kana.json (208 kana)
npm run strokes   # extract stroke data for the characters actually used
npm test          # unit tests
npm run typecheck
```

## Licence

Application code: MIT, see [LICENSE](LICENSE).

Datasets under `src/data/`: CC BY-SA 4.0, with attribution and full upstream licence
texts in [NOTICE](NOTICE) and `licenses/`.
