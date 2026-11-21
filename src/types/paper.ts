export type SectionRole =
  | 'abstract'
  | 'introduction'
  | 'related_work'
  | 'methods'
  | 'results'
  | 'discussion'
  | 'conclusion'
  | 'acknowledgments'
  | 'declarations'
  | 'supplementary'
  | 'appendix'
  | 'custom';

export type SectionStatus = 'outline' | 'draft' | 'revised' | 'final';

export interface AuthorAffiliation {
  id: string;
  department: string;
  institution: string;
  city: string;
  state?: string;
  postcode?: string;
  country: string;
}

export interface PaperAuthor {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  orcid?: string;
  affiliationIds: string[];
  corresponding: boolean;
  equalContribution?: boolean;
}

export interface PaperDeclarations {
  funding: string;
  conflictOfInterest: string;
  ethicsApproval: string;
  dataAvailability: string;
  codeAvailability: string;
  authorContributions: string;
}

export interface PaperFrontMatter {
  title: string;
  shortTitle: string;
  subtitle?: string;
  date: string;
  preprintNote?: string;
  authors: PaperAuthor[];
  affiliations: AuthorAffiliation[];
  keywords: string[];
  highlights: string[];
  declarations: PaperDeclarations;
}

export interface PaperSection {
  id: string;
  title: string;
  role: SectionRole;
  /** Relative filename inside sections/, e.g., "01-abstract.md" */
  fileName: string;
  /** Resolved absolute path at runtime */
  path: string;
  status: SectionStatus;
  wordLimit?: number;
  notes?: string;
  /** Whether this section belongs in backmatter/appendices */
  isBackMatter?: boolean;
  /** Starred (unnumbered) section in LaTeX, e.g., \section*{Acknowledgments} */
  starred?: boolean;
  /** Runtime parsed subsection titles (`##` and `###`) */
  subsections?: SubsectionHeading[];
  /** Runtime word count */
  wordCount?: number;
}

export interface SubsectionHeading {
  index: number;
  level: 2 | 3;
  title: string;
}

export interface ExtraNoteFile {
  id: string;
  title: string;
  fileName: string;
  path: string;
}

export interface ProjectFigureFile {
  name: string;
  relPath: string;
  label: string;
  title: string;
}

export interface PaperComment {
  id: string;
  quote: string;
  text: string;
  createdAt: string;
  resolved?: boolean;
}

export interface PaperSnapshot {
  id: string;
  sectionPath: string;
  timestamp: string;
  label: string;
  wordCount: number;
  content: string;
}

export interface GlossaryEntry {
  id: string;
  term: string;
  expansion: string;
  kind: 'acronym' | 'symbol' | 'term';
  notes?: string;
}

export interface ZoteroLinkConfig {
  enabled: boolean;
  port: number;
  watchedBibPath?: string;
}

export interface PaperProject {
  version: 1;
  name: string;
  preset: 'springer-nature' | 'imrad' | 'ieee-cs' | 'custom';
  createdAt: string;
  updatedAt: string;
  targetTotalWords?: number;
  sections: PaperSection[];
  extraFiles: ExtraNoteFile[];
  /** Active template directory name inside templates/ (e.g., "springer-nature") */
  activeTemplateId: string;
  /** Explicit slot-id -> section-id mapping overrides for template export */
  templateSlotMap: Record<string, string>;
  /** Custom LaTeX citation style override or 'auto' */
  citationCommandMode: 'auto' | 'cite' | 'citep' | 'autocite';
  glossary: GlossaryEntry[];
  customDictionary: string[];
  comments: Record<string, PaperComment[]>;
  snapshots?: PaperSnapshot[];
  gitRemoteUrl?: string;
  zotero: ZoteroLinkConfig;
}

export const SECTION_ROLE_LABELS: Record<SectionRole, string> = {
  abstract: 'Abstract',
  introduction: 'Introduction',
  related_work: 'Related Work',
  methods: 'Methods',
  results: 'Results',
  discussion: 'Discussion',
  conclusion: 'Conclusion',
  acknowledgments: 'Acknowledgements',
  declarations: 'Declarations',
  supplementary: 'Supplementary Information',
  appendix: 'Appendix',
  custom: 'Custom Section',
};

export function createDefaultFrontMatter(title = 'Untitled Scientific Manuscript'): PaperFrontMatter {
  return {
    title,
    shortTitle: title.slice(0, 48),
    date: new Date().toISOString().slice(0, 10),
    preprintNote: '',
    authors: [
      {
        id: 'author-1',
        firstName: 'First',
        lastName: 'Author',
        email: 'author@institution.edu',
        orcid: '',
        affiliationIds: ['affil-1'],
        corresponding: true,
        equalContribution: false,
      },
    ],
    affiliations: [
      {
        id: 'affil-1',
        department: 'Department of Research',
        institution: 'University Name',
        city: 'City',
        state: '',
        postcode: '',
        country: 'Country',
      },
    ],
    keywords: ['keyword1', 'keyword2', 'keyword3'],
    highlights: [],
    declarations: {
      funding: 'The authors declare that no funds, grants, or other support were received during the preparation of this manuscript.',
      conflictOfInterest: 'The authors have no relevant financial or non-financial interests to disclose.',
      ethicsApproval: '',
      dataAvailability: 'The datasets generated and/or analyzed during the current study are available from the corresponding author on reasonable request.',
      codeAvailability: '',
      authorContributions: '',
    },
  };
}
