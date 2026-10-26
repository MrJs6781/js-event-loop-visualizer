import { simulate } from '../src/sim/runtime';
import { examples } from '../src/examples';

let failed = 0;
for (const ex of examples) {
  const res = simulate(ex.code, { mode: ex.mode, render: !!ex.render, clicks: ex.clicks ?? [] });
  const out = res.logs.map((l) => l.text);
  const ok = !ex.expected || JSON.stringify(out) === JSON.stringify(ex.expected);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${ex.id.padEnd(18)} steps=${String(res.steps.length).padStart(4)} ${res.aborted ?? ''} ${res.error?.message ?? ''}`);
  if (!ok) console.log('   got:', out, '\n   exp:', ex.expected);
}
process.exit(failed ? 1 : 0);
