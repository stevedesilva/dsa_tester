export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert'
export type Language = 'python' | 'java' | 'go'
export type AppState = 'idle' | 'question_loaded' | 'coding' | 'submitting' | 'results'

export interface Example {
  input: string
  output: string
}

export interface TestCase {
  input: Record<string, unknown>
  expected: unknown
}

export interface FunctionSignatures {
  python: string
  java: string
  go: string
}

export interface Question {
  id: string
  title: string
  difficulty: Difficulty
  topic: string
  elo: number
  description: string
  examples: Example[]
  constraints: string[]
  function_signatures: FunctionSignatures
  test_cases: TestCase[]
  time_limit_seconds: number
  session_id: number
}

export interface TestResult {
  case_number: number
  passed: boolean
  elapsed_ms: number
  error?: string
}

export interface SubmitResult {
  pass_rate: number
  explanation_score: number
  elo_before: number
  elo_after: number
  delta: number
}

export interface HistorySession {
  date: string
  topic: string
  difficulty: string
  elo_after: number | null
  delta: number | null
}

export interface StatusInfo {
  status: string
  elo: number
  sessions_today: number
}
