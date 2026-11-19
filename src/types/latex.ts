import type { SectionRole } from './paper';

export type KnownLatexClass =
  | 'sn-jnl'
  | 'IEEEtran'
  | 'elsarticle'
  | 'acmart'
  | 'revtex'
  | 'article'
  | 'generic';

export type BibSystem = 'bibtex' | 'biblatex' | 'none';
export type CitationDialect = 'cite' | 'natbib' | 'biblatex';

export type SlotKind =
  | 'title'
  | 'authors'
  | 'date'
  | 'abstract'
  | 'keywords'
  | 'highlights'
  | 'section'
  | 'backmatter_heading'
  | 'declarations'
  | 'appendix'
  | 'bibliography'
  | 'custom_env';

export interface ExtractedSlot {
  id: string;
  kind: SlotKind;
  label: string;
  /** Suggested semantic role for automatic matching with MirTex sections */
  suggestedRole?: SectionRole;
  /** Exact character offsets in the entrypoint .tex source */
  start: number;
  end: number;
  /** 1-based line numbers for display in Template Inspector */
  startLine: number;
  endLine: number;
  /** Original sample text or heading inside the template */
  sampleSnippet: string;
  /** For section slots: heading title & whether \section* */
  sectionTitle?: string;
  starred?: boolean;
  /** For abstract/keywords/env slots: whether command (\abstract{...}) or environment (\begin{abstract}...) */
  syntaxForm?: 'command' | 'environment' | 'block';
  /** Original command or environment name */
  commandName?: string;
  /** Optional label from \label{...} following a section */
  latexLabel?: string;
}

export interface TemplateFileAsset {
  /** Path relative to the template folder, e.g., "sn-jnl.cls" or "main.tex" */
  relativePath: string;
  isBinary: boolean;
  /** Text content for text assets (.tex, .cls, .sty, .bst) */
  textContent?: string;
}

export interface TemplateManifest {
  id: string;
  name: string;
  entryFile: string;
  documentClass: string;
  classOptions: string[];
  detectedAdapter: KnownLatexClass;
  packages: string[];
  bibSystem: BibSystem;
  citationDialect: CitationDialect;
  bibStyle?: string;
  bibResourceName?: string;
  hasCleveref: boolean;
  hasBooktabs: boolean;
  hasGraphicx: boolean;
  hasAmsmath: boolean;
  hasHyperref: boolean;
  preambleEndOffset: number;
  documentBeginOffset: number;
  documentEndOffset: number;
  slots: ExtractedSlot[];
  /** Supporting files alongside entryFile (cls, sty, bst, logos) */
  supportingFiles: string[];
  /** Raw source of entryFile for live inspection & patching */
  rawSource: string;
}

export interface LatexDiagnostic {
  severity: 'error' | 'warning';
  file: string;
  line: number | null;
  message: string;
}

export interface TexToolchainInfo {
  pdflatex: string | null;
  xelatex: string | null;
  lualatex: string | null;
  latexmk: string | null;
  bibtex: string | null;
  biber: string | null;
  texstudio_found: boolean;
  texworks_found: boolean;
}

export interface LatexCompileResult {
  success: boolean;
  engine_used: string;
  pdf_path: string | null;
  pdf_base64: string | null;
  diagnostics: LatexDiagnostic[];
  log: string;
  elapsed_ms: number;
}
