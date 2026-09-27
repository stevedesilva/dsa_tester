const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Store, validateProblem, chooseRandom, runTests } = require('../src/core');
const example = require('../examples/relative-sort-array.json');

function problem(overrides = {}) {
  return {
    title: 'Echo', description: 'Echo a line', mainClass: 'Solution', timeLimitMs: 2000,
    starterCode: 'class Solution { public static void main(String[] args) { System.out.print(new java.util.Scanner(System.in).nextLine()); } }',
    tests: [{ input: 'hello world\n', expected: 'hello world\n' }], ...overrides,
  };
}

test('form validation rejects missing tests, invalid entry points and invalid time limits', () => {
  assert.throws(() => validateProblem(problem({ tests: [] })), /at least one test/);
  assert.throws(() => validateProblem(problem({ mainClass: '../Solution' })), /class name/);
  assert.throws(() => validateProblem(problem({ timeLimitMs: 0 })), /Time limit/);
  assert.throws(() => validateProblem(problem({ tests: [{ input: 4, expected: '' }] })), /text/);
  assert.equal(validateProblem(problem({ tests: [{ input: '', expected: '' }] })).tests.length, 1);
  assert.equal(validateProblem(problem()).solution, '');
  assert.throws(() => validateProblem(problem({ solution: 42 })), /solution must be text/);
});

test('storage preserves problem edits, attempt snapshots, run code and resume state across reloads', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'java-practice-store-test-'));
  try {
    const store = new Store(directory);
    const solution = '// Reference answer\nclass Solution {}\n';
    const saved = await store.saveProblem(problem({ solution }));
    assert.equal((await new Store(directory).getProblem(saved.id)).solution, solution);
    const first = await store.startAttempt(saved);
    await store.saveProblem(problem({ title: 'Edited', tests: [{ input: 'new', expected: 'new' }] }), saved.id);
    assert.equal((await store.getProblem(saved.id)).title, 'Edited');
    assert.equal((await store.getAttempt(first.id)).problem.title, 'Echo');
    assert.equal((await store.getAttempt(first.id)).problem.solution, solution);
    assert.equal((await store.getProblem(saved.id)).solution, '');
    const second = await store.startAttempt(await store.getProblem(saved.id));
    await store.saveRun(first, 'submitted code', { status: 'passed', total: 1, passed: 1, cases: [] });
    const reloaded = new Store(directory);
    assert.equal((await reloaded.activeAttempt()).id, second.id);
    await reloaded.resume(first.id);
    assert.equal((await reloaded.activeAttempt()).id, first.id);
    assert.equal((await reloaded.history()).length, 2);
    const updated = await reloaded.getAttempt(first.id);
    assert.equal(updated.lastRun.status, 'passed');
    assert.equal(await fs.readFile(path.join(store.attemptPath(first.id), 'runs', updated.lastRun.runId, 'Solution.java'), 'utf8'), 'submitted code');
    assert.equal(await fs.readFile(path.join(store.attemptPath(second.id), 'src', 'Solution.java'), 'utf8'), saved.starterCode);
    await fs.writeFile(path.join(directory, 'problems', 'broken.json'), '{');
    const listed = await reloaded.listProblems();
    assert.equal(listed.problems.length, 1);
    assert.equal(listed.errors.length, 1);
    assert.throws(() => reloaded.problemPath('../escape'), /Invalid ID/);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('random selection handles empty/single banks and avoids immediate repeats', () => {
  assert.throws(() => chooseRandom([]), /empty/);
  assert.equal(chooseRandom([{ id: 'one' }], 'one').id, 'one');
  for (let i = 0; i < 20; i++) assert.equal(chooseRandom([{ id: 'one' }, { id: 'two' }], 'one').id, 'two');
});

test('real Java runner handles whitespace, wrong answers, and starts a fresh JVM per case', async () => {
  const value = problem({
    tests: [{ input: '', expected: '1 2' }, { input: '', expected: '1\n2\n' }, { input: '', expected: '2 1' }],
    starterCode: 'class Solution { static int value = 0; public static void main(String[] args) { System.out.println(++value + "  2"); } }',
  });
  const report = await runTests(value, value.starterCode);
  assert.equal(report.status, 'failed');
  assert.equal(report.passed, 2);
  assert.equal(report.cases[2].error, 'Wrong answer');
});

test('real Java runner exposes compiler diagnostics', async () => {
  const report = await runTests(problem(), 'class Solution { syntax error }');
  assert.equal(report.status, 'compile-error');
  assert.match(report.diagnostics, /Solution.java/);
  assert.equal(report.cases.length, 0);
});

test('real Java runner reports runtime exceptions instead of accepting matching stdout', async () => {
  const report = await runTests(problem(), 'class Solution { public static void main(String[] args) { System.out.println("hello world"); throw new RuntimeException("broken"); } }');
  assert.equal(report.passed, 0);
  assert.match(report.cases[0].stderr, /broken/);
  assert.match(report.cases[0].error, /exited/);
});

test('real Java runner terminates an infinite loop', async () => {
  const report = await runTests(problem({ timeLimitMs: 300 }), 'class Solution { public static void main(String[] args) { while (true) {} } }');
  assert.equal(report.cases[0].error, 'Time limit exceeded');
});

test('real Java runner bounds runaway stdout', async () => {
  const report = await runTests(problem(), 'class Solution { public static void main(String[] args) { while (true) System.out.println("xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"); } }');
  assert.match(report.cases[0].error, /Output limit/);
  assert.ok(Buffer.byteLength(report.cases[0].actual) <= 256 * 1024);
});

test('runner supports cancellation between test cases', async () => {
  const controller = new AbortController();
  const value = problem({ tests: [{ input: 'hello world\n', expected: 'hello world' }, { input: 'next\n', expected: 'next' }] });
  const report = await runTests(value, value.starterCode, {
    signal: controller.signal, onCase: () => controller.abort(),
  });
  assert.equal(report.status, 'cancelled');
  assert.equal(report.passed, 1);
  assert.equal(report.cases[1].error, 'Cancelled');
});

test('runner gives an actionable error when JDK is missing', async () => {
  const report = await runTests(problem(), problem().starterCode, { javaHome: path.join(os.tmpdir(), 'nonexistent-jdk-for-test') });
  assert.equal(report.status, 'compile-error');
  assert.match(report.error, /javaPractice.javaHome/);
});

test('Relative Sort Array starter fails and a valid implementation passes supplied examples and edge cases', async () => {
  const starter = await runTests(example, example.starterCode);
  assert.equal(starter.passed, 0);
  const solution = example.starterCode.replace('return List.of();', `
    java.util.Map<Integer, Integer> counts = new java.util.TreeMap<>();
    for (int value : arr1) counts.merge(value, 1, Integer::sum);
    List<Integer> output = new java.util.ArrayList<>();
    for (int value : arr2) {
        int count = counts.getOrDefault(value, 0);
        for (int i = 0; i < count; i++) output.add(value);
        counts.remove(value);
    }
    for (var entry : counts.entrySet())
        for (int i = 0; i < entry.getValue(); i++) output.add(entry.getKey());
    return output;`);
  const value = { ...example, tests: [...example.tests,
    { input: '\n\n', expected: '' },
    { input: '3 -1 3 0\n\n', expected: '-1 0 3 3' },
    { input: '3 -1 3 0\n3\n', expected: '3 3 -1 0' },
  ] };
  const report = await runTests(value, solution);
  assert.equal(report.status, 'passed', JSON.stringify(report));
  assert.equal(report.passed, 6);
});
