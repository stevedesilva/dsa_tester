import { Chip, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material'
import type { TestResult } from '../types'

interface Props {
  results: TestResult[]
}

export default function TestResultsPanel({ results }: Props) {
  if (results.length === 0) return null
  const passed = results.filter((r) => r.passed).length
  return (
    <>
      <Typography variant="subtitle2" mb={1}>
        Test Results: {passed}/{results.length} passed
      </Typography>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Case</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Time</TableCell>
            <TableCell>Error</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {results.map((r) => (
            <TableRow key={r.case_number}>
              <TableCell>{r.case_number}</TableCell>
              <TableCell>
                <Chip
                  label={r.passed ? 'PASS' : 'FAIL'}
                  color={r.passed ? 'success' : 'error'}
                  size="small"
                />
              </TableCell>
              <TableCell>{r.elapsed_ms}ms</TableCell>
              <TableCell>
                <Typography variant="caption" color="error">
                  {r.error ?? ''}
                </Typography>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  )
}
