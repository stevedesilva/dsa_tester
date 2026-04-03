import Editor from '@monaco-editor/react'
import type { Language } from '../types'

interface Props {
  value: string
  onChange: (code: string) => void
  language: Language
  disabled?: boolean
}

const monacoLang: Record<Language, string> = {
  python: 'python',
  java: 'java',
  go: 'go',
}

export default function CodeEditor({ value, onChange, language, disabled }: Props) {
  return (
    <Editor
      height="350px"
      language={monacoLang[language]}
      value={value}
      onChange={(v) => onChange(v ?? '')}
      theme="vs-dark"
      options={{
        fontSize: 14,
        minimap: { enabled: false },
        readOnly: disabled,
        scrollBeyondLastLine: false,
      }}
    />
  )
}
