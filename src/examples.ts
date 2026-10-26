import type { Mode } from './sim/types';

export interface Example {
  id: string;
  mode: Mode;
  title: { en: string; fa: string };
  note: { en: string; fa: string };
  code: string;
  render?: boolean;
  clicks?: number[];
  expected?: string[];
}

export const examples: Example[] = [
  {
    id: 'call-stack',
    mode: 'browser',
    title: { en: 'Call stack basics', fa: 'مبانی پشته‌ی فراخوانی' },
    note: {
      en: 'Every call pushes a frame; every return pops one. Nothing here is asynchronous.',
      fa: 'هر فراخوانی یک فریم روی پشته می‌گذارد و هر بازگشت آن را برمی‌دارد. هیچ بخشی از این کد ناهمگام نیست.',
    },
    code: `function multiply(a, b) {
  return a * b;
}

function square(n) {
  return multiply(n, n);
}

function printSquare(n) {
  const squared = square(n);
  console.log(squared);
}

printSquare(4);`,
    expected: ['16'],
  },
  {
    id: 'stack-trace',
    mode: 'browser',
    title: { en: 'An error unwinds the stack', fa: 'خطا و خالی شدن پشته' },
    note: {
      en: 'The error travels down through every frame. The last line never runs.',
      fa: 'خطا از همه‌ی فریم‌ها عبور می‌کند و پشته را خالی می‌کند. خط آخر هیچ‌وقت اجرا نمی‌شود.',
    },
    code: `function foo() {
  throw new Error('Oops!');
}

function bar() {
  foo();
}

function baz() {
  bar();
}

baz();
console.log('never printed');`,
    expected: ['Uncaught Error: Oops!'],
  },
  {
    id: 'stack-overflow',
    mode: 'browser',
    title: { en: 'Blowing the stack', fa: 'سرریز پشته' },
    note: {
      en: 'Recursion without a base case. The simulator stops at 50 frames; real engines allow thousands.',
      fa: 'بازگشت بدون شرط توقف. شبیه‌ساز در ۵۰ فریم متوقف می‌شود؛ موتورهای واقعی هزاران فریم اجازه می‌دهند.',
    },
    code: `function foo() {
  return foo();
}

foo();`,
    expected: ['Uncaught RangeError: Maximum call stack size exceeded'],
  },
  {
    id: 'blocking',
    mode: 'browser',
    render: true,
    title: { en: 'Blocking the stack', fa: 'بلاک شدن پشته' },
    note: {
      en: 'block(ms) simulates slow synchronous work. Watch the timer wait in the queue and the render stay blocked.',
      fa: 'تابع block یک کار همگامِ کُند را شبیه‌سازی می‌کند. ببین تایمر چطور در صف منتظر می‌ماند و رسم صفحه بلاک می‌شود.',
    },
    code: `console.log('start');

setTimeout(function timer() {
  console.log('timer fired');
}, 1000);

// 3 seconds of slow synchronous work
block(3000);

console.log('end');`,
    expected: ['start', 'end', 'timer fired'],
  },
  {
    id: 'set-timeout',
    mode: 'browser',
    title: { en: 'setTimeout, step by step', fa: 'قدم‌به‌قدم با setTimeout' },
    note: {
      en: 'The example from the talk: the browser counts the five seconds, not JavaScript.',
      fa: 'همان مثال سخنرانی: پنج ثانیه را مرورگر می‌شمارد، نه جاوااسکریپت.',
    },
    code: `console.log('Hi');

setTimeout(function cb() {
  console.log('there');
}, 5000);

console.log('JSConfEU');`,
    expected: ['Hi', 'JSConfEU', 'there'],
  },
  {
    id: 'timeout-zero',
    mode: 'browser',
    title: { en: 'setTimeout with zero delay', fa: 'تایمر با تأخیر صفر' },
    note: {
      en: 'Zero means “after the stack is clear”, not “right now”.',
      fa: 'صفر یعنی «بعد از خالی شدن پشته»، نه «همین الان».',
    },
    code: `console.log('Hi');

setTimeout(function cb() {
  console.log('there');
}, 0);

console.log('JSConfEU');`,
    expected: ['Hi', 'JSConfEU', 'there'],
  },
  {
    id: 'minimum-delay',
    mode: 'browser',
    title: { en: 'A delay is a minimum', fa: 'تأخیر تایمر حداقلی است' },
    note: {
      en: 'X is ready at 2 s but waits in the queue until Y releases the stack at 4 s.',
      fa: 'تایمر X در ثانیه‌ی ۲ آماده است، اما تا ثانیه‌ی ۴ که Y پشته را آزاد کند در صف منتظر می‌ماند.',
    },
    code: `console.log('1');

setTimeout(function x() {
  console.log('X');
}, 2000);

setTimeout(function y() {
  console.log('Y');
  block(3000);
}, 1000);

console.log('2');`,
    expected: ['1', '2', 'Y', 'X'],
  },
  {
    id: 'queue-order',
    mode: 'browser',
    title: { en: 'The queue is first come, first served', fa: 'صف به ترتیب ورود است' },
    note: {
      en: 'C is scheduled while E is already waiting, so C goes behind E.',
      fa: 'وقتی C زمان‌بندی می‌شود، E از قبل در صف است؛ پس C پشت E قرار می‌گیرد.',
    },
    code: `console.log('A');

setTimeout(function first() {
  console.log('B');
  setTimeout(function nested() {
    console.log('C');
  }, 0);
  console.log('D');
}, 0);

setTimeout(function second() {
  console.log('E');
}, 0);

console.log('F');`,
    expected: ['A', 'F', 'B', 'D', 'E', 'C'],
  },
  {
    id: 'promise-vs-timeout',
    mode: 'browser',
    title: { en: 'Promise versus setTimeout', fa: 'پرامیس در برابر تایمر' },
    note: {
      en: 'Microtasks always run before the next task, even if the task was queued first.',
      fa: 'میکروتسک‌ها همیشه قبل از تسک بعدی اجرا می‌شوند، حتی اگر تسک زودتر وارد صف شده باشد.',
    },
    code: `setTimeout(function timeout() {
  console.log('timeout');
}, 0);

Promise.resolve().then(function promise() {
  console.log('promise');
});

console.log('sync');`,
    expected: ['sync', 'promise', 'timeout'],
  },
  {
    id: 'mixed',
    mode: 'browser',
    title: { en: 'Tasks and microtasks together', fa: 'تسک‌ها و میکروتسک‌ها با هم' },
    note: {
      en: 'After every single task, the whole microtask queue is drained.',
      fa: 'بعد از هر تسک، کل صف میکروتسک‌ها خالی می‌شود.',
    },
    code: `console.log('1');

setTimeout(function t2() {
  console.log('2');
  Promise.resolve().then(function m3() {
    console.log('3');
  });
}, 0);

Promise.resolve().then(function m4() {
  console.log('4');
  setTimeout(function t5() {
    console.log('5');
  }, 0);
});

setTimeout(function t6() {
  console.log('6');
}, 0);

console.log('7');`,
    expected: ['1', '7', '4', '2', '3', '6', '5'],
  },
  {
    id: 'async-await',
    mode: 'browser',
    title: { en: 'async and await', fa: 'تابع async و await' },
    note: {
      en: 'At each await the function leaves the stack; its continuation comes back as a microtask.',
      fa: 'در هر await تابع از پشته خارج می‌شود و ادامه‌اش به‌صورت میکروتسک برمی‌گردد.',
    },
    code: `async function loadUser() {
  console.log('fetching…');
  const res = await fetch('/api/user');
  const user = await res.json();
  console.log('hello,', user.name);
}

loadUser();
console.log('the page stays responsive');`,
    expected: ['fetching…', 'the page stays responsive', 'hello, Ada Lovelace'],
  },
  {
    id: 'render',
    mode: 'browser',
    render: true,
    title: { en: 'Give the render a chance', fa: 'به رسم صفحه فرصت بده' },
    note: {
      en: 'The synchronous loop holds the stack for 400 ms. The async version lets a frame paint between items.',
      fa: 'حلقه‌ی همگام ۴۰۰ میلی‌ثانیه پشته را نگه می‌دارد. نسخه‌ی ناهمگام بین هر مورد اجازه‌ی رسم یک فریم را می‌دهد.',
    },
    code: `function asyncForEach(array, cb) {
  array.forEach(function (item) {
    setTimeout(function () {
      cb(item);
    }, 0);
  });
}

// Synchronous: rendering is blocked for 4 × 100 ms
[1, 2, 3, 4].forEach(function process(i) {
  block(100);
});

// Asynchronous: a frame can paint between items
asyncForEach([1, 2, 3, 4], function processAsync(i) {
  block(100);
});`,
  },
  {
    id: 'raf',
    mode: 'browser',
    render: true,
    title: { en: 'requestAnimationFrame', fa: 'زمان‌بندی با requestAnimationFrame' },
    note: {
      en: 'Animation callbacks run right before a paint, after tasks and microtasks.',
      fa: 'کال‌بک‌های انیمیشن درست قبل از رسم صفحه اجرا می‌شوند؛ بعد از تسک‌ها و میکروتسک‌ها.',
    },
    code: `requestAnimationFrame(function frame() {
  console.log('animation frame');
});

setTimeout(function timeout() {
  console.log('timeout');
}, 0);

Promise.resolve().then(function micro() {
  console.log('microtask');
});`,
    expected: ['microtask', 'timeout', 'animation frame'],
  },
  {
    id: 'clicks',
    mode: 'browser',
    clicks: [300, 350, 400],
    title: { en: 'Clicks wait in line too', fa: 'کلیک‌ها هم صف می‌کشند' },
    note: {
      en: 'Three quick clicks are simulated. Each handler is a task, so they run one at a time.',
      fa: 'سه کلیک سریع شبیه‌سازی می‌شود. هر شنونده یک تسک است، پس یکی‌یکی اجرا می‌شوند.',
    },
    code: `button.addEventListener('click', function onClick() {
  console.log('clicked!');
  block(200);
});

console.log('listening for clicks…');`,
    expected: ['listening for clicks…', 'clicked!', 'clicked!', 'clicked!'],
  },
  {
    id: 'sync-click',
    mode: 'browser',
    title: { en: 'button.click() is synchronous', fa: 'فراخوانی click همگام است' },
    note: {
      en: 'Dispatching an event from code runs its listeners immediately, on the current stack.',
      fa: 'وقتی رویداد را از داخل کد صدا بزنی، شنونده‌ها همان لحظه و روی همین پشته اجرا می‌شوند.',
    },
    code: `button.addEventListener('click', function onClick() {
  console.log('listener');
});

console.log('before');
button.click();
console.log('after');`,
    expected: ['before', 'listener', 'after'],
  },
  {
    id: 'debounce',
    mode: 'browser',
    clicks: [100, 200, 300, 400, 1200],
    title: { en: 'Debounce in action', fa: 'دیبانس در عمل' },
    note: {
      en: 'Five clicks, two searches: each click cancels the previous timer.',
      fa: 'پنج کلیک و فقط دو جست‌وجو: هر کلیک تایمر قبلی را لغو می‌کند.',
    },
    code: `function debounce(fn, wait) {
  let timerId;
  return function debounced() {
    clearTimeout(timerId);
    timerId = setTimeout(fn, wait);
  };
}

const search = debounce(function runSearch() {
  console.log('search request sent');
}, 300);

button.addEventListener('click', search);`,
    expected: ['search request sent', 'search request sent'],
  },
  {
    id: 'starvation',
    mode: 'browser',
    render: true,
    title: { en: 'Microtasks can starve the loop', fa: 'میکروتسک‌ها می‌توانند حلقه را گرسنه بگذارند' },
    note: {
      en: 'Thirty chained microtasks run before the timer, with no chance to render. Remove the limit and the page freezes.',
      fa: 'سی میکروتسک زنجیره‌ای قبل از تایمر اجرا می‌شوند و فرصتی برای رسم نمی‌ماند. اگر محدودیت را برداری صفحه یخ می‌زند.',
    },
    code: `let count = 0;

function loop() {
  count++;
  if (count < 30) {
    Promise.resolve().then(loop);
  }
}

setTimeout(function timer() {
  console.log('timer runs at last, count =', count);
}, 0);

loop();`,
    expected: ['timer runs at last, count = 30'],
  },
  {
    id: 'node-order',
    mode: 'node',
    title: { en: 'Node: who goes first?', fa: 'نود: چه کسی اول اجرا می‌شود؟' },
    note: {
      en: 'nextTick beats promises; both beat the loop phases. Outside I/O, timeout versus immediate can vary in real Node.',
      fa: 'صف nextTick از پرامیس‌ها جلوتر است و هر دو قبل از فازهای حلقه اجرا می‌شوند. بیرون از ورودی‌خروجی، ترتیب timeout و immediate در نود واقعی می‌تواند فرق کند.',
    },
    code: `setTimeout(() => console.log('timeout'), 0);
setImmediate(() => console.log('immediate'));
process.nextTick(() => console.log('nextTick'));
Promise.resolve().then(() => console.log('promise'));
console.log('sync');`,
    expected: ['sync', 'nextTick', 'promise', 'timeout', 'immediate'],
  },
  {
    id: 'node-io',
    mode: 'node',
    title: { en: 'Node: inside an I/O callback', fa: 'نود: داخل کال‌بک ورودی‌خروجی' },
    note: {
      en: 'After the poll phase comes check, so setImmediate always wins here.',
      fa: 'بعد از فاز poll نوبت check است؛ پس اینجا setImmediate همیشه جلوتر است.',
    },
    code: `const fs = require('fs');

fs.readFile('data.txt', function onRead() {
  setTimeout(() => console.log('timeout'), 0);
  setImmediate(() => console.log('immediate'));
});`,
    expected: ['immediate', 'timeout'],
  },
  {
    id: 'node-ticks',
    mode: 'node',
    title: { en: 'Node: nextTick inside a promise', fa: 'نود: nextTick داخل پرامیس' },
    note: {
      en: 'Ticks scheduled by a promise callback wait until the promise queue is empty.',
      fa: 'تیکی که داخل کال‌بک پرامیس ثبت شود، تا خالی شدن صف پرامیس‌ها منتظر می‌ماند.',
    },
    code: `Promise.resolve()
  .then(() => {
    console.log('promise 1');
    process.nextTick(() => console.log('tick from promise'));
  })
  .then(() => console.log('promise 2'));

process.nextTick(() => console.log('tick 1'));`,
    expected: ['tick 1', 'promise 1', 'promise 2', 'tick from promise'],
  },
  {
    id: 'node-phases',
    mode: 'node',
    title: { en: 'Node: a tour of the phases', fa: 'نود: گشتی در فازها' },
    note: {
      en: 'Timers, poll and check, each in its own turn of the loop.',
      fa: 'تایمرها، poll و check؛ هر کدام در نوبت خودشان از حلقه.',
    },
    code: `const fs = require('fs');

setTimeout(function timerA() {
  console.log('timers: A');
}, 10);

fs.readFile('config.json', function onConfig() {
  console.log('poll: config loaded');
  setImmediate(function afterIO() {
    console.log('check: after I/O');
  });
});

setImmediate(function first() {
  console.log('check: first');
});

console.log('main script done');`,
    expected: ['main script done', 'check: first', 'timers: A', 'poll: config loaded', 'check: after I/O'],
  },
  {
    id: 'node-sync-io',
    mode: 'node',
    title: { en: 'Node: readFileSync blocks', fa: 'نود: readFileSync بلاک می‌کند' },
    note: {
      en: 'The timer expires during the synchronous read but has to wait for it to finish.',
      fa: 'تایمر وسط خواندن همگام منقضی می‌شود، اما باید تا پایان آن صبر کند.',
    },
    code: `const fs = require('fs');

setTimeout(() => console.log('timer (10 ms)'), 10);

const data = fs.readFileSync('big.json'); // blocks for 50 ms
console.log('sync read done');`,
    expected: ['sync read done', 'timer (10 ms)'],
  },
];

export const defaultExample = (mode: Mode) => examples.find((e) => e.mode === mode)!;
