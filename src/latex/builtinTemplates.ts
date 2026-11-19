import type { TemplateManifest } from '../types/latex';
import { scanLatexTemplate } from './templateScanner';

export interface BuiltinTemplateDef {
  id: string;
  name: string;
  description: string;
  entryFile: string;
  source: string;
}

/**
 * 1. Springer Nature Official Structure (`sn-jnl`)
 * Exact official `sn-jnl` document class layout (compatible with Springer Nature's
 * sn-article-template.zip and TeX Live's sn-jnl package).
 */
export const SPRINGER_NATURE_SNJNL_TEX = `\\documentclass[pdflatex,sn-mathphys-num]{sn-jnl}

\\usepackage{graphicx}
\\usepackage{multirow}
\\usepackage{amsmath,amssymb,amsfonts}
\\usepackage{amsthm}
\\usepackage{mathrsfs}
\\usepackage[title]{appendix}
\\usepackage{xcolor}
\\usepackage{textcomp}
\\usepackage{booktabs}
\\usepackage{hyperref}

\\raggedbottom

\\begin{document}

\\title[Article Short Title]{Full Scientific Article Title}

\\author*[1,2]{\\fnm{First} \\sur{Author}}\\email{iauthor@institution.edu}
\\author[2]{\\fnm{Second} \\sur{Author}}\\email{iiauthor@institution.edu}
\\equalcont{These authors contributed equally to this work.}

\\affil*[1]{\\orgdiv{Department of Research}, \\orgname{University Name}, \\orgaddress{\\city{City}, \\country{Country}}}
\\affil[2]{\\orgdiv{Institute of Science}, \\orgname{Partner Organization}, \\orgaddress{\\city{City}, \\country{Country}}}

\\abstract{Write a concise summary of the background, methodology, principal findings, and conclusions of your study.}

\\keywords{keyword1, keyword2, keyword3, keyword4}

\\maketitle

\\section{Introduction}\\label{sec:intro}

Introduce the scientific problem, review the state of the art, and state the main contributions of this study.

\\section{Results}\\label{sec:results}

Present the primary experimental or computational findings clearly, referencing figures and tables.

\\section{Discussion}\\label{sec:discussion}

Interpret the findings, compare with prior literature, and address limitations and broader implications.

\\section{Methods}\\label{sec:methods}

Detail the experimental protocol, datasets, mathematical models, and statistical analyses so the work is reproducible.

\\section{Conclusion}\\label{sec:conclusion}

Summarize the key takeaways and directions for future research.

\\backmatter

\\bmhead{Supplementary information}

If your article has accompanying supplementary files please state so here.

\\bmhead{Acknowledgements}

Acknowledge colleagues, funding agencies, and technical support.

\\section*{Declarations}

\\begin{itemize}
  \\item Funding
  \\item Conflict of interest/Competing interests
  \\item Data availability
\\end{itemize}

\\begin{appendices}
\\section{Supplementary Details}
Additional mathematical derivations or tables.
\\end{appendices}

\\bibliography{references}

\\end{document}
`;

/**
 * 2. Springer Nature Standalone (`article` + `authblk` + `natbib`)
 * Mirrors the exact section order and editorial typography of Springer Nature
 * journals while compiling cleanly out of the box on ANY TeX Live installation
 * even if `sn-jnl.cls` is not yet copied into the project folder.
 */
export const SPRINGER_NATURE_COMPAT_TEX = `\\documentclass[11pt,a4paper]{article}

\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[margin=1in]{geometry}
\\usepackage{authblk}
\\usepackage{amsmath,amssymb,amsfonts}
\\usepackage{graphicx}
\\usepackage{booktabs}
\\usepackage[numbers,sort&compress]{natbib}
\\usepackage{hyperref}
\\usepackage{xcolor}
\\usepackage{lineno}

\\hypersetup{colorlinks=true,linkcolor=blue!60!black,citecolor=blue!60!black,urlcolor=blue!60!black}

\\newcommand{\\keywords}[1]{\\par\\noindent\\textbf{Keywords:} #1\\par\\vspace{1em}}
\\newcommand{\\bmhead}[1]{\\subsection*{#1}}

\\title{Full Scientific Article Title}

\\author[1]{First Author\\thanks{Corresponding author: \\texttt{author@institution.edu}}}
\\affil[1]{Department of Research, University Name, City, Country}

\\date{\\today}

\\begin{document}

\\maketitle

\\begin{abstract}
Write a concise summary of the background, methodology, principal findings, and conclusions of your study.
\\end{abstract}

\\keywords{keyword1, keyword2, keyword3}

\\section{Introduction}\\label{sec:intro}

Introduce the scientific problem and research objectives.

\\section{Results}\\label{sec:results}

Present experimental results and key analyses.

\\section{Discussion}\\label{sec:discussion}

Interpret your results in the context of prior work.

\\section{Methods}\\label{sec:methods}

Describe experimental design, data acquisition, and statistical methods.

\\section{Conclusion}\\label{sec:conclusion}

Summarize the main conclusions and future work.

\\bmhead{Acknowledgements}

Acknowledge contributors and support.

\\section*{Declarations}

Funding, conflicts of interest, and data availability statements.

\\bibliographystyle{unsrtnat}
\\bibliography{references}

\\end{document}
`;

/**
 * 3. IEEE Conference / Journal Two-Column (`IEEEtran`)
 */
export const IEEE_TRAN_TEX = `\\documentclass[conference]{IEEEtran}

\\usepackage{cite}
\\usepackage{amsmath,amssymb,amsfonts}
\\usepackage{graphicx}
\\usepackage{booktabs}
\\usepackage{hyperref}

\\begin{document}

\\title{Conference Paper Title}

\\author{
\\IEEEauthorblockN{First Author}
\\IEEEauthorblockA{Department of Engineering, University Name\\\\author@institution.edu}
}

\\maketitle

\\begin{abstract}
Concise summary of the problem, proposed method, and main quantitative results.
\\end{abstract}

\\begin{IEEEkeywords}
keyword1, keyword2, keyword3
\\end{IEEEkeywords}

\\section{Introduction}\\label{sec:intro}

Motivation and contributions.

\\section{Related Work}\\label{sec:related}

Prior literature and positioning.

\\section{Methods}\\label{sec:methods}

Proposed methodology and system architecture.

\\section{Results}\\label{sec:results}

Experimental setup and evaluation results.

\\section{Discussion}\\label{sec:discussion}

Analysis and limitations.

\\section{Conclusion}\\label{sec:conclusion}

Concluding remarks.

\\section*{Acknowledgments}

Funding and acknowledgments.

\\bibliographystyle{IEEEtran}
\\bibliography{references}

\\end{document}
`;

/**
 * 4. Standard IMRaD Scientific Article (`article`)
 */
export const STANDARD_IMRAD_TEX = `\\documentclass[11pt]{article}

\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[margin=1in]{geometry}
\\usepackage{authblk}
\\usepackage{amsmath,amssymb}
\\usepackage{graphicx}
\\usepackage{booktabs}
\\usepackage[numbers,sort&compress]{natbib}
\\usepackage{hyperref}

\\title{Untitled Scientific Manuscript}

\\author[1]{First Author}
\\affil[1]{Department of Research, University Name}

\\date{\\today}

\\begin{document}

\\maketitle

\\begin{abstract}
Brief summary of the study.
\\end{abstract}

\\section{Introduction}\\label{sec:intro}

Background and rationale.

\\section{Methods}\\label{sec:methods}

Materials and methods.

\\section{Results}\\label{sec:results}

Key findings.

\\section{Discussion}\\label{sec:discussion}

Interpretation and implications.

\\section{Conclusion}\\label{sec:conclusion}

Summary of conclusions.

\\section*{Acknowledgments}

Acknowledgments.

\\bibliographystyle{plainnat}
\\bibliography{references}

\\end{document}
`;

export const BUILTIN_TEMPLATES: BuiltinTemplateDef[] = [
  {
    id: 'springer-nature-compat',
    name: 'Springer Nature (Ready-to-Compile)',
    description:
      'Springer Nature IMRaD+Declarations structure using standard TeX Live packages — compiles to PDF immediately with zero missing .cls files.',
    entryFile: 'main.tex',
    source: SPRINGER_NATURE_COMPAT_TEX,
  },
  {
    id: 'springer-nature-snjnl',
    name: 'Springer Nature Official (sn-jnl)',
    description:
      'Official Springer Nature sn-jnl class syntax (\\fnm/\\sur/\\affil/\\abstract{}/\\bmhead). Add sn-jnl.cls or import Springer Nature’s template .zip.',
    entryFile: 'sn-article.tex',
    source: SPRINGER_NATURE_SNJNL_TEX,
  },
  {
    id: 'ieee-twocolumn',
    name: 'IEEE Two-Column (IEEEtran)',
    description: 'Standard two-column IEEEtran conference/transactions format.',
    entryFile: 'main.tex',
    source: IEEE_TRAN_TEX,
  },
  {
    id: 'standard-imrad',
    name: 'Standard IMRaD Article',
    description: 'Clean single-column scientific manuscript (Introduction → Methods → Results → Discussion).',
    entryFile: 'main.tex',
    source: STANDARD_IMRAD_TEX,
  },
];

export function getBuiltinTemplateManifest(id: string): TemplateManifest {
  const found = BUILTIN_TEMPLATES.find((t) => t.id === id) ?? BUILTIN_TEMPLATES[0];
  return scanLatexTemplate(found.source, {
    id: found.id,
    name: found.name,
    entryFile: found.entryFile,
  });
}
