import { ToggleButton, ToggleButtonGroup } from '@mui/material'
import type { Language } from '../types'

interface Props {
  value: Language
  onChange: (lang: Language) => void
  disabled?: boolean
}

export default function LanguageSelector({ value, onChange, disabled }: Props) {
  return (
    <ToggleButtonGroup
      value={value}
      exclusive
      onChange={(_, v) => v && onChange(v as Language)}
      size="small"
      disabled={disabled}
    >
      <ToggleButton value="python">Python</ToggleButton>
      <ToggleButton value="java">Java</ToggleButton>
      <ToggleButton value="go">Go</ToggleButton>
    </ToggleButtonGroup>
  )
}
