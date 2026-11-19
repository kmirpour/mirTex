/**
 * Maps Unicode scientific symbols (Greek letters, math operators, inequalities,
 * arrows, minus signs, superscripts/subscripts, typography) to portable LaTeX
 * commands so manuscripts compile cleanly across pdfLaTeX, XeLaTeX, and LuaLaTeX
 * without "Unicode character not set up for use with LaTeX" errors.
 */

const MATH_SYMBOL_MAP: Record<string, string> = {
  // Lowercase Greek
  'α': '\\alpha',
  'β': '\\beta',
  'γ': '\\gamma',
  'δ': '\\delta',
  'ε': '\\varepsilon',
  'ϵ': '\\epsilon',
  'ζ': '\\zeta',
  'η': '\\eta',
  'θ': '\\theta',
  'ϑ': '\\vartheta',
  'ι': '\\iota',
  'κ': '\\kappa',
  'λ': '\\lambda',
  'μ': '\\mu',
  'µ': '\\mu', // micro sign U+00B5
  'ν': '\\nu',
  'ξ': '\\xi',
  'π': '\\pi',
  'ϖ': '\\varpi',
  'ρ': '\\rho',
  'ϱ': '\\varrho',
  'σ': '\\sigma',
  'ς': '\\varsigma',
  'τ': '\\tau',
  'υ': '\\upsilon',
  'φ': '\\varphi',
  'ϕ': '\\phi',
  'χ': '\\chi',
  'ψ': '\\psi',
  'ω': '\\omega',

  // Uppercase Greek
  'Γ': '\\Gamma',
  'Δ': '\\Delta',
  'Θ': '\\Theta',
  'Λ': '\\Lambda',
  'Ξ': '\\Xi',
  'Π': '\\Pi',
  'Σ': '\\Sigma',
  'Υ': '\\Upsilon',
  'Φ': '\\Phi',
  'Ψ': '\\Psi',
  'Ω': '\\Omega',
  'Ω': '\\Omega', // ohm sign U+2126

  // Math operators, relations & symbols
  '−': '-', // Unicode minus U+2212
  '±': '\\pm',
  '∓': '\\mp',
  '×': '\\times',
  '÷': '\\div',
  '·': '\\cdot',
  '⋅': '\\cdot',
  '≤': '\\leq',
  '≥': '\\geq',
  '≠': '\\neq',
  '≈': '\\approx',
  '≡': '\\equiv',
  '∼': '\\sim',
  '≃': '\\simeq',
  '≅': '\\cong',
  '∝': '\\propto',
  '≪': '\\ll',
  '≫': '\\gg',
  '∞': '\\infty',
  '∂': '\\partial',
  '∇': '\\nabla',
  '∑': '\\sum',
  '∏': '\\prod',
  '∫': '\\int',
  '√': '\\surd',
  '∈': '\\in',
  '∉': '\\notin',
  '⊂': '\\subset',
  '⊃': '\\supset',
  '⊆': '\\subseteq',
  '⊇': '\\supseteq',
  '∪': '\\cup',
  '∩': '\\cap',
  '∀': '\\forall',
  '∃': '\\exists',
  '∅': '\\emptyset',
  '¬': '\\neg',
  '∧': '\\wedge',
  '∨': '\\vee',
  '⊥': '\\perp',
  '∥': '\\parallel',
  '∠': '\\angle',
  '°': '^{\\circ}',
  '′': "'",
  '″': "''",
  '→': '\\rightarrow',
  '←': '\\leftarrow',
  '↔': '\\leftrightarrow',
  '⇒': '\\Rightarrow',
  '⇐': '\\Leftarrow',
  '⇔': '\\Leftrightarrow',
  '↑': '\\uparrow',
  '↓': '\\downarrow',
  '↦': '\\mapsto',
  '★': '\\star',
  '†': '\\dagger',
  '‡': '\\ddagger',
};

const TEXT_PUNCTUATION_MAP: Record<string, string> = {
  '\u00A0': '~', // non-breaking space
  '\u2009': '\\,', // thin space
  '\u202F': '\\,', // narrow no-break space
  '\u200B': '', // zero-width space
  '\u200C': '',
  '\u200D': '',
  '\uFEFF': '',
  '–': '--',
  '—': '---',
  '…': '\\ldots{}',
  '“': '``',
  '”': "''",
  '‘': '`',
  '’': "'",
  '•': '\\textbullet{}',
  '§': '\\S{}',
  '©': '\\copyright{}',
  '®': '\\textregistered{}',
  '™': '\\texttrademark{}',
  '‰': '\\textperthousand{}',
  '⁰': '\\textsuperscript{0}',
  '¹': '\\textsuperscript{1}',
  '²': '\\textsuperscript{2}',
  '³': '\\textsuperscript{3}',
  '⁴': '\\textsuperscript{4}',
  '⁵': '\\textsuperscript{5}',
  '⁶': '\\textsuperscript{6}',
  '⁷': '\\textsuperscript{7}',
  '⁸': '\\textsuperscript{8}',
  '⁹': '\\textsuperscript{9}',
  '⁺': '\\textsuperscript{+}',
  '⁻': '\\textsuperscript{$-$}',
  '₀': '\\textsubscript{0}',
  '₁': '\\textsubscript{1}',
  '₂': '\\textsubscript{2}',
  '₃': '\\textsubscript{3}',
  '₄': '\\textsubscript{4}',
  '₅': '\\textsubscript{5}',
  '₆': '\\textsubscript{6}',
  '₇': '\\textsubscript{7}',
  '₈': '\\textsubscript{8}',
  '₉': '\\textsubscript{9}',
};

const MATH_SUP_SUB_MAP: Record<string, string> = {
  '⁰': '^0',
  '¹': '^1',
  '²': '^2',
  '³': '^3',
  '⁴': '^4',
  '⁵': '^5',
  '⁶': '^6',
  '⁷': '^7',
  '⁸': '^8',
  '⁹': '^9',
  '⁺': '^+',
  '⁻': '^-',
  '₀': '_0',
  '₁': '_1',
  '₂': '_2',
  '₃': '_3',
  '₄': '_4',
  '₅': '_5',
  '₆': '_6',
  '₇': '_7',
  '₈': '_8',
  '₉': '_9',
  '\u00A0': ' ',
  '\u2009': '\\,',
  '\u200B': '',
  '\uFEFF': '',
  '–': '-',
  '—': '-',
  '’': "'",
  '‘': "'",
};

/**
 * Converts Unicode Greek/math symbols and typographic characters in plain LaTeX
 * text mode (prose, titles, keywords, BibTeX fields) into engine-independent LaTeX.
 */
export function unicodeToLatexText(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch in TEXT_PUNCTUATION_MAP) {
      out += TEXT_PUNCTUATION_MAP[ch];
    } else if (ch in MATH_SYMBOL_MAP) {
      const cmd = MATH_SYMBOL_MAP[ch];
      out += `$${cmd}$`;
    } else {
      out += ch;
    }
  }
  return out;
}

/**
 * Converts Unicode Greek/math symbols inside LaTeX math mode (`$...$` / `$$...$$`)
 * without adding extra `$...$` wrappers. Inserts a separating space after control
 * words when immediately followed by an ASCII letter (e.g., `αx` -> `\alpha x`).
 */
export function unicodeToLatexMath(expr: string): string {
  let out = '';
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
    if (ch in MATH_SYMBOL_MAP) {
      const cmd = MATH_SYMBOL_MAP[ch];
      const next = expr[i + 1] ?? '';
      const needsSpace = cmd.startsWith('\\') && /[a-zA-Z]$/.test(cmd) && /[a-zA-Z]/.test(next);
      out += needsSpace ? `${cmd} ` : cmd;
    } else if (ch in MATH_SUP_SUB_MAP) {
      out += MATH_SUP_SUB_MAP[ch];
    } else {
      out += ch;
    }
  }
  return out;
}

/**
 * Sanitizes a LaTeX math expression (inline `$...$` or display `$$...$$`):
 * 1. Converts Unicode Greek/math characters (`α`, `β`, `−`, `≤`, `±`, etc.) into LaTeX math commands.
 * 2. Escapes bare `%` into `\%` so `$-67.8%$` never starts a LaTeX comment (which breaks LuaLaTeX,
 *    pdfLaTeX, XeLaTeX, and KaTeX!). In display math, preserves genuine full-line `%` comments.
 */
export function sanitizeLatexMath(expr: string, isDisplay = false): string {
  let out = unicodeToLatexMath(expr);
  if (isDisplay) {
    // Only escape `%` that follows a non-whitespace token (e.g. `67.8%`), keeping `% comment` lines intact
    out = out.replace(/(?<=\S)(?<!\\)%/g, '\\%');
  } else {
    // Inline math is single-line; every unescaped `%` is a literal percent sign (e.g. `$-67.8%$`)
    out = out.replace(/(?<!\\)%/g, '\\%');
  }
  return out;
}
