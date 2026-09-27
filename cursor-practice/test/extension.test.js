const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

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
