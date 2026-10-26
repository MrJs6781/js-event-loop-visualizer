# Event Loop Lab · آزمایشگاه ایونت لوپ

A step-by-step visual simulator of the JavaScript event loop, in English and Persian.
It goes beyond Loupe: separate task and microtask queues, `async`/`await`, rendering and
`requestAnimationFrame`, simulated clicks, a Node.js mode with its loop phases, and you can
step backwards as well as forwards.

شبیه‌ساز تصویری و قدم‌به‌قدم ایونت لوپ جاوااسکریپت، به دو زبان فارسی و انگلیسی.

## Run locally · اجرا روی سیستم خودت

```bash
npm install
npm run dev        # http://localhost:5173
npm run test:sim   # checks every example's console output against the expected order
npm run build      # type-check + production build into dist/
```

## Deploy to Vercel · انتشار روی ورسل

**With GitHub (recommended) · از طریق گیت‌هاب (پیشنهادی):**

1. Push this folder to a new GitHub repository.
   این پوشه را در یک مخزن جدید گیت‌هاب قرار بده.
2. On vercel.com choose **Add New → Project** and import the repository.
   در سایت ورسل گزینه‌ی Add New و سپس Project را بزن و مخزن را انتخاب کن.
3. Vercel detects Vite automatically (settings are also in `vercel.json`). Press **Deploy**.
   ورسل خودش تشخیص می‌دهد که پروژه با Vite ساخته شده است. فقط Deploy را بزن.

Every later `git push` redeploys the site. · با هر push بعدی، سایت خودکار به‌روز می‌شود.

**With the CLI · از طریق خط فرمان:**

```bash
npm i -g vercel
vercel          # preview deployment
vercel --prod   # production deployment
```

## How it works · نحوه‌ی کار

Loupe ran your code for real and slowed it down. This project **simulates** it instead:

1. `src/sim/instrument.ts` parses the code with **acorn** and rewrites it with **astring**:
   every function reports when it enters and leaves the stack, every statement reports its line,
   loops report iterations, and `async` functions become generators so each `await` is visible.
2. `src/sim/runtime.ts` runs the rewritten code inside a **Web Worker** with its own event loop
   on a **virtual clock**. `setTimeout`, `fetch`, `Promise`, `process.nextTick`, `setImmediate`,
   `fs.readFile` and click events are all re-implemented so their callbacks travel through the
   simulator's queues. Every change is recorded as a snapshot.
3. The React app plays the snapshots back. Because the whole trace exists up front, you can
   scrub, step back and jump anywhere. Tokens keep the same id as they move from Web APIs to a
   queue to the stack, so Framer Motion animates the journey.

Safety nets: loops stop after two million iterations, traces stop after 4,000 steps,
the stack stops at 50 frames, and the worker is killed after six seconds.

### Modelling choices · فرض‌های شبیه‌ساز

- `block(ms)` stands in for slow synchronous work. Busy-wait loops on `Date.now()` also work.
- A zero-delay browser timer joins the task queue immediately; Node clamps timers to 1 ms.
- In Node, the loop is assumed to start 1 ms after the main module, so a top-level
  `setTimeout(…, 0)` beats `setImmediate`. Real Node can go either way there.
- The browser paints at most every 16.7 ms of virtual time, only with an empty stack,
  and skips paints while idle.
- Supported: the language itself, timers, promises, `async`/`await`, `fetch` (fake JSON),
  clicks on `button`/`document`/`window`, `requestAnimationFrame`, `process.nextTick`,
  `setImmediate`, `fs.readFile`/`readFileSync`. Not supported: top-level `await`,
  `for await`, async generators, real DOM or network access.

## Project layout · ساختار پروژه

```
src/
  sim/            instrument.ts, runtime.ts (event loop + Promise), worker.ts, runner.ts, types.ts
  components/     Visualizer (stack, queues, Web APIs, console), LoopRing, CodeEditor, Chrome (header, settings, timeline)
  i18n/           strings.ts (all English and Persian text), I18nProvider.tsx
  lib/share.ts    shareable links (code compressed into the URL hash)
  examples.ts     preset examples with their expected output
scripts/sim-check.ts   verifies the examples
```

To add an example, append an entry to `src/examples.ts` (with `expected` output) and run
`npm run test:sim`. To add UI text, add the key to both dictionaries in `src/i18n/strings.ts`.

Inspired by Philip Roberts’ Loupe and his JSConf EU talk “What the heck is the event loop anyway?”.
