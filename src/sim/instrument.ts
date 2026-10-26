import { parse } from 'acorn';
import { generate } from 'astring';

/* Rewrites user code so the runtime can observe it:
   - every function pushes/pops a frame (enter/exit)
   - async functions become generators driven by __rt.runAsync (so `await` is visible)
   - statements report their line (at), loops report iterations (tick)
   - function expressions get a readable label (fn) */

export class CompileError extends Error {
  constructor(message: string, public line?: number, public column?: number) {
    super(message);
  }
}

type Node = any;

const id = (name: string): Node => ({ type: 'Identifier', name });
const lit = (value: string | number): Node => ({ type: 'Literal', value });
const block = (body: Node[]): Node => ({ type: 'BlockStatement', body });
const stmt = (expression: Node): Node => ({ type: 'ExpressionStatement', expression });
const rt = (name: string, args: Node[]): Node => ({
  type: 'CallExpression',
  optional: false,
  callee: { type: 'MemberExpression', object: id('__rt'), property: id(name), computed: false, optional: false },
  arguments: args,
});

const shorten = (s: string, n = 34) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

export function instrument(source: string): string {
  let ast: Node;
  try {
    ast = parse(source, { ecmaVersion: 'latest', sourceType: 'script', locations: true });
  } catch (e: any) {
    let msg = String(e.message).replace(/\s*\(\d+:\d+\)$/, '');
    const lineText = e.loc ? source.split('\n')[e.loc.line - 1] ?? '' : '';
    if (/\bawait\b/.test(lineText)) msg += ' — top-level await is not supported; wrap the code in an async function';
    throw new CompileError(msg, e.loc?.line, e.loc?.column);
  }
  visit(ast, null, source);
  return generate(ast);
}

function visit(node: Node, parent: Node, src: string): Node {
  if (!node || typeof node.type !== 'string') return node;
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end') continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        if (value[i] && typeof value[i].type === 'string') value[i] = visit(value[i], node, src);
      }
    } else if (value && typeof value.type === 'string') {
      node[key] = visit(value, node, src);
    }
  }
  return transform(node, parent, src);
}

function transform(node: Node, parent: Node, src: string): Node {
  switch (node.type) {
    case 'Program':
    case 'BlockStatement':
      node.body = markLines(node.body);
      return node;
    case 'SwitchCase':
      node.consequent = markLines(node.consequent);
      return node;
    case 'ForOfStatement':
      if (node.await) throw new CompileError('for await…of is not supported by the simulator', node.loc.start.line);
      node.body = withTick(node.body);
      return node;
    case 'ForStatement':
    case 'ForInStatement':
    case 'WhileStatement':
    case 'DoWhileStatement':
      node.body = withTick(node.body);
      return node;
    case 'AwaitExpression':
      return { type: 'YieldExpression', argument: node.argument, delegate: false };
    case 'FunctionDeclaration':
    case 'FunctionExpression':
    case 'ArrowFunctionExpression':
      return transformFunction(node, parent, src);
    default:
      return node;
  }
}

function markLines(list: Node[]): Node[] {
  const out: Node[] = [];
  for (const s of list) {
    if (s.loc && !s.directive && s.type !== 'FunctionDeclaration' && s.type !== 'EmptyStatement') {
      out.push(stmt(rt('at', [lit(s.loc.start.line)])));
    }
    out.push(s);
  }
  return out;
}

function withTick(body: Node): Node {
  const b = body.type === 'BlockStatement' ? body : block([body]);
  b.body.unshift(stmt(rt('tick', [])));
  return b;
}

function keyName(prop: Node, src: string): string {
  if (!prop.computed && prop.key.type === 'Identifier') return prop.key.name;
  return src.slice(prop.key.start, prop.key.end);
}

function functionLabel(node: Node, parent: Node, src: string): string {
  if (node.id?.name) return node.id.name;
  if (parent) {
    if (parent.type === 'VariableDeclarator' && parent.init === node && parent.id.type === 'Identifier') return parent.id.name;
    if (parent.type === 'AssignmentExpression' && parent.right === node) return src.slice(parent.left.start, parent.left.end);
    if ((parent.type === 'Property' || parent.type === 'MethodDefinition' || parent.type === 'PropertyDefinition') && parent.value === node) {
      return keyName(parent, src);
    }
  }
  const text = src.slice(node.start, node.end).replace(/\s+/g, ' ');
  if (node.body?.type === 'BlockStatement' && typeof node.body.start === 'number') {
    return shorten(src.slice(node.start, node.body.start).replace(/\s+/g, ' ').trim() + ' {…}');
  }
  return shorten(text);
}

function transformFunction(node: Node, parent: Node, src: string): Node {
  if (node.async && node.generator) {
    throw new CompileError('async generators are not supported by the simulator', node.loc.start.line);
  }
  const label = functionLabel(node, parent, src);
  const line = node.loc.start.line;

  if (!node.generator) {
    const body = node.body.type === 'BlockStatement' ? node.body : block([{ type: 'ReturnStatement', argument: node.body }]);
    if (node.async) {
      const gen = { type: 'FunctionExpression', id: null, params: [], body, generator: true, async: false, expression: false };
      node.body = block([{ type: 'ReturnStatement', argument: rt('runAsync', [gen, { type: 'ThisExpression' }, lit(label), lit(line)]) }]);
      node.async = false;
    } else {
      node.body = block([
        stmt(rt('enter', [lit(label), lit(line)])),
        { type: 'TryStatement', block: body, handler: null, finalizer: block([stmt(rt('exit', []))]) },
      ]);
    }
    node.expression = false;
  }

  const isMethodValue =
    parent &&
    ((parent.type === 'Property' && (parent.method || parent.kind !== 'init')) || parent.type === 'MethodDefinition');
  if (node.type !== 'FunctionDeclaration' && !isMethodValue) return rt('fn', [node, lit(label)]);
  return node;
}
