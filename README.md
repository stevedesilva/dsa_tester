# DSA Tester

## Java practice inside Cursor

The [Cursor practice extension](cursor-practice/README.md) provides a local Java
algorithm practice workflow:

- Add and edit problems through a structured form with manual input/output tests.
- Open one random problem at a time in Cursor's Java editor.
- Compile and test solutions with detailed results, timeouts, and cancellation.
- Save attempts and revisit them through history.

### Build and install

With Node.js 22+ and a JDK installed, run from `cursor-practice/`:

```bash
npm ci
npm run check
npm test
npm run package
```

In Cursor, install **Language Support for Java by Red Hat**, then run
**Extensions: Install from VSIX…** and select the generated
`cursor-practice/java-algorithm-practice-0.1.0.vsix`.

Open this repository in Cursor and run **Java Practice: Open Practice Panel**.
The existing problem bank and two saved attempts have been moved into this
repository's `.java-practice/` directory. Use **Resume Current Attempt** to
continue, or **Random Problem** to start again. Keep this repository as the
first folder in a multi-root workspace so the extension uses this bank.

For a fresh clone, import the included **Relative Sort Array** example if your
bank is empty. See the [extension README](cursor-practice/README.md) for WSL
setup, problem authoring, and storage details. Problem definitions are tracked
with Git; attempts and `active.json` are local, so back up `.java-practice/`
separately to preserve your solutions and history.

## Existing web application

The earlier FastAPI/React practice application is also self-contained here.
It generates questions with OpenAI, runs Python submissions, and saves Elo and
session history in `data/dsa.db`. Its Java/Go runners are stubs; use the Cursor
extension above for Java practice.

Requires Python 3.11+, [uv](https://docs.astral.sh/uv/), and Node.js 22+.
The Python runner uses Linux/POSIX resource limits (WSL is supported).

From the repository root:

```bash
uv sync
cp .env.example .env
# Set OPENAI_API_KEY in .env.
npm --prefix frontend ci
uv run dsa-tester
```

In another terminal, from the same root:

```bash
npm --prefix frontend run dev
```

Open http://localhost:5174; the API listens on http://127.0.0.1:8001.
The web application and Cursor extension keep separate practice data.

### Verification

```bash
uv run pytest tests/ -q
npm --prefix frontend run build
npm --prefix cursor-practice run check
npm --prefix cursor-practice test
```

Architecture notes are in [CLAUDE.md](CLAUDE.md).
