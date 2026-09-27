/* global acquireVsCodeApi */
const vscode = acquireVsCodeApi();
const app = document.getElementById('app');
let state;
let draft = vscode.getState()?.draft || null;
const send = (type, values = {}) => vscode.postMessage({ type, ...values });

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function button(text, action, disabled = false, secondary = false) {
  const node = element('button', text, secondary ? 'secondary' : '');
  node.type = 'button';
  node.disabled = disabled;
  node.addEventListener('click', action);
  return node;
}

function toolbar(...children) { const node = element('div', undefined, 'toolbar'); node.append(...children); return node; }

function navigate(type, values) {
  if (state?.mode === 'edit') { draft = null; vscode.setState({ draft }); }
  send(type, values);
}

function render() {
  app.replaceChildren();
  app.append(element('h1', 'Java Practice'));
  const error = element('div', '', 'error');
  error.id = 'error';
  error.setAttribute('role', 'alert');
  app.append(error);
  if (state.mode === 'edit') { renderForm(); return; }
  app.append(toolbar(
    button('Random Problem', () => send('random'), state.running || !state.problems.length),
    button('Add Problem', () => send('add'), false, true),
    button('History', () => send('history'), state.running, true),
  ));
  if (state.active) renderAttempt();
  app.append(element('h2', `Problem bank (${state.problems.length})`));
  app.append(element('p', 'Random selection avoids the immediately previous problem when the bank has more than one entry.', 'muted'));
  if (!state.problems.length) {
    app.append(element('p', 'Add your first problem using the structured form, or import Relative Sort Array to try the workflow.'));
    app.append(button('Import Relative Sort Array', () => send('example')));
  }
  for (const problem of state.problems) {
    const row = element('div', undefined, 'problem-row');
    row.append(element('span', `${problem.title} · ${problem.tests.length} tests`),
      button('Edit', () => send('edit', { id: problem.id }), false, true));
    app.append(row);
  }
  app.append(element('p', `Saved locally: ${state.bankPath}`, 'muted path'));
  for (const message of state.errors) app.append(element('p', message, 'error'));
}

function renderAttempt() {
  const { problem, lastRun, startedAt } = state.active;
  app.append(element('h2', problem.title), element('p', `Attempt started ${new Date(startedAt).toLocaleString()}`, 'muted'));
  app.append(toolbar(
    button('Open My Code', () => send('openSolution'), state.running, true),
    button(state.running ? 'Running…' : 'Run Tests', () => send('test'), state.running),
    ...(state.running ? [button('Cancel Tests', () => send('cancel'), false, true)] : []),
  ));
  app.append(element('p', `${problem.tests.length} tests · ${problem.timeLimitMs} ms per test · Java 17 · ${problem.mainClass}.java`, 'muted'));
  app.append(element('div', problem.description, 'statement'));
  if (problem.solution?.trim()) {
    const reference = element('details', undefined, 'reference-solution');
    reference.append(element('summary', 'Show reference solution'), element('pre', problem.solution));
    app.append(reference);
  }
  if (!lastRun) return;
  const section = element('section', undefined, 'results');
  section.append(element('h2', `${lastRun.passed}/${lastRun.total} passed — ${lastRun.status}`));
  section.append(element('p', `Last tested ${new Date(lastRun.testedAt).toLocaleString()}. Results describe the saved code at that time.`, 'muted'));
  if (lastRun.error) section.append(element('p', lastRun.error, 'error'));
  if (lastRun.diagnostics) section.append(element('pre', lastRun.diagnostics));
  for (const result of lastRun.cases) {
    const details = element('details');
    details.open = !result.passed;
    details.append(element('summary', `Test ${result.number}: ${result.passed ? 'PASS' : result.error} (${result.elapsedMs} ms)`, result.passed ? 'pass' : 'error'));
    for (const [label, value] of [['Input', result.input], ['Expected', result.expected], ['Actual', result.actual], ['Stderr', result.stderr]]) {
      if (label !== 'Stderr' || value) details.append(element('h3', label), element('pre', value || '(empty)'));
    }
    section.append(details);
  }
  app.append(section);
}

function renderForm() {
  const id = state.problem?.id;
  const initial = draft && draft.id === id ? draft : state.problem || {
    title: '', description: '', mainClass: 'Solution', timeLimitMs: 2000,
    starterCode: 'import java.util.*;\n\nclass Solution {\n    public static void main(String[] args) {\n        Scanner scanner = new Scanner(System.in);\n        // Read input, call your algorithm, and print the result.\n    }\n}\n',
    tests: [{ input: '', expected: '' }],
  };
  app.append(element('h2', id ? 'Edit Problem' : 'Add Problem'));
  app.append(element('p', 'Paste the statement and starter code. Add raw stdin and expected stdout for each test. The starter must have a main method and no package declaration.'));
  if (id) app.append(element('p', 'Edits apply to new attempts. Existing attempts keep their original problem and tests.', 'muted'));
  const form = element('form');
  const fields = {};
  function field(key, title, multiline, value, parent = form) {
    const label = element('label', title);
    const input = element(multiline ? 'textarea' : 'input');
    input.value = value;
    if (multiline) input.rows = ['starterCode', 'solution'].includes(key) ? 16 : 5;
    if (['starterCode', 'solution', 'input', 'expected'].includes(key)) input.className = 'code';
    input.name = key;
    input.spellcheck = false;
    label.append(input);
    parent.append(label);
    return input;
  }
  for (const [key, title, multiline] of [
    ['title', 'Title', false], ['description', 'Description and examples', true],
    ['mainClass', 'Main class name', false], ['starterCode', 'Java starter code (including main)', true],
    ['timeLimitMs', 'Time limit per test (milliseconds)', false],
  ]) {
    fields[key] = field(key, title, multiline, initial[key]);
    fields[key].required = true;
  }
  fields.timeLimitMs.type = 'number';
  fields.timeLimitMs.min = '100';
  fields.timeLimitMs.max = '30000';
  fields.timeLimitMs.step = '1';
  fields.solution = field('solution', 'Reference solution (optional — Java code and/or explanation)', true, initial.solution ?? '');
  form.append(element('p', 'Saved with the question and hidden behind “Show reference solution” during practice. Your attempt starts from the starter code.', 'muted'));
  form.append(element('h2', 'Manual test cases'));
  form.append(element('p', 'Use plain text: no “Input:” labels or JSON wrappers unless your Java program expects them. Output is compared by whitespace-separated tokens; order and case matter.', 'muted'));
  const testsContainer = element('div');
  const rows = [];
  function addTest(test = { input: '', expected: '' }) {
    const row = element('fieldset');
    const legend = element('legend', `Test ${rows.length + 1}`);
    row.append(legend);
    const input = field('input', 'Standard input (stdin)', true, test.input, row);
    const expected = field('expected', 'Expected output (stdout)', true, test.expected, row);
    const entry = { row, input, expected, legend };
    row.append(button('Remove test', () => {
      rows.splice(rows.indexOf(entry), 1);
      row.remove();
      rows.forEach((item, index) => { item.legend.textContent = `Test ${index + 1}`; });
      remember();
    }, false, true));
    rows.push(entry);
    testsContainer.append(row);
  }
  form.append(testsContainer);
  for (const test of initial.tests) addTest(test);
  function values() {
    return {
      ...Object.fromEntries(Object.entries(fields).map(([key, input]) => [key, input.value])),
      timeLimitMs: Number(fields.timeLimitMs.value),
      tests: rows.map(({ input, expected }) => ({ input: input.value, expected: expected.value })),
    };
  }
  function remember() { draft = { ...values(), id }; vscode.setState({ draft }); }
  form.addEventListener('input', remember);
  form.append(button('Add test case', () => { addTest(); remember(); }, false, true));
  const submit = element('button', 'Save Problem');
  submit.type = 'submit';
  form.append(toolbar(submit, button('Cancel', () => navigate('home'), false, true)));
  form.addEventListener('submit', event => {
    event.preventDefault();
    remember();
    submit.disabled = true;
    send('save', { id, problem: values() });
  });
  app.append(form);
}

window.addEventListener('message', event => {
  const message = event.data;
  if (message.type === 'state') {
    state = message;
    if (state.mode !== 'edit') { draft = null; vscode.setState({ draft }); }
    render();
  } else if (message.type === 'error') {
    document.getElementById('error').textContent = message.message;
    const submit = app.querySelector('button[type=submit]');
    if (submit) submit.disabled = false;
  }
});
send('ready');
