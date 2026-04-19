import React, { useRef, useEffect } from 'react';
import Editor, { Monaco } from '@monaco-editor/react';

const DSL_LANGUAGE_ID = 'opcua-sim';

function registerLanguage(monaco: Monaco) {
  // Avoid double-registration
  if (monaco.languages.getLanguages().some((l: any) => l.id === DSL_LANGUAGE_ID)) return;

  monaco.languages.register({ id: DSL_LANGUAGE_ID });

  monaco.languages.setMonarchTokensProvider(DSL_LANGUAGE_ID, {
    keywords: ['ALWAYS', 'ONSTART', 'ONCE', 'INVOQUE', 'IF', 'THEN', 'SLEEP', 'each', 'EVERY', 'STOP_SCRIPT'],
    tokenizer: {
      root: [
        // Comments
        [/\/\/.*$/, 'comment'],
        [/#.*$/, 'comment'],
        [/--.*$/, 'comment'],

        // Block keywords
        [/\b(ALWAYS|ONSTART|ONCE)\b/, 'keyword.block'],

        // Stop keyword — prominent red
        [/\bSTOP_SCRIPT\b/, 'keyword.stop'],

        // Statement keywords
        [/\b(INVOQUE|IF|THEN|SLEEP)\b/, 'keyword.statement'],

        // Interval keywords
        [/\b(each|EVERY)\b/i, 'keyword.interval'],

        // Time literals: 10s, 500ms, 2m
        [/\d+\s*(ms|s|m)\b/, 'number.time'],

        // Strings
        [/"[^"]*"/, 'string'],
        [/'[^']*'/, 'string'],

        // Numbers (including signed +N / -N)
        [/[+\-]?\d+(\.\d+)?/, 'number'],

        // Double-equals operator (must come before single =)
        [/==/, 'operator.compare'],

        // Other operators
        [/[=+\-*\/(){}]/, 'operator'],

        // Identifiers (tag names, variable names, command names)
        [/[A-Za-z_]\w*/, 'identifier'],
      ],
    },
  } as any);

  monaco.editor.defineTheme('opcua-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'keyword.block',    foreground: '0550ae', fontStyle: 'bold' },
      { token: 'keyword.statement',foreground: '8250df', fontStyle: 'bold' },
      { token: 'keyword.interval', foreground: 'cf222e', fontStyle: 'italic' },
      { token: 'keyword.stop',     foreground: 'ff0000', fontStyle: 'bold' },
      { token: 'number.time',      foreground: '116329' },
      { token: 'number',           foreground: '116329' },
      { token: 'string',           foreground: '0a3069' },
      { token: 'identifier',       foreground: '24292f' },
      { token: 'operator',         foreground: '6e7781' },
      { token: 'operator.compare', foreground: 'cf222e', fontStyle: 'bold' },
      { token: 'comment',          foreground: '6e7781', fontStyle: 'italic' },
    ],
    colors: {
      'editor.background': '#f6f8fa',
      'editor.lineHighlightBackground': '#eef1f4',
    },
  });

  // Auto-completion
  monaco.languages.registerCompletionItemProvider(DSL_LANGUAGE_ID, {
    provideCompletionItems: (model: any, position: any) => {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      const snippets = [
        {
          label: 'ALWAYS',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: 'ALWAYS {\n\t${1:TAGNAME} = ${2:value} each ${3:10s}\n}',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Run statements repeatedly at defined intervals',
          range,
        },
        {
          label: 'ONSTART',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: 'ONSTART {\n\t${1:TAGNAME} = ${2:value}\n}',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Run statements once at script start',
          range,
        },
        {
          label: 'ONCE',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: 'ONCE {\n\t${1:TAGNAME} = ${2:value}\n}',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Run statements once after ONSTART',
          range,
        },
        {
          label: 'INVOQUE',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: 'INVOQUE ${1:COMMAND}(${2:args})',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Invoke an OPC UA command/method',
          range,
        },
        {
          label: 'IF...THEN (write tag)',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: 'IF ${1:VAR} == ${2:value} THEN ${3:TAGNAME} = ${4:value}',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Conditional tag write',
          range,
        },
        {
          label: 'IF...THEN STOP_SCRIPT',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: 'IF ${1:VAR} == ${2:value} THEN STOP_SCRIPT',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Stop the script when a condition is met',
          range,
        },
        {
          label: 'TAG increment (ALWAYS)',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: '${1:TAGNAME} = +${2:1} every ${3:10s}',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Increment a tag by a fixed amount on each tick',
          range,
        },
        {
          label: 'TAG expression',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: '${1:TAG_C} = ${2:TAG_A} + ${3:TAG_B}',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Write the sum of two tags (resolved at runtime)',
          range,
        },
        {
          label: 'SLEEP',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: 'SLEEP ${1:1000}',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Pause execution (milliseconds)',
          range,
        },
      ];
      return { suggestions: snippets };
    },
  });
}

const DEFAULT_SCRIPT = `// OPC UA Simulator Script
// Use ALWAYS for repeating actions, ONSTART for startup, ONCE for one-time setup.

ALWAYS {
  // TAG_A = 100 every 10s           set TAG_A to 100 every 10 seconds
  // TAG_B = +10 every 20s           increment TAG_B by 10 every 20 seconds
  // INVOQUE CMD_A(1, 2) every 30s   invoke command every 30 seconds
}

ONSTART {
  // RESPONSE = CMD_A(100, 200)      call command, capture result
  // IF RESPONSE == 0 THEN TAG_A = 200
  // IF RESPONSE == "OK" THEN STOP_SCRIPT
  // TAG_C = TAG_A + TAG_B           write sum of two tags
  // SLEEP 1000                      pause 1000ms
}

ONCE {
  // TAG_C = "initial value"
}
`;

interface Props {
  value: string;
  onChange: (val: string) => void;
}

export default function ScriptEditor({ value, onChange }: Props) {
  const monacoRef = useRef<Monaco | null>(null);

  const handleMount = (_editor: any, monaco: Monaco) => {
    monacoRef.current = monaco;
    registerLanguage(monaco);
    monaco.editor.setTheme('opcua-light');
  };

  return (
    <div style={{ border: '1px solid #d9d9d9', borderRadius: 6, overflow: 'hidden' }}>
      <Editor
        height="420px"
        language={DSL_LANGUAGE_ID}
        value={value || DEFAULT_SCRIPT}
        onChange={(v) => onChange(v || '')}
        onMount={handleMount}
        options={{
          fontSize: 14,
          lineNumbers: 'on',
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          folding: true,
          tabSize: 2,
          automaticLayout: true,
          suggestOnTriggerCharacters: true,
        }}
      />
    </div>
  );
}

export { DEFAULT_SCRIPT };
