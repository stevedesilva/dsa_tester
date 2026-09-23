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
Import the included **Relative Sort Array** example and click **Random Problem**
to begin. See the [extension README](cursor-practice/README.md) for WSL setup,
problem authoring, and storage details.

## Existing web application

The repository also contains the earlier FastAPI/React practice application.
Its architecture and setup notes are in [CLAUDE.md](CLAUDE.md).
