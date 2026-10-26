import { useEffect, useMemo, useState } from 'react';
import CodeMirror, { EditorView } from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, type DecorationSet } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';

type Mark = { line: number | null; kind: 'step' | 'error' };

const setMark = StateEffect.define<Mark>();

const markField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    let next = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (!e.is(setMark)) continue;
      const { line, kind } = e.value;
      if (line == null || line < 1 || line > tr.state.doc.lines) next = Decoration.none;
      else next = Decoration.set([Decoration.line({ class: kind === 'error' ? 'cm-error-line' : 'cm-step-line' }).range(tr.state.doc.line(line).from)]);
    }
    return next;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const theme = EditorView.theme({
  '&': { backgroundColor: 'transparent', color: 'rgb(var(--ink))', fontSize: '13.5px', height: '100%' },
  '.cm-scroller': { fontFamily: '"JetBrains Mono", ui-monospace, monospace', lineHeight: '1.65' },
  '.cm-content': { caretColor: 'rgb(var(--lane-stack))', padding: '10px 0' },
  '.cm-gutters': { backgroundColor: 'transparent', border: 'none', color: 'rgb(var(--muted) / 0.7)' },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 10px 0 12px' },
  '&.cm-focused': { outline: 'none' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': { backgroundColor: 'rgb(var(--lane-stack) / 0.22) !important' },
  '.cm-cursor': { borderLeftColor: 'rgb(var(--lane-stack))', borderLeftWidth: '2px' },
  '.cm-matchingBracket': { backgroundColor: 'rgb(var(--lane-api) / 0.2)', outline: 'none' },
});

const highlight = HighlightStyle.define([
  { tag: [tags.keyword, tags.controlKeyword, tags.moduleKeyword, tags.operatorKeyword], color: 'rgb(var(--lane-micro))' },
  { tag: [tags.string, tags.special(tags.string)], color: 'rgb(var(--lane-task))' },
  { tag: [tags.number, tags.bool, tags.null], color: 'rgb(var(--lane-api))' },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: 'rgb(var(--muted))', fontStyle: 'italic' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: 'rgb(var(--lane-stack))' },
  { tag: tags.definition(tags.function(tags.variableName)), color: 'rgb(var(--lane-stack))', fontWeight: '600' },
  { tag: tags.propertyName, color: 'rgb(var(--ink) / 0.85)' },
]);

interface Props {
  value: string;
  onChange: (v: string) => void;
  stepLine: number | null;
  errorLine: number | null;
  label: string;
}

export function CodeEditor({ value, onChange, stepLine, errorLine, label }: Props) {
  const [view, setView] = useState<EditorView | null>(null);
  const extensions = useMemo(
    () => [javascript(), markField, theme, syntaxHighlighting(highlight), EditorView.lineWrapping, EditorView.contentAttributes.of({ 'aria-label': label })],
    [label],
  );

  useEffect(() => {
    if (!view) return;
    const line = errorLine ?? stepLine;
    const kind = errorLine != null ? 'error' : 'step';
    const effects: StateEffect<unknown>[] = [setMark.of({ line, kind })];
    if (line != null && line >= 1 && line <= view.state.doc.lines) {
      effects.push(EditorView.scrollIntoView(view.state.doc.line(line).from, { y: 'nearest' }));
    }
    view.dispatch({ effects });
  }, [view, stepLine, errorLine, value]);

  return (
    <div dir="ltr" className="scroll-thin h-full overflow-hidden">
      <CodeMirror
        value={value}
        onChange={onChange}
        onCreateEditor={(v) => setView(v)}
        extensions={extensions}
        theme="none"
        height="100%"
        style={{ height: '100%' }}
        basicSetup={{
          foldGutter: false,
          highlightActiveLine: false,
          highlightActiveLineGutter: false,
          autocompletion: false,
          searchKeymap: false,
        }}
      />
    </div>
  );
}
