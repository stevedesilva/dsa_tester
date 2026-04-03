import {
  Box,
  Button,
  CircularProgress,
  Container,
  Grid,
  Paper,
  Tab,
  Tabs,
  Typography,
} from '@mui/material'
import { useCallback, useEffect, useState } from 'react'
import { fetchHistory, fetchQuestion, fetchStatus, submitSolution } from './api'
import CodeEditor from './components/CodeEditor'
import EloCard from './components/EloCard'
import ExplanationInput from './components/ExplanationInput'
import HistoryTable from './components/HistoryTable'
import LanguageSelector from './components/LanguageSelector'
import QuestionPanel from './components/QuestionPanel'
import TestResultsPanel from './components/TestResultsPanel'
import TimerBar from './components/TimerBar'
import type {
  AppState,
  HistorySession,
  Language,
  Question,
  SubmitResult,
  TestResult,
} from './types'

export default function App() {
  const [appState, setAppState] = useState<AppState>('idle')
  const [question, setQuestion] = useState<Question | null>(null)
  const [language, setLanguage] = useState<Language>('python')
  const [code, setCode] = useState('')
  const [explanation, setExplanation] = useState('')
  const [testResults, setTestResults] = useState<TestResult[]>([])
  const [submitResult, setSubmitResult] = useState<SubmitResult | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [currentElo, setCurrentElo] = useState(800)
  const [history, setHistory] = useState<HistorySession[]>([])
  const [tab, setTab] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchStatus()
      .then((s) => setCurrentElo(s.elo))
      .catch(() => {})
    fetchHistory()
      .then(setHistory)
      .catch(() => {})
  }, [])

  const loadQuestion = async () => {
    setAppState('idle')
    setError(null)
    setTestResults([])
    setSubmitResult(null)
    setElapsedSeconds(0)
    setCode('')
    setExplanation('')
    try {
      const q = await fetchQuestion()
      setQuestion(q)
      // Set default code from function signature
      const sig = q.function_signatures[language]
      setCode(sig ? `${sig}\n    pass\n` : '')
      setAppState('question_loaded')
    } catch (e) {
      setError(String(e))
    }
  }

  const startCoding = () => setAppState('coding')

  const handleLanguageChange = (lang: Language) => {
    setLanguage(lang)
    if (question) {
      const sig = question.function_signatures[lang]
      setCode(sig ? `${sig}\n    pass\n` : '')
    }
  }

  const handleSubmit = async () => {
    if (!question) return
    setAppState('submitting')
    setTestResults([])
    try {
      for await (const event of submitSolution(
        question.session_id,
        language,
        code,
        explanation,
        elapsedSeconds,
      )) {
        if (event.event === 'case_result') {
          setTestResults((prev) => [
            ...prev,
            {
              case_number: event.case as number,
              passed: event.passed as boolean,
              elapsed_ms: event.elapsed_ms as number,
              error: event.error as string | undefined,
            },
          ])
        } else if (event.event === 'complete') {
          const result: SubmitResult = {
            pass_rate: event.pass_rate as number,
            explanation_score: event.explanation_score as number,
            elo_before: event.elo_before as number,
            elo_after: event.elo_after as number,
            delta: event.delta as number,
          }
          setSubmitResult(result)
          setCurrentElo(result.elo_after)
          setAppState('results')
          // Refresh history
          fetchHistory().then(setHistory).catch(() => {})
        }
      }
    } catch (e) {
      setError(String(e))
      setAppState('coding')
    }
  }

  const handleTick = useCallback((s: number) => setElapsedSeconds(s), [])

  const isCoding = appState === 'coding' || appState === 'question_loaded'
  const isSubmitting = appState === 'submitting'

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h4">DSA Tester</Typography>
        <EloCard result={submitResult} currentElo={currentElo} />
      </Box>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Practice" />
        <Tab label="History" />
      </Tabs>

      {tab === 0 && (
        <>
          {error && (
            <Typography color="error" mb={2}>{error}</Typography>
          )}

          {appState === 'idle' && !error && (
            <Box display="flex" justifyContent="center" mt={8}>
              <Button variant="contained" size="large" onClick={loadQuestion}>
                Get Today&apos;s Question
              </Button>
            </Box>
          )}

          {error && (
            <Box display="flex" justifyContent="center" mt={2}>
              <Button variant="outlined" onClick={loadQuestion}>Try Again</Button>
            </Box>
          )}

          {(appState === 'question_loaded' || appState === 'coding' || appState === 'submitting' || appState === 'results') && question && (
            <Grid container spacing={2}>
              <Grid item xs={12} md={5}>
                <QuestionPanel question={question} />
              </Grid>
              <Grid item xs={12} md={7}>
                <Paper sx={{ p: 2 }}>
                  <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                    <LanguageSelector
                      value={language}
                      onChange={handleLanguageChange}
                      disabled={isSubmitting}
                    />
                    {isCoding && (
                      <TimerBar running={appState === 'coding'} onTick={handleTick} />
                    )}
                  </Box>

                  {appState === 'question_loaded' && (
                    <Box mb={2}>
                      <Button variant="contained" onClick={startCoding}>
                        Start Coding
                      </Button>
                    </Box>
                  )}

                  <CodeEditor
                    value={code}
                    onChange={setCode}
                    language={language}
                    disabled={isSubmitting || appState === 'results'}
                  />

                  <Box mt={2}>
                    <ExplanationInput
                      value={explanation}
                      onChange={setExplanation}
                      disabled={isSubmitting || appState === 'results'}
                    />
                  </Box>

                  <Box mt={2} display="flex" gap={2} alignItems="center">
                    {appState === 'coding' && (
                      <Button
                        variant="contained"
                        color="primary"
                        onClick={handleSubmit}
                        disabled={!code.trim()}
                      >
                        Submit
                      </Button>
                    )}
                    {isSubmitting && <CircularProgress size={24} />}
                    {appState === 'results' && (
                      <Button variant="outlined" onClick={loadQuestion}>
                        New Question
                      </Button>
                    )}
                  </Box>
                </Paper>

                {testResults.length > 0 && (
                  <Paper sx={{ p: 2, mt: 2 }}>
                    <TestResultsPanel results={testResults} />
                  </Paper>
                )}
              </Grid>
            </Grid>
          )}
        </>
      )}

      {tab === 1 && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" mb={2}>Session History</Typography>
          <HistoryTable sessions={history} />
        </Paper>
      )}
    </Container>
  )
}
