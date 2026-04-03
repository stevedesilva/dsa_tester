import { Box, Card, CardContent, Chip, Typography } from '@mui/material'
import type { Question } from '../types'

const difficultyColor: Record<string, 'success' | 'warning' | 'error' | 'secondary'> = {
  easy: 'success',
  medium: 'warning',
  hard: 'error',
  expert: 'secondary',
}

interface Props {
  question: Question
}

export default function QuestionPanel({ question }: Props) {
  return (
    <Card variant="outlined" sx={{ height: '100%', overflow: 'auto' }}>
      <CardContent>
        <Box display="flex" alignItems="center" gap={1} mb={1}>
          <Typography variant="h6">{question.title}</Typography>
          <Chip
            label={question.difficulty}
            color={difficultyColor[question.difficulty] ?? 'default'}
            size="small"
          />
          <Chip label={question.topic} size="small" variant="outlined" />
        </Box>
        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mb: 2 }}>
          {question.description}
        </Typography>
        {question.examples.map((ex, i) => (
          <Box key={i} sx={{ mb: 1, pl: 1, borderLeft: '3px solid', borderColor: 'primary.main' }}>
            <Typography variant="caption" color="text.secondary">Example {i + 1}</Typography>
            <Typography variant="body2">Input: {ex.input}</Typography>
            <Typography variant="body2">Output: {ex.output}</Typography>
          </Box>
        ))}
        {question.constraints.length > 0 && (
          <Box mt={2}>
            <Typography variant="caption" color="text.secondary">Constraints</Typography>
            {question.constraints.map((c, i) => (
              <Typography key={i} variant="body2">• {c}</Typography>
            ))}
          </Box>
        )}
      </CardContent>
    </Card>
  )
}
