import type { Question, HistorySession, StatusInfo } from './types'

export async function fetchStatus(): Promise<StatusInfo> {
  const res = await fetch('/api/status')
  if (!res.ok) throw new Error('Failed to fetch status')
  return res.json()
}

export async function fetchQuestion(topic = 'random'): Promise<Question> {
  const res = await fetch(`/api/question?topic=${topic}`)
  if (!res.ok) throw new Error('Failed to fetch question')
  return res.json()
}

export async function fetchHistory(): Promise<HistorySession[]> {
  const res = await fetch('/api/history')
  if (!res.ok) throw new Error('Failed to fetch history')
  const data = await res.json()
  return data.sessions
}

export async function* submitSolution(
  sessionId: number,
  language: string,
  code: string,
  explanation: string,
  elapsedSeconds: number,
): AsyncGenerator<{ event: string } & Record<string, unknown>> {
  const res = await fetch('/api/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      language,
      code,
      explanation,
      elapsed_seconds: elapsedSeconds,
    }),
  })
  if (!res.ok) throw new Error('Submit failed')
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n\n')
    buffer = lines.pop() ?? ''
    for (const chunk of lines) {
      const line = chunk.trim()
      if (line.startsWith('data: ')) {
        try {
          yield JSON.parse(line.slice(6))
        } catch { /* ignore */ }
      }
    }
  }
}
