import { Box, LinearProgress, Typography } from '@mui/material'
import { useEffect, useState } from 'react'

interface Props {
  running: boolean
  onTick?: (seconds: number) => void
}

export default function TimerBar({ running, onTick }: Props) {
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      setSeconds((s) => {
        const next = s + 1
        onTick?.(next)
        return next
      })
    }, 1000)
    return () => clearInterval(id)
  }, [running, onTick])

  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  const label = `${mins}:${secs.toString().padStart(2, '0')}`

  return (
    <Box display="flex" alignItems="center" gap={1}>
      <Typography variant="body2" sx={{ minWidth: 48 }}>{label}</Typography>
      <LinearProgress variant="indeterminate" sx={{ flex: 1 }} />
    </Box>
  )
}
