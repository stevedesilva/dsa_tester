const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { randomUUID, randomInt } = require('node:crypto');
const { spawn } = require('node:child_process');

const MAX_OUTPUT = 256 * 1024;

function validateProblem(value) {
  if (!value || typeof value !== 'object') throw new Error('Problem must be an object.');
  for (const key of ['title', 'description', 'starterCode', 'mainClass']) {
    if (typeof value[key] !== 'string' || !value[key].trim()) throw new Error(`${key} is required.`);
  }
  if (!/^[A-Za-z_$][\w$]*$/.test(value.mainClass)) {
    throw new Error('Main class must be a simple Java class name, e.g. Solution (no package).');
  }
  if (!Array.isArray(value.tests) || value.tests.length === 0) throw new Error('Add at least one test.');
  const tests = value.tests.map((test, index) => {
    if (!test || typeof test.input !== 'string' || typeof test.expected !== 'string') {
      throw new Error(`Test ${index + 1} needs input and expected output text.`);
    }
    return { input: test.input, expected: test.expected };
  });
  const timeLimitMs = Number(value.timeLimitMs ?? 2000);
  if (!Number.isInteger(timeLimitMs) || timeLimitMs < 100 || timeLimitMs > 30000) {
    throw new Error('Time limit must be 100–30000 milliseconds per test.');
  }
  if (value.solution !== undefined && typeof value.solution !== 'string') {
    throw new Error('Reference solution must be text.');
  }
  return {
    title: value.title.trim(), description: value.description, starterCode: value.starterCode,
    solution: value.solution ?? '',
    mainClass: value.mainClass, timeLimitMs, tests,
  };
}

function safeId(id) {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('Invalid ID.');
  return id;
}

async function readJson(file) { return JSON.parse(await fs.readFile(file, 'utf8')); }
async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
    await fs.rename(temporary, file);
  } finally { await fs.rm(temporary, { force: true }); }
}

class Store {
  constructor(root) { this.root = root; }
  problemPath(id) { return path.join(this.root, 'problems', `${safeId(id)}.json`); }
  attemptPath(id) { return path.join(this.root, 'attempts', safeId(id)); }

  async listProblems() {
    const directory = path.join(this.root, 'problems');
    await fs.mkdir(directory, { recursive: true });
    const problems = [];
    const errors = [];
    for (const name of (await fs.readdir(directory)).filter(n => n.endsWith('.json')).sort()) {
      try { problems.push(await this.getProblem(name.slice(0, -5))); }
      catch (error) { errors.push(`${name}: ${error.message}`); }
    }
    return { problems, errors };
  }

  async getProblem(id) {
    const value = await readJson(this.problemPath(id));
    return { ...validateProblem(value), id: safeId(id) };
  }

  async saveProblem(value, id) {
    const problem = { ...validateProblem(value), id: id ? safeId(id) : randomUUID() };
    // Editing must refer to an existing entry; never silently overwrite a different path.
    if (id) await this.getProblem(id);
    await writeJson(this.problemPath(problem.id), problem);
    return problem;
  }

  async startAttempt(problem) {
    const id = `${Date.now()}-${randomUUID()}`;
    const directory = this.attemptPath(id);
    const source = path.join(directory, 'src', `${problem.mainClass}.java`);
    await fs.mkdir(path.dirname(source), { recursive: true });
    await fs.writeFile(source, problem.starterCode);
    await fs.writeFile(path.join(directory, 'PROBLEM.md'), `# ${problem.title}\n\n${problem.description}\n`);
    await writeJson(path.join(directory, '.vscode', 'settings.json'), {
      'java.project.sourcePaths': ['src'], 'java.project.outputPath': 'bin',
    });
    const attempt = { id, startedAt: new Date().toISOString(), problem };
    await writeJson(path.join(directory, 'attempt.json'), attempt);
    await writeJson(path.join(this.root, 'active.json'), { id });
    return attempt;
  }

  async getAttempt(id) {
    const attempt = await readJson(path.join(this.attemptPath(id), 'attempt.json'));
    if (attempt.id !== id) throw new Error('Attempt ID mismatch.');
    attempt.problem = { ...validateProblem(attempt.problem), id: safeId(attempt.problem.id) };
    return attempt;
  }

  async activeAttempt() {
    let active;
    try { active = await readJson(path.join(this.root, 'active.json')); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    return this.getAttempt(active.id);
  }

  async resume(id) {
    const attempt = await this.getAttempt(id);
    await writeJson(path.join(this.root, 'active.json'), { id });
    return attempt;
  }

  async history() {
    const directory = path.join(this.root, 'attempts');
    await fs.mkdir(directory, { recursive: true });
    const attempts = [];
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) attempts.push(await this.getAttempt(entry.name));
    }
    return attempts.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  async saveRun(attempt, code, report) {
    const runId = `${Date.now()}-${randomUUID()}`;
    const directory = path.join(this.attemptPath(attempt.id), 'runs', runId);
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, `${attempt.problem.mainClass}.java`), code);
    await writeJson(path.join(directory, 'results.json'), report);
    attempt.lastRun = { runId, ...report };
    await writeJson(path.join(this.attemptPath(attempt.id), 'attempt.json'), attempt);
  }
}

function chooseRandom(problems, previousId) {
  const choices = problems.length > 1 ? problems.filter(p => p.id !== previousId) : problems;
  if (!choices.length) throw new Error('The problem bank is empty. Add a problem first.');
  return choices[randomInt(choices.length)];
}

// Whitespace-separated tokens: tolerate formatting differences, but preserve token order/content.
function normalizeOutput(text) { return text.trim().split(/\s+/).filter(Boolean).join(' '); }

function execute(command, args, { cwd, input = '', timeoutMs, signal }) {
  return new Promise(resolve => {
    if (signal?.aborted) return resolve({ cancelled: true, stdout: '', stderr: '', elapsedMs: 0 });
    const start = Date.now();
    const child = spawn(command, args, {
      cwd, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
      detached: process.platform !== 'win32',
    });
    let stdout = '', stderr = '', bytes = 0, timedOut = false, outputLimit = false, cancelled = false;
    let spawnError;
    function kill() {
      if (process.platform === 'win32') {
        if (child.pid) {
          const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
          killer.on('error', () => child.kill());
        }
      } else if (child.pid) {
        try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
      }
    }
    const timer = setTimeout(() => { timedOut = true; kill(); }, timeoutMs);
    const abort = () => { cancelled = true; kill(); };
    signal?.addEventListener('abort', abort, { once: true });
    function collect(stream, data) {
      bytes += Buffer.byteLength(data);
      if (bytes > MAX_OUTPUT) { outputLimit = true; kill(); return; }
      if (stream === 'stdout') stdout += data; else stderr += data;
    }
    child.stdout.setEncoding('utf8').on('data', data => collect('stdout', data));
    child.stderr.setEncoding('utf8').on('data', data => collect('stderr', data));
    child.stdin.on('error', () => {}); // Early process exit may close stdin before input is consumed.
    child.on('error', error => { spawnError = error.message; });
    child.on('close', code => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      resolve({ code, stdout, stderr, timedOut, outputLimit, cancelled, spawnError, elapsedMs: Date.now() - start });
    });
    child.stdin.end(input);
  });
}

function failure(result) {
  if (result.cancelled) return 'Cancelled';
  if (result.spawnError) return `Could not start Java tool: ${result.spawnError}. Check JDK installation / javaPractice.javaHome.`;
  if (result.timedOut) return 'Time limit exceeded';
  if (result.outputLimit) return 'Output limit exceeded (256 KiB)';
  if (result.code !== 0) return `Process exited with code ${result.code}`;
  return null;
}

async function runTests(problem, code, { javaHome = process.env.JAVA_HOME, signal, onCase = () => {} } = {}) {
  problem = validateProblem(problem);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'java-practice-'));
  const executable = name => javaHome ? path.join(javaHome, 'bin', name + (process.platform === 'win32' ? '.exe' : '')) : name;
  const report = { testedAt: new Date().toISOString(), status: 'failed', passed: 0, total: problem.tests.length, cases: [] };
  try {
    const source = path.join(directory, `${problem.mainClass}.java`);
    await fs.writeFile(source, code);
    const compilation = await execute(executable('javac'), ['--release', '17', '-encoding', 'UTF-8', '-d', directory, source], {
      cwd: directory, timeoutMs: 30000, signal,
    });
    const compileError = failure(compilation);
    if (compileError) {
      return { ...report, status: compilation.cancelled ? 'cancelled' : 'compile-error', error: compileError, diagnostics: compilation.stderr || compilation.stdout };
    }
    for (const [index, test] of problem.tests.entries()) {
      const result = await execute(executable('java'), ['-Xmx256m', '-Dfile.encoding=UTF-8', '-cp', directory, problem.mainClass], {
        cwd: directory, input: test.input, timeoutMs: problem.timeLimitMs, signal,
      });
      const error = failure(result);
      const passed = !error && normalizeOutput(result.stdout) === normalizeOutput(test.expected);
      const testResult = {
        number: index + 1, passed, input: test.input, expected: test.expected,
        actual: result.stdout, stderr: result.stderr, elapsedMs: result.elapsedMs,
        error: error || (passed ? null : 'Wrong answer'),
      };
      report.cases.push(testResult);
      if (passed) report.passed++;
      onCase(testResult);
      if (result.cancelled) { report.status = 'cancelled'; return report; }
    }
    report.status = report.passed === report.total ? 'passed' : 'failed';
    return report;
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
}

module.exports = { Store, validateProblem, chooseRandom, normalizeOutput, runTests };
