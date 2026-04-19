import React, { useRef } from 'react';
import Editor, { Monaco } from '@monaco-editor/react';

const DSL_LANGUAGE_ID = 'opcua-sim';

function registerLanguage(monaco: Monaco) {
  if (monaco.languages.getLanguages().some((l: any) => l.id === DSL_LANGUAGE_ID)) return;

  monaco.languages.register({ id: DSL_LANGUAGE_ID });

  monaco.languages.setMonarchTokensProvider(DSL_LANGUAGE_ID, {
    tokenizer: {
      root: [
        [/\/\/.*$/, 'comment'],

        [/\bSTOP\s+SIMULATION\b/, 'keyword.stop'],
        [/\bRESET\b/, 'keyword.reset'],
        [/\bIF\b|\bTHEN\b|\bSLEEP\b|\bEVERY\b/i, 'keyword.statement'],

        // [Name]( — command call
        [/\[[^\]]+\](?=\s*\()/, 'identifier.command'],
        // [Name] — tag reference
        [/\[[^\]]+\]/, 'identifier.tag'],

        [/"[^"]*"|'[^']*'/, 'string'],
        [/\b(true|false)\b/, 'keyword.bool'],
        [/\d+\s*ms\b/, 'number.time'],
        [/\d+(\.\d+)?/, 'number'],

        [/==|!=|>=|<=|>|</, 'operator.compare'],
        [/\+=|-=/, 'operator.assign'],
        [/[=+\-*\/(){};,]/, 'operator'],

        [/[A-Za-z_]\w*/, 'identifier'],
      ],
    },
  } as any);

  monaco.editor.defineTheme('opcua-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'keyword.stop',      foreground: 'cf222e', fontStyle: 'bold' },
      { token: 'keyword.reset',     foreground: 'cf222e', fontStyle: 'bold' },
      { token: 'keyword.statement', foreground: '8250df', fontStyle: 'bold' },
      { token: 'keyword.bool',      foreground: '0550ae' },
      { token: 'identifier.tag',    foreground: '0550ae', fontStyle: 'bold' },
      { token: 'identifier.command',foreground: '8250df', fontStyle: 'bold' },
      { token: 'number.time',       foreground: '116329' },
      { token: 'number',            foreground: '116329' },
      { token: 'string',            foreground: '0a3069' },
      { token: 'identifier',        foreground: '24292f' },
      { token: 'operator',          foreground: '6e7781' },
      { token: 'operator.compare',  foreground: 'cf222e', fontStyle: 'bold' },
      { token: 'operator.assign',   foreground: 'cf222e' },
      { token: 'comment',           foreground: '6e7781', fontStyle: 'italic' },
    ],
    colors: {
      'editor.background': '#f6f8fa',
      'editor.lineHighlightBackground': '#eef1f4',
    },
  });

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
          label: 'TAG_WRITE',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: '[${1:TagName}] = ${2:value}',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Write a value to a tag',
          range,
        },
        {
          label: 'TAG_INCREMENT',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: '[${1:TagName}] += ${2:1}',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Increment a tag value',
          range,
        },
        {
          label: 'TAG_INTERVAL',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: '[${1:TagName}] = ${2:value} EVERY ${3:1000}ms',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Write a value to a tag on a repeating interval',
          range,
        },
        {
          label: 'TAG_INCREMENT_INTERVAL',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: '[${1:TagName}] += ${2:1} EVERY ${3:1000}ms',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Increment a tag on a repeating interval',
          range,
        },
        {
          label: 'TAG_ROTATE',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: '[${1:TagName}] = (${2:100,200,300}) EVERY ${3:1000}ms',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Rotate through a list of values on an interval',
          range,
        },
        {
          label: 'VAR_ASSIGN',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: '${1:myVar} = [${2:TagName}]',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Read a tag value into a variable',
          range,
        },
        {
          label: 'CMD_INVOKE',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: '[${1:CmdName}](${2:args})',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Invoke a command',
          range,
        },
        {
          label: 'CMD_ASSIGN',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: '${1:myVar} = [${2:CmdName}](${3:args})',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Invoke a command and store the result',
          range,
        },
        {
          label: 'CMD_INTERVAL',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: '[${1:CmdName}](${2:args}) EVERY ${3:1000}ms',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Invoke a command on a repeating interval',
          range,
        },
        {
          label: 'IF_THEN',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: 'IF [${1:TagName}] == ${2:value} THEN [${3:TagName}] = ${4:value}',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Conditional tag write',
          range,
        },
        {
          label: 'IF_THEN_BLOCK',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: 'IF [${1:TagName}] == ${2:value} THEN { [${3:TagName}] = ${4:value}; [${5:TagName}] = ${6:value} }',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Conditional with multiple statements',
          range,
        },
        {
          label: 'IF_STOP',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: 'IF [${1:TagName}] == ${2:value} THEN STOP SIMULATION',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Stop the simulation when condition is met',
          range,
        },
        {
          label: 'RESET',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: 'RESET [${1:TagName}]',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Stop the active interval for a tag or command',
          range,
        },
        {
          label: 'SLEEP',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: 'SLEEP ${1:1000}',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Pause execution for N milliseconds',
          range,
        },
        {
          label: 'STOP SIMULATION',
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: 'STOP SIMULATION',
          documentation: 'Stop the running script',
          range,
        },
      ];
      return { suggestions: snippets };
    },
  });
}

export const DEFAULT_SCRIPT = `// OPC UA Simulator Script
// Tags: [TagName]    Commands: [CmdName](args)

// Write static value
// [MyTag.Setpoint] = 100

// Write expression
// [MyTag.Output] = [MyTag.InputA] + [MyTag.InputB]

// Read tag into variable
// status = [MyTag.Status]

// Execute command
// [MyCmd.Reset]()

// Execute command and store result
// result = [MyCmd.GetValue](10, 20)

// Increment / decrement
// [MyTag.Counter] += 1
// [MyTag.Counter] -= 1

// Repeating interval — write value every 1s
// [MyTag.Setpoint] = 100 EVERY 1000ms

// Repeating increment every 500ms
// [MyTag.Counter] += 1 EVERY 500ms

// Rotate values every 2s
// [MyTag.Mode] = (0,1,2) EVERY 2000ms

// Repeat command every 5s
// [MyCmd.Ping]() EVERY 5000ms

// Stop an active interval
// RESET [MyTag.Counter]

// Conditional (single statement)
// IF [MyTag.Status] == 1000 THEN [MyTag.Setpoint] = 0

// Conditional (multiple statements)
// IF [MyTag.Status] >= 500 THEN { [MyTag.Setpoint] = 0; [MyTag.Mode] = 1 }

// Conditional stop
// IF [MyTag.Status] == 0 THEN STOP SIMULATION

// Pause 1 second
// SLEEP 1000

// Stop the simulation
// STOP SIMULATION
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
