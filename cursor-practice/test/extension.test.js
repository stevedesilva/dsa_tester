const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('Practice opens fresh attempts for the selected question and preserves earlier code', async () => {
  const directory = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'practice-selection-'));
  try {
    const core = require('../src/core');
    const store = new core.Store(path.join(directory, '.java-practice'));
    const problem = await store.saveProblem({ title: 'Selected', description: 'Echo', mainClass: 'Solution',
      starterCode: 'class Solution {}', tests: [{ input: '', expected: '' }] });
    const commands = {};
    const errors = [];
    const workspaceState = new Map();
    let receive, opened, saves = 0, allowSave = true;
    const panel = { reveal() {}, onDidDispose() {}, webview: {
      asWebviewUri: uri => uri.fsPath, postMessage() {},
      onDidReceiveMessage(callback) { receive = callback; },
    } };
    const vscode = {
      ViewColumn: { One: 1, Beside: -2 }, StatusBarAlignment: { Left: 1 },
      Uri: { file: fsPath => ({ scheme: 'file', fsPath }), joinPath: (base, ...parts) => ({ fsPath: path.join(base.fsPath, ...parts) }) },
      workspace: {
        workspaceFolders: [{ uri: { scheme: 'file', fsPath: directory } }],
        async saveAll() { saves++; return allowSave; },
        updateWorkspaceFolders(index, count, next) { this.workspaceFolders.splice(index, count, next); return true; },
        async openTextDocument(file) { opened = file; return { fileName: file }; },
      },
      window: {
        createOutputChannel: () => ({ appendLine() {} }), createStatusBarItem: () => ({ show() {} }),
        createWebviewPanel: () => panel, async showTextDocument() {},
        showErrorMessage(message) { errors.push(message); },
      },
      commands: { registerCommand(name, callback) { commands[name] = callback; } },
    };
    const sandbox = { module: { exports: {} },
      require: name => name === 'vscode' ? vscode : name === './core' ? core : require(name) };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/extension.js'), 'utf8'), sandbox);
    sandbox.module.exports.activate({ subscriptions: [], extensionUri: { fsPath: '/extension' },
      workspaceState: { get: key => workspaceState.get(key), async update(key, value) { workspaceState.set(key, value); } } });
    await commands['javaPractice.home']();
    await receive({ type: 'practice', id: problem.id });
    const first = await store.activeAttempt();
    assert.equal(first.problem.id, problem.id);
    const firstSource = opened;
    fs.writeFileSync(firstSource, '// Previous work');
    await receive({ type: 'practice', id: problem.id });
    const second = await store.activeAttempt();
    assert.notEqual(second.id, first.id);
    assert.equal(fs.readFileSync(opened, 'utf8'), problem.starterCode);
    assert.equal(fs.readFileSync(firstSource, 'utf8'), '// Previous work');
    assert.equal((await store.history()).length, 2);
    assert.equal(saves, 2);
    assert.equal(errors.length, 0);
    allowSave = false;
    await receive({ type: 'practice', id: problem.id });
    assert.equal((await store.activeAttempt()).id, second.id);
    assert.match(errors.at(-1), /Save your open files/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

for (const panelColumn of [1, 2]) {
  test(`Open Solution focuses the current Java file with panel in column ${panelColumn}`, async () => {
    const commands = {};
    let receive;
    let opened;
    let shown;
    let reveals = 0;
    const panel = {
      viewColumn: panelColumn,
      reveal() { reveals++; },
      onDidDispose() {},
      webview: {
        asWebviewUri: value => value.fsPath,
        postMessage() {},
        onDidReceiveMessage(callback) { receive = callback; },
      },
    };
    const vscode = {
      ViewColumn: { One: 1, Beside: -2 },
      StatusBarAlignment: { Left: 1 },
      Uri: { joinPath: (base, ...parts) => ({ fsPath: path.join(base.fsPath, ...parts) }) },
      workspace: {
        workspaceFolders: [{ uri: { scheme: 'file', fsPath: '/repo' } }],
        async openTextDocument(file) { opened = file; return { fileName: file }; },
      },
      window: {
        createOutputChannel: () => ({ appendLine() {} }),
        createStatusBarItem: () => ({ show() {} }),
        createWebviewPanel: () => panel,
        async showTextDocument(document, options) { shown = { document, options }; },
        showErrorMessage(message) { assert.fail(message); },
      },
      commands: { registerCommand(name, callback) { commands[name] = callback; } },
    };
    class Store {
      constructor(root) { this.root = root; }
      async listProblems() { return { problems: [], errors: [] }; }
      async activeAttempt() { return { id: 'current', problem: { mainClass: 'Solution' } }; }
      attemptPath(id) { return path.join(this.root, 'attempts', id); }
    }
    const sandbox = {
      module: { exports: {} },
      require: name => name === 'vscode' ? vscode : name === './core' ? { Store } : require(name),
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/extension.js'), 'utf8'), sandbox);
    sandbox.module.exports.activate({ subscriptions: [], extensionUri: { fsPath: '/extension' } });
    await commands['javaPractice.home']();
    await receive({ type: 'openSolution' });
    assert.equal(opened, '/repo/.java-practice/attempts/current/src/Solution.java');
    assert.equal(shown.document.fileName, opened);
    assert.equal(shown.options.preserveFocus, false);
    assert.equal(shown.options.preview, false);
    assert.equal(shown.options.viewColumn, panelColumn === 1 ? -2 : 1);
    assert.equal(reveals, 0, 'Opening the solution must not reveal the panel again');
  });
}
