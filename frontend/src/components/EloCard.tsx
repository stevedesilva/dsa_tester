import { Box, Card, CardContent, Typography } from '@mui/material'
import type { SubmitResult } from '../types'

interface Props {
  result: SubmitResult | null
  currentElo: number
}

export default function EloCard({ result, currentElo }: Props) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="h6">Rating</Typography>
        <Typography variant="h4">{result ? result.elo_after : Math.round(currentElo)}</Typography>
        {result && (
          <Box display="flex" alignItems="center" gap={1}>
            <Typography
              variant="h6"
              color={result.delta >= 0 ? 'success.main' : 'error.main'}
            >
              {result.delta >= 0 ? '+' : ''}{result.delta}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Pass: {(result.pass_rate * 100).toFixed(0)}% | Explanation: {(result.explanation_score * 100).toFixed(0)}%
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  )
}
