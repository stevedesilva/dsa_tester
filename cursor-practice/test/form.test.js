const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const script = fs.readFileSync(path.join(__dirname, '../media/app.js'), 'utf8');

function setup() {
  const dom = new JSDOM('<main id="app"></main>', { runScripts: 'outside-only' });
  const messages = [];
  let saved;
  dom.window.acquireVsCodeApi = () => ({
    postMessage: message => messages.push(message),
    getState: () => saved,
    setState: value => { saved = value; },
  });
  dom.window.eval(script);
  const receive = data => dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data }));
  return { dom, document: dom.window.document, messages, receive };
}

test('structured form sends exact multiline tests and retains input after server validation errors', () => {
  const { dom, document, messages, receive } = setup();
  try {
    assert.equal(messages[0].type, 'ready');
    receive({ type: 'state', mode: 'edit', problem: null });
    const inputs = document.querySelectorAll('form > label input');
    inputs[0].value = 'Relative Sort Array';
    const textareas = document.querySelectorAll('form > label textarea');
    textareas[0].value = 'Sort according to arr2';
    const testFields = document.querySelectorAll('fieldset textarea');
    testFields[0].value = '2 1 2\n2 1\n';
    testFields[1].value = '2 2 1\n';
    document.querySelector('form').dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
    const message = messages.at(-1);
    assert.equal(message.type, 'save');
    assert.equal(message.problem.title, 'Relative Sort Array');
    assert.equal(message.problem.mainClass, 'Solution');
    assert.equal(message.problem.tests[0].input, '2 1 2\n2 1\n');
    assert.equal(message.problem.tests[0].expected, '2 2 1\n');
    assert.equal(document.querySelector('button[type=submit]').disabled, true);
    receive({ type: 'error', message: 'Example validation failure' });
    assert.equal(document.querySelector('button[type=submit]').disabled, false);
    assert.equal(inputs[0].value, 'Relative Sort Array');
    assert.equal(testFields[0].value, '2 1 2\n2 1\n');
    const add = [...document.querySelectorAll('button')].find(button => button.textContent === 'Add test case');
    add.click();
    assert.equal(document.querySelectorAll('fieldset').length, 2);
    document.querySelector('fieldset button').click();
    assert.equal(document.querySelectorAll('fieldset').length, 1);
    assert.equal(document.querySelector('legend').textContent, 'Test 1');
  } finally { dom.window.close(); }
});

test('problem text and compiler output are rendered as text, not executable HTML', () => {
  const { dom, document, receive } = setup();
  try {
    receive({
      type: 'state', mode: 'home', problems: [], errors: [], running: false, bankPath: '/local/bank',
      active: {
        startedAt: new Date().toISOString(),
        problem: { title: '<img src=x onerror=alert(1)>', description: '<script>alert(1)</script>', tests: [{}], timeLimitMs: 2000, mainClass: 'Solution' },
        lastRun: { testedAt: new Date().toISOString(), status: 'compile-error', total: 1, passed: 0, diagnostics: '<img src=x>', cases: [] },
      },
    });
    assert.equal(document.querySelectorAll('script, img').length, 0);
    assert.match(document.querySelector('.statement').textContent, /<script>/);
    assert.equal(document.querySelector('pre').textContent, '<img src=x>');
  } finally { dom.window.close(); }
});
