# Java Algorithm Practice for Cursor

A local, Java-only practice application inside Cursor. Add problems through a
structured form, open one random problem, write a solution using Cursor's Java
tooling, and run manually authored input/output tests.

## Install

1. Install a JDK. **JDK 21 or later is recommended** for current Java language
   tooling. Solutions are compiled with Java 17 compatibility (`javac --release 17`).
2. Install **Language Support for Java by Red Hat** (`redhat.java`) in Cursor.
   This extension declares it as a dependency. If Cursor cannot automatically
   obtain it from its extension catalog, install the Java extension first.
3. In Cursor, run **Extensions: Install from VSIX…** from the command palette.
   Select `java-algorithm-practice-0.1.0.vsix` from this directory.
4. Open the folder where you want to keep your problem bank (for example this
   `dsa_tester/` repository).
5. Run **Java Practice: Open Practice Panel** from the command palette.

If you are working in **WSL**, install/enable both extensions in the WSL extension
host and have your JDK installed in WSL. The Java compiler runs where the extension
host runs. This project was verified using Linux and JDK 21.

If Java is not on PATH, set `javaPractice.javaHome` to the JDK directory (not its
`bin` directory). The runner otherwise uses `JAVA_HOME`, then PATH. This setting is
separate from the Red Hat Java extension's own runtime settings.

### Build the VSIX yourself

From `dsa_tester/cursor-practice/`, using Node.js 22+:

```bash
npm ci
npm run check
npm test
npm run package
```

The packaged extension has no runtime npm dependencies. Node/npm are only needed
to develop or package it, not to use an installed VSIX.

## First practice session

1. Open the practice panel and click **Import Relative Sort Array**. This imports
   your supplied starter code and three example tests, without a solution.
2. Click **Random Problem**. The statement appears in the panel and `Solution.java`
   opens in the editor.
3. Wait for Java tooling to initialize. Write the missing algorithm.
4. Click **Run Tests**. The solution is saved, compiled, and executed against every
   case. The panel shows pass/fail, expected/actual output, errors, and elapsed time.
5. Click **Random Problem** for a fresh attempt. When multiple problems exist, the
   immediately previous problem is excluded from the next random draw.

**Open My Code** reopens your current Java file. **Show reference solution** reveals
the saved answer, when one was supplied. **History** lets you resume older
attempts. The source used for every run and its results are saved, including failed
runs. A result describes the saved code at test time; edit the code and run again
to get a new result.

The extension adds the current attempt as a separate folder in your Cursor
workspace so Java tooling recognizes its source path. Starting another attempt
replaces that generated workspace folder; your original workspace folder stays
first. Save the resulting multi-root workspace when Cursor prompts if you want to
reuse the layout. Keep your problem-bank folder first in the workspace.

## Add or update a problem

Click **Add Problem** and fill in:

- **Title**
- **Description and examples** (displayed as plain text, preserving line breaks)
- **Main class name**, usually `Solution` or `Main`
- **Java starter code**, including `public static void main(String[] args)`
- **Time limit**, in milliseconds per test (default 2000)
- **Reference solution** (optional Java code and/or explanation; revealed on demand during practice)
- One or more **standard input / expected output** pairs

For Relative Sort Array, enter this as one test's standard input:

```text
2 3 1 3 2 4 6 7 9 2 19
2 1 4 3 9 6
```

And this as its expected output:

```text
2 2 2 1 4 3 3 9 6 7 19
```

Enter raw text rather than `Input:` / `Output:` labels. Input is sent exactly as
entered, then stdin is closed. Use actual blank lines when an empty array needs a
line of its own. Empty input and empty expected output are valid test values.

Use **Edit** beside a saved problem to update its statement, starter, reference solution, or tests.
Reference solutions are stored in the problem JSON's `solution` field alongside the tests.
Changes apply to **new attempts**; existing attempts retain their original problem
snapshot. Start a fresh random attempt to practice against updated tests.

### Problem contract

- One Java source file, with no package declaration. Helper classes can be in that
  same file. The configured main class must contain the entry point.
- Use the Java standard library. External dependencies and additional source files
  are not supported in this first version.
- Read from stdin and write the answer to stdout. Debug output belongs on stderr.
- Output comparison ignores whitespace differences (spaces, newlines, trailing
  whitespace), but preserves token order, spelling, and case. For example,
  `1 2` matches `1\n2`, but not `[1, 2]` or `2 1`.
- Each test runs in a fresh JVM with a 256 MiB maximum heap. The per-test timeout
  includes JVM startup; this is a correctness tool, not a microbenchmark.
- Compilation has a 30-second timeout. Stdout and stderr together are limited to
  256 KiB per process. Cancel through the panel or progress notification.
- Expected outputs are deterministic. Problems allowing multiple valid answers
  need a canonical output format enforced by their starter harness.
- These are local Java processes running with your user permissions, not a hosted
  execution sandbox.

## Java completion without AI answers

The Red Hat Java extension supplies method/type completion, parameter hints, and
inline diagnostics. If completion does not initialize, verify its configured JDK
and use **Java: Clean Java Language Server Workspace** to reload Java tooling.

In Cursor's settings, disable **Cursor Tab** during practice and avoid invoking
AI generation. Exact settings labels vary by Cursor version. This application
does not call AI services or require an API key, and it does not change your
global Cursor settings.

## Local files and backups

Files live under the **first workspace folder**:

```text
.java-practice/
  problems/<id>.json                 # Editable problem bank
  active.json                       # Current attempt ID
  attempts/<id>/
    attempt.json                    # Original problem + latest run summary
    PROBLEM.md                      # Statement copy
    .vscode/settings.json           # Java source/output paths
    src/Solution.java               # Your working solution
    runs/<run-id>/
      Solution.java                 # Exact submitted code
      results.json                  # Detailed test results
```

Back up `problems/` with Git. In this `dsa_tester/` repository, attempts and
`active.json` are gitignored. Back up the entire `.java-practice/` directory if you
want to preserve your practice history too. Delete a problem's JSON file to remove
it from future random selection; existing attempt snapshots remain usable.

## Commands

All commands are available in Cursor's command palette with the **Java Practice:**
prefix: Open Practice Panel, Add Problem, Edit Problem, Random Problem, Resume
Current Attempt, Run Tests, Attempt History, Import Relative Sort Array Example.

## Development and verification

Open this extension directory in Cursor and run the **Run Java Practice Extension**
launch configuration (F5) to start an extension development host. Open a practice
folder there and invoke the commands above.

`npm test` exercises real `javac`/`java` processes, including successful solutions,
wrong answers, compilation errors, exceptions, infinite loops, output limits,
cancellation, and missing JDK diagnostics. It also tests problem persistence,
immutable attempt snapshots, run history, validation, and random selection.

Interactive smoke check in Cursor:

1. Import the example, open a random attempt, and confirm Java method completion.
2. Run the untouched starter: all three example tests should fail.
3. Implement the algorithm and verify the tests pass.
4. Add/edit a problem using the form; check failed form validation preserves input.
5. Start another attempt, reopen history, and confirm the old code/results remain.
6. Try an infinite loop and cancel it; confirm the panel remains usable.
