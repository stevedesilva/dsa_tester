import { Chip, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material'
import type { HistorySession } from '../types'

interface Props {
  sessions: HistorySession[]
}

export default function HistoryTable({ sessions }: Props) {
  if (sessions.length === 0) return <Typography color="text.secondary">No history yet.</Typography>
  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell>Date</TableCell>
          <TableCell>Topic</TableCell>
          <TableCell>Difficulty</TableCell>
          <TableCell>Elo</TableCell>
          <TableCell>Delta</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {sessions.map((s, i) => (
          <TableRow key={i}>
            <TableCell>{new Date(s.date).toLocaleDateString()}</TableCell>
            <TableCell>{s.topic}</TableCell>
            <TableCell>
              <Chip label={s.difficulty} size="small" />
            </TableCell>
            <TableCell>{s.elo_after ? Math.round(s.elo_after) : '—'}</TableCell>
            <TableCell>
              {s.delta != null && (
                <Typography color={s.delta >= 0 ? 'success.main' : 'error.main'}>
                  {s.delta >= 0 ? '+' : ''}{Math.round(s.delta)}
                </Typography>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
