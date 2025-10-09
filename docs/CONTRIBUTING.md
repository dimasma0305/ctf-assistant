# Contributing to CTF Assistant Documentation

Thank you for your interest in improving the CTF Assistant documentation!

## Documentation Structure

The documentation is organized as follows:

```
docs/
├── README.md                 # Main documentation homepage
├── commands/
│   └── ctftime.md           # CTFTime commands reference
├── requirements.txt         # Python dependencies for building docs
└── CONTRIBUTING.md          # This file
```

## Building Documentation Locally

### Prerequisites

- Python 3.x
- pip (Python package manager)

### Setup

1. Install documentation dependencies:
   ```bash
   pip install -r docs/requirements.txt
   ```

2. Serve the documentation locally:
   ```bash
   npm run docs:serve
   # or directly:
   mkdocs serve
   ```

3. Open your browser to `http://127.0.0.1:8000`

The local server will auto-reload when you make changes to documentation files.

### Building for Production

To build static HTML files:

```bash
npm run docs:build
# or directly:
mkdocs build
```

The built site will be in the `site/` directory.

## Writing Documentation

### Markdown Files

All documentation is written in Markdown with support for:

- **Code blocks** with syntax highlighting
- **Tables** for structured data
- **Admonitions** for notes, warnings, tips
- **Emoji** using `:emoji_name:` syntax
- **Internal links** to other documentation pages

### Style Guide

1. **Be Clear and Concise**: Users should understand quickly
2. **Provide Examples**: Show real command usage
3. **Include Screenshots**: When applicable (not yet implemented)
4. **Use Consistent Formatting**:
   - Commands in code blocks: `` `/ctftime current` ``
   - Parameters in italic: `*optional*`
   - Important notes in bold: `**Note:**`

### Adding New Pages

1. Create a new `.md` file in the appropriate directory
2. Update `mkdocs.yml` navigation section:
   ```yaml
   nav:
     - Home: README.md
     - Your New Page: path/to/page.md
   ```
3. Build and test locally
4. Submit a pull request

## Automated Deployment

Documentation is automatically built and deployed via GitHub Actions when:
- Changes are pushed to the `main` branch
- Changes affect files in `docs/` or `mkdocs.yml`

The workflow:
1. Installs Python and MkDocs dependencies
2. Builds the documentation with strict mode
3. Deploys to GitHub Pages

See `.github/workflows/docs.yml` for details.

## Pull Request Process

1. **Fork** the repository
2. **Create a branch** for your changes:
   ```bash
   git checkout -b docs/improve-ctftime-section
   ```
3. **Make your changes** following the style guide
4. **Test locally** using `mkdocs serve`
5. **Commit** with clear messages:
   ```bash
   git commit -m "docs: improve CTFTime schedule command examples"
   ```
6. **Push** to your fork:
   ```bash
   git push origin docs/improve-ctftime-section
   ```
7. **Open a Pull Request** with:
   - Clear description of changes
   - Screenshots if visual changes
   - Links to relevant issues

## Reporting Issues

Found a problem with the documentation?

1. Check [existing issues](https://github.com/dimasma0305/ctf-assistant/issues)
2. Open a new issue with:
   - Clear title (e.g., "Docs: Missing example for rebind command")
   - Description of the problem
   - Suggested improvement (if any)
   - Affected page/section

## Documentation Standards

### Command Documentation

When documenting commands, include:

1. **Syntax**: The command format with parameters
2. **Parameters**: List each parameter with type and description
3. **Permissions**: Who can use the command
4. **Examples**: At least 2-3 real-world examples
5. **What it does**: Step-by-step explanation
6. **Use Cases**: When to use this command
7. **Important Notes**: Warnings, caveats, tips

### Code Examples

Use fenced code blocks with language specification:

````markdown
```bash
npm run docs:serve
```
````

For Discord commands:
````markdown
```
/ctftime schedule id:2584
```
````

### Links

- **Internal links**: Use relative paths
  ```markdown
  [CTFTime Commands](commands/ctftime.md)
  ```
  
- **External links**: Use full URLs
  ```markdown
  [CTFTime.org](https://ctftime.org)
  ```

### Admonitions

Use MkDocs admonitions for special notes:

```markdown
!!! note
    This is a note

!!! warning
    This is a warning

!!! tip
    This is a helpful tip
```

## Questions?

- Open an issue for documentation questions
- Join the TCP1P Discord server
- Check the [MkDocs documentation](https://www.mkdocs.org)

Thank you for contributing! 🎉

