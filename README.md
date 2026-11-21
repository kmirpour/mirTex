# MirTex — Scientific Paper Writing & LaTeX Publishing Studio

A standalone, distraction-free desktop studio built specifically for writing, formatting, and publishing scientific papers. Inspired by Noveler's clean workspace, 13-theme zero-rerender palette system, and bulletproof local-first safety—purpose-built from the ground up for researchers.

Built with **Tauri 2 (Rust)** + **React 19** + **TipTap 3** + **KaTeX** + **Zustand** + **Vite**.

---

## Key Capabilities

### Paper-as-a-Folder Architecture
- **Structured Front Page**: Dedicated editor for Title, Short Title, Authors, Multi-Affiliations, ORCID, Corresponding Author, Equal Contribution, Keywords, Springer Nature Declarations, and Elsevier Highlights (`frontmatter.json`).
- **Modular Scientific Sections**: Clean Markdown files under `sections/` (`01-abstract.md`, `02-introduction.md`, `03-results.md`, `04-discussion.md`, `05-methods.md`, etc.) with expandable `##`/`###` subsection outlines, drag-to-reorder, drafting statuses, and journal word limits.
- **Bulletproof Safety**: Atomic writes, rate-limited rolling backups (`.mirtex/backups/`), named revision snapshots with Diff View, soft-delete to `graveyard/`, and native Git commit / GitHub push sync.

### LaTeX Template Inspector & Compilation Engine
- **Load Any Template**: Import a `.tex` file or journal `.zip` archive (e.g., Springer Nature's `sn-article-template.zip`, IEEE, Elsevier `elsarticle`, ACM `acmart`).
- **Automatic Slot Extraction**: Balanced-brace LaTeX parser scans `\documentclass`, packages, bibliography mode (`bibtex` vs `biblatex`), title, authors/affiliations, abstract (both `\begin{abstract}` and Springer Nature's `\abstract{...}`), keywords, body sections, `\bmhead`, declarations, and appendices—preserving exact source spans.
- **Visual Slot Mapping & Sync**: Inspect extracted slots alongside highlighted `.tex` source lines, remap sections, or click **Sync Paper Sections** to scaffold a paper matching the template.
- **Local TeX Live PDF Build**: Compiles directly with your installed `pdflatex` / `xelatex` / `lualatex` + `bibtex` / `biber`, parses `.log` errors/warnings, renders the compiled PDF side-by-side, and offers 1-click **Open in TeXstudio**.
- **Export Suite**: Overleaf/Journal `.zip`, single `.tex`, Academic `.docx`, and combined `.md`.

### Zotero 10 & Bibliography Management
- **Zero-Plugin Zotero 10 Live Search**: Connects directly to Zotero's built-in Local API (`http://127.0.0.1:23119`)—no Better BibTeX required! Enable *Settings → Advanced → Allow other applications on this computer to communicate with Zotero* in Zotero to search items and import entire collections directly into `references.bib`.
- **1-Click Add by DOI / PMID / arXiv ID**: Paste any DOI (`10.1038/...`), PubMed ID (`PMID:...`), or arXiv ID (`2305.12345`) to fetch clean BibTeX automatically.
- **In-Editor Autocomplete**: Type `[@` to cite papers or `@fig:` / `@tbl:` / `@eq:` / `@sec:` to cross-reference figures, tables, equations, and sections.

---

## Installing MirTex

### Pre-Built Installers (Recommended)

Download the latest installer for your operating system from the repository's **Releases** page:

- **Windows (x64):** `MirTex_*_x64-setup.exe` *(NSIS installer, recommended)* or `.msi`
- **macOS (Apple Silicon M1–M4):** `MirTex_*_aarch64.dmg`
- **macOS (Intel):** `MirTex_*_x64.dmg`
- **Linux:** `.AppImage` or `.deb`

> **Unsigned installer note:** Because pre-built community releases are not yet code-signed, Windows SmartScreen may ask you to click **More info → Run anyway**, and macOS Gatekeeper may require right-clicking the app and choosing **Open** on first launch.
>
> **Optional companions:** Install **TeX Live** (or MiKTeX) if you want local LaTeX PDF compilation, and enable Zotero's Local API (*Settings → Advanced → Allow other applications on this computer to communicate with Zotero*) to search **Zotero 10** directly.

---

## Development & Building

```bash
# Install frontend dependencies
npm install

# Run the MirTex desktop application in development mode
npm run tauri dev

# Run full quality check (TypeScript + ESLint + Vitest unit tests)
npm run check

# Run Rust backend unit tests
npm run test:rust

# Build production desktop installer / bundle for your current OS
npm run tauri build
```

---

## Automated Releases (GitHub Actions)

MirTex includes a release workflow at [`.github/workflows/release.yml`](.github/workflows/release.yml) powered by `tauri-apps/tauri-action`. It runs `npm run check`, builds native installers for **Windows (x64)**, **macOS (Apple Silicon & Intel)**, and **Linux**, and automatically publishes them to **GitHub Releases**.

### Publishing a New Release

1. Update the version number (for example, `0.1.0` → `0.2.0`) in all three files:
   - `package.json`
   - `src-tauri/tauri.conf.json`
   - `src-tauri/Cargo.toml`
2. Commit, tag, and push to GitHub:
   ```bash
   git add .
   git commit -m "Release v0.2.0"
   git tag v0.2.0
   git push origin main --tags
   ```
3. You can also trigger a build manually anytime from GitHub via **Actions → Release MirTex → Run workflow** (with an option to create the release as a draft).

> **Repository permission check:** The workflow declares `permissions: contents: write`. If GitHub Actions cannot create a release, check **Settings → Actions → General → Workflow permissions** on GitHub and ensure **Read and write permissions** is allowed.
