import { TextField } from '@mui/material'

interface Props {
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}

export default function ExplanationInput({ value, onChange, disabled }: Props) {
  return (
    <TextField
      label="Explain your approach (algorithm, time/space complexity)"
      multiline
      rows={4}
      fullWidth
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder="Describe your solution approach, time complexity O(...), space complexity O(...)..."
    />
  )
}
