const vscode = require('vscode');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { Store, chooseRandom, runTests } = require('./core');

function activate(context) {
  let panel;
  let running = false;
  let busy = false;
  let controller;
  const output = vscode.window.createOutputChannel('Java Practice');
  context.subscriptions.push(output, { dispose: () => controller?.abort() });

  function store() {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder || folder.uri.scheme !== 'file') throw new Error('Open a local folder in Cursor first.');
    return new Store(path.join(folder.uri.fsPath, '.java-practice'));
  }

  async function refresh(mode = 'home', problem = null) {
    const bank = store();
    const { problems, errors } = await bank.listProblems();
    const active = await bank.activeAttempt();
    await panel?.webview.postMessage({
      type: 'state', mode, problem, problems, errors, active, running,
      bankPath: path.join(bank.root, 'problems'),
    });
  }

  async function showPanel(mode = 'home', problem = null) {
    store();
    if (panel) {
      panel.reveal(vscode.ViewColumn.Beside, true);
      await refresh(mode, problem);
      return;
    }
    panel = vscode.window.createWebviewPanel('javaPractice', 'Java Practice',
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }, {
        enableScripts: true, retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')],
      });
    const webview = panel.webview;
    const nonce = randomBytes(24).toString('hex');
    const script = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'app.js'));
    const style = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'style.css'));
    webview.html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
      <link rel="stylesheet" href="${style}"><title>Java Practice</title></head>
      <body><main id="app"></main><script nonce="${nonce}" src="${script}"></script></body></html>`;
    panel.onDidDispose(() => { panel = undefined; }, null, context.subscriptions);
    webview.onDidReceiveMessage(message => {
      if (message.type === 'cancel') { controller?.abort(); return; }
      if (message.type === 'ready') { refresh(mode, problem).catch(error => vscode.window.showErrorMessage(error.message)); return; }
      return guard(async () => {
      switch (message.type) {
        case 'home': await refresh(); break;
        case 'add': await refresh('edit'); break;
        case 'edit': await refresh('edit', await store().getProblem(message.id)); break;
        case 'save':
          await store().saveProblem(message.problem, message.id);
          await refresh();
          vscode.window.showInformationMessage('Problem saved to your local bank.');
          break;
        case 'random': await randomProblem(); break;
        case 'resume': await resume(); break;
        case 'openSolution': await openSolution(); break;
        case 'test': await test(); break;
        case 'history': await history(); break;
        case 'example': await importExample(); break;
      }
      });
    }, null, context.subscriptions);
  }

  function requireIdle() { if (running) throw new Error('Wait for the tests to finish, or cancel them first.'); }

  async function openAttempt(bank, attempt) {
    const directory = bank.attemptPath(attempt.id);
    // Each attempt is an unmanaged Java project with its own source/output paths.
    // Put only the current attempt in the workspace to avoid duplicate Solution classes.
    const previous = context.workspaceState.get('attemptFolder');
    const folders = vscode.workspace.workspaceFolders || [];
    if (!folders.some(folder => folder.uri.fsPath === directory)) {
      const previousIndex = folders.findIndex(folder => folder.uri.fsPath === previous);
      const next = { uri: vscode.Uri.file(directory), name: `Practice: ${attempt.problem.title}` };
      const updated = previousIndex > 0
        ? vscode.workspace.updateWorkspaceFolders(previousIndex, 1, next)
        : vscode.workspace.updateWorkspaceFolders(folders.length, 0, next);
      if (!updated) throw new Error('Could not add the attempt folder to the workspace. Try Resume Current Attempt.');
    }
    await context.workspaceState.update('attemptFolder', directory);
    const document = await vscode.workspace.openTextDocument(path.join(directory, 'src', `${attempt.problem.mainClass}.java`));
    await vscode.window.showTextDocument(document, { viewColumn: vscode.ViewColumn.One, preview: false });
    await showPanel();
  }

  async function saveEditors() {
    if (!await vscode.workspace.saveAll(false)) throw new Error('Save your open files before changing attempts.');
  }

  async function randomProblem() {
    requireIdle();
    await saveEditors();
    const bank = store();
    const { problems, errors } = await bank.listProblems();
    if (errors.length) vscode.window.showWarningMessage(`${errors.length} invalid problem file(s). See the practice panel for details.`);
    if (!problems.length) { await showPanel('edit'); return; }
    const previous = await bank.activeAttempt();
    const attempt = await bank.startAttempt(chooseRandom(problems, previous?.problem.id));
    await openAttempt(bank, attempt);
  }

  async function openSolution() {
    requireIdle();
    const bank = store();
    const attempt = await bank.activeAttempt();
    if (!attempt) throw new Error('No current attempt. Choose Random Problem first.');
    const file = path.join(bank.attemptPath(attempt.id), 'src', `${attempt.problem.mainClass}.java`);
    const document = await vscode.workspace.openTextDocument(file);
    await vscode.window.showTextDocument(document, {
      viewColumn: panel?.viewColumn === vscode.ViewColumn.One
        ? vscode.ViewColumn.Beside : vscode.ViewColumn.One,
      preserveFocus: false,
      preview: false,
    });
  }

  async function resume() {
    requireIdle();
    const bank = store();
    const attempt = await bank.activeAttempt();
    if (!attempt) throw new Error('No current attempt. Choose Random Problem first.');
    await openAttempt(bank, attempt);
  }

  async function test() {
    requireIdle();
    const bank = store();
    const attempt = await bank.activeAttempt();
    if (!attempt) throw new Error('Choose Random Problem first.');
    const file = path.join(bank.attemptPath(attempt.id), 'src', `${attempt.problem.mainClass}.java`);
    const document = await vscode.workspace.openTextDocument(file);
    if (!await document.save()) throw new Error('Could not save your solution.');
    const code = document.getText();
    running = true;
    controller = new AbortController();
    try {
      await showPanel();
      output.clear();
      output.appendLine(`Testing ${attempt.problem.title}\nSource: ${file}`);
      const report = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification, title: 'Java Practice: compiling and testing', cancellable: true,
      }, async (progress, token) => {
        const subscription = token.onCancellationRequested(() => controller.abort());
        try {
          return await runTests(attempt.problem, code, {
            javaHome: vscode.workspace.getConfiguration('javaPractice').get('javaHome') || process.env.JAVA_HOME,
            signal: controller.signal,
            onCase: result => {
              const message = `Test ${result.number}: ${result.passed ? 'PASS' : result.error} (${result.elapsedMs} ms)`;
              progress.report({ message, increment: 100 / attempt.problem.tests.length });
              output.appendLine(message);
            },
          });
        } finally { subscription.dispose(); }
      });
      await bank.saveRun(attempt, code, report);
      output.appendLine(`${report.status}: ${report.passed}/${report.total} passed`);
      if (report.diagnostics) output.appendLine(report.diagnostics);
    } finally {
      running = false;
      controller = undefined;
      await refresh();
    }
  }

  async function history() {
    requireIdle();
    const bank = store();
    const attempts = await bank.history();
    if (!attempts.length) { vscode.window.showInformationMessage('No attempts yet. Choose Random Problem to begin.'); return; }
    const selected = await vscode.window.showQuickPick(attempts.map(attempt => ({
      label: attempt.problem.title,
      description: new Date(attempt.startedAt).toLocaleString(),
      detail: attempt.lastRun ? `${attempt.lastRun.status}: ${attempt.lastRun.passed}/${attempt.lastRun.total} tests` : 'Not tested yet',
      attempt,
    })), { title: 'Resume a saved attempt', matchOnDescription: true });
    if (selected) {
      await saveEditors();
      await openAttempt(bank, await bank.resume(selected.attempt.id));
    }
  }

  async function edit() {
    const { problems } = await store().listProblems();
    if (!problems.length) { await showPanel('edit'); return; }
    const selected = await vscode.window.showQuickPick(problems.map(problem => ({ label: problem.title, problem })), { title: 'Edit a problem' });
    if (selected) await showPanel('edit', selected.problem);
  }

  async function importExample() {
    const example = JSON.parse(await fs.readFile(vscode.Uri.joinPath(context.extensionUri, 'examples', 'relative-sort-array.json').fsPath, 'utf8'));
    const bank = store();
    const { problems } = await bank.listProblems();
    if (problems.some(problem => problem.title === example.title)) {
      vscode.window.showInformationMessage('Relative Sort Array is already in your bank.');
    } else { await bank.saveProblem(example); }
    await showPanel();
  }

  async function guard(action) {
    if (busy) { vscode.window.showInformationMessage('Java Practice is busy. Finish or cancel the current action first.'); return; }
    busy = true;
    try { await action(); }
    catch (error) {
      output.appendLine(error.stack || String(error));
      await panel?.webview.postMessage({ type: 'error', message: error.message });
      vscode.window.showErrorMessage(`Java Practice: ${error.message}`);
    } finally { busy = false; }
  }

  for (const [name, action] of Object.entries({
    home: () => showPanel(), add: () => showPanel('edit'), edit,
    random: randomProblem, resume, test, history, example: importExample,
  })) context.subscriptions.push(vscode.commands.registerCommand(`javaPractice.${name}`, () => guard(action)));

  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);
  status.text = '$(code) Java Practice';
  status.command = 'javaPractice.home';
  status.tooltip = 'Open your problem bank and practice controls';
  status.show();
  context.subscriptions.push(status);
}

module.exports = { activate };
