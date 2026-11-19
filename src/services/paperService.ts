import {
  createDefaultFrontMatter,
  type PaperFrontMatter,
  type PaperProject,
  type PaperSection,
  type PaperSnapshot,
  type SectionRole,
} from '../types/paper';
import type { TemplateManifest } from '../types/latex';
import { slugifySectionName } from '../utils/paperOutline';
import * as fileService from './fileService';

export const PROJECT_CONFIG_FILE = 'mirtex.json';
export const FRONTMATTER_FILE = 'frontmatter.json';
export const BIB_FILE = 'references.bib';
export const SCRATCHPAD_FILE = 'scratchpad.md';
export const GRAVEYARD_DIR = 'graveyard';

interface PresetSectionSpec {
  title: string;
  role: SectionRole;
  wordLimit?: number;
  isBackMatter?: boolean;
  starred?: boolean;
  starterBody: string;
}

const PRESET_SECTIONS: Record<PaperProject['preset'], PresetSectionSpec[]> = {
  'springer-nature': [
    {
      title: 'Abstract',
      role: 'abstract',
      wordLimit: 250,
      starterBody:
        '# Abstract\n\nSummarize the scientific motivation, experimental or computational methodology, principal findings, and broader significance of your study in 150–250 words.\n',
    },
    {
      title: 'Introduction',
      role: 'introduction',
      starterBody:
        '# Introduction\n\nIntroduce the background, open scientific problem, and key hypotheses or contributions of this work. Cite foundational studies using `[@key]` or press `Ctrl+Shift+C`.\n',
    },
    {
      title: 'Results',
      role: 'results',
      starterBody:
        '# Results\n\nPresent your quantitative and qualitative findings clearly. Insert figures, tables, and numbered equations such as:\n\n$$\nE = mc^2\n$$ {#eq:main}\n',
    },
    {
      title: 'Discussion',
      role: 'discussion',
      starterBody:
        '# Discussion\n\nInterpret your findings in the context of existing literature, discuss strengths and limitations, and outline implications.\n',
    },
    {
      title: 'Methods',
      role: 'methods',
      starterBody:
        '# Methods\n\n## Study Design & Data Acquisition\n\nProvide sufficient methodological detail for independent replication.\n\n## Statistical Analysis\n\nSpecify statistical models, software versions, and significance thresholds.\n',
    },
    {
      title: 'Conclusion',
      role: 'conclusion',
      starterBody: '# Conclusion\n\nConcisely state the main conclusions and future directions.\n',
    },
    {
      title: 'Acknowledgements',
      role: 'acknowledgments',
      isBackMatter: true,
      starred: true,
      starterBody: '# Acknowledgements\n\nAcknowledge colleagues, facilities, and funding support.\n',
    },
  ],
  imrad: [
    {
      title: 'Abstract',
      role: 'abstract',
      wordLimit: 250,
      starterBody: '# Abstract\n\nWrite a concise summary of the paper.\n',
    },
    {
      title: 'Introduction',
      role: 'introduction',
      starterBody: '# Introduction\n\nBackground, motivation, and study objectives.\n',
    },
    {
      title: 'Methods',
      role: 'methods',
      starterBody: '# Methods\n\nMaterials, experimental setup, and analytical pipeline.\n',
    },
    {
      title: 'Results',
      role: 'results',
      starterBody: '# Results\n\nPrimary experimental findings.\n',
    },
    {
      title: 'Discussion',
      role: 'discussion',
      starterBody: '# Discussion\n\nInterpretation, comparisons, and limitations.\n',
    },
    {
      title: 'Conclusion',
      role: 'conclusion',
      starterBody: '# Conclusion\n\nKey takeaways.\n',
    },
  ],
  'ieee-cs': [
    {
      title: 'Abstract',
      role: 'abstract',
      wordLimit: 200,
      starterBody: '# Abstract\n\nProblem statement, proposed method, and main quantitative results.\n',
    },
    {
      title: 'Introduction',
      role: 'introduction',
      starterBody: '# Introduction\n\nMotivation and bulleted list of contributions.\n',
    },
    {
      title: 'Related Work',
      role: 'related_work',
      starterBody: '# Related Work\n\nSurvey of closely related literature.\n',
    },
    {
      title: 'Methods',
      role: 'methods',
      starterBody: '# Methods\n\nFormal problem definition and proposed approach.\n',
    },
    {
      title: 'Results',
      role: 'results',
      starterBody: '# Results\n\nDatasets, baselines, ablations, and empirical performance.\n',
    },
    {
      title: 'Discussion',
      role: 'discussion',
      starterBody: '# Discussion\n\nError analysis and limitations.\n',
    },
    {
      title: 'Conclusion',
      role: 'conclusion',
      starterBody: '# Conclusion\n\nSummary and future work.\n',
    },
  ],
  custom: [
    {
      title: 'Abstract',
      role: 'abstract',
      wordLimit: 250,
      starterBody: '# Abstract\n\nSummary of the work.\n',
    },
    {
      title: 'Introduction',
      role: 'introduction',
      starterBody: '# Introduction\n\nStart drafting here.\n',
    },
  ],
};

function makeId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export function buildSectionsFromPreset(
  projectPath: string,
  preset: PaperProject['preset']
): { sections: PaperSection[]; initialContents: Record<string, string> } {
  const specs = PRESET_SECTIONS[preset] || PRESET_SECTIONS['springer-nature'];
  const sections: PaperSection[] = [];
  const initialContents: Record<string, string> = {};

  specs.forEach((spec, idx) => {
    const num = String(idx + 1).padStart(2, '0');
    const fileName = `${num}-${slugifySectionName(spec.title)}.md`;
    const id = `sec-${slugifySectionName(spec.title)}-${idx + 1}`;
    sections.push({
      id,
      title: spec.title,
      role: spec.role,
      fileName,
      path: fileService.joinPath(projectPath, 'sections', fileName),
      status: 'draft',
      wordLimit: spec.wordLimit,
      isBackMatter: spec.isBackMatter,
      starred: spec.starred,
    });
    initialContents[id] = spec.starterBody;
  });

  return { sections, initialContents };
}

/**
 * Generates MirTex paper sections directly from the slots extracted out of an imported
 * LaTeX template manifest (e.g., Springer Nature, IEEE, Elsevier, or any custom journal `.tex`).
 */
export function buildSectionsFromTemplateManifest(
  projectPath: string,
  manifest: TemplateManifest
): { sections: PaperSection[]; initialContents: Record<string, string> } {
  const sections: PaperSection[] = [];
  const initialContents: Record<string, string> = {};
  let idx = 0;

  for (const slot of manifest.slots) {
    if (
      slot.kind !== 'abstract' &&
      slot.kind !== 'section' &&
      slot.kind !== 'backmatter_heading' &&
      slot.kind !== 'appendix'
    ) {
      continue;
    }
    idx++;
    const title = slot.kind === 'abstract' ? 'Abstract' : slot.sectionTitle || slot.label;
    const role: SectionRole = slot.suggestedRole || (slot.kind === 'abstract' ? 'abstract' : 'custom');
    const num = String(idx).padStart(2, '0');
    const fileName = `${num}-${slugifySectionName(title)}.md`;
    const id = `sec-${slugifySectionName(title)}-${idx}`;
    sections.push({
      id,
      title,
      role,
      fileName,
      path: fileService.joinPath(projectPath, 'sections', fileName),
      status: 'outline',
      wordLimit: role === 'abstract' ? 250 : undefined,
      isBackMatter: slot.kind === 'backmatter_heading' || slot.kind === 'appendix' || role === 'acknowledgments',
      starred: slot.starred,
    });
    initialContents[id] = `# ${title}\n\n`;
  }

  return { sections, initialContents };
}

/**
 * Loads an existing MirTex paper folder, or initializes a new scientific paper folder
 * cleanly when opening an empty folder.
 */
export async function loadOrCreatePaperProject(
  projectPath: string,
  preset: PaperProject['preset'] = 'springer-nature'
): Promise<{
  project: PaperProject;
  frontMatter: PaperFrontMatter;
  bibContent: string;
  scratchpad: string;
  sectionContents: Record<string, string>;
}> {
  const configPath = fileService.joinPath(projectPath, PROJECT_CONFIG_FILE);
  const fmPath = fileService.joinPath(projectPath, FRONTMATTER_FILE);
  const bibPath = fileService.joinPath(projectPath, BIB_FILE);
  const scratchPath = fileService.joinPath(projectPath, SCRATCHPAD_FILE);
  const sectionsDir = fileService.joinPath(projectPath, 'sections');
  const figuresDir = fileService.joinPath(projectPath, 'figures');

  await fileService.setProjectRoot(projectPath);
  await fileService.createDir(sectionsDir);
  await fileService.createDir(figuresDir);

  let existingProject: PaperProject | null = null;
  try {
    const raw = await fileService.readFileDirect(configPath);
    existingProject = JSON.parse(raw.content) as PaperProject;
  } catch {
    // New folder
  }

  const folderName = fileService.extractFileName(projectPath) || 'Untitled Paper';
  let frontMatter: PaperFrontMatter;
  try {
    const rawFm = await fileService.readFileDirect(fmPath);
    frontMatter = { ...createDefaultFrontMatter(folderName), ...(JSON.parse(rawFm.content) as PaperFrontMatter) };
  } catch {
    frontMatter = createDefaultFrontMatter(folderName);
    await fileService.saveFile(fmPath, JSON.stringify(frontMatter, null, 2));
  }

  let bibContent: string;
  try {
    bibContent = (await fileService.readFileDirect(bibPath)).content;
  } catch {
    bibContent = `% MirTex Bibliography — Add entries via Zotero, DOI lookup, or .bib import\n`;
    await fileService.saveFile(bibPath, bibContent);
  }

  let scratchpad: string;
  try {
    scratchpad = (await fileService.readFileDirect(scratchPath)).content;
  } catch {
    scratchpad = '';
  }

  const sectionContents: Record<string, string> = {};
  let sections: PaperSection[];

  if (existingProject && existingProject.sections.length > 0) {
    sections = existingProject.sections.map((sec) => ({
      ...sec,
      path: fileService.joinPath(projectPath, 'sections', sec.fileName),
    }));
    for (const sec of sections) {
      try {
        sectionContents[sec.id] = (await fileService.readFileDirect(sec.path)).content;
      } catch {
        sectionContents[sec.id] = `# ${sec.title}\n\n`;
        await fileService.saveFile(sec.path, sectionContents[sec.id]);
      }
    }
  } else {
    const built = buildSectionsFromPreset(projectPath, preset);
    sections = built.sections;
    for (const sec of sections) {
      const content = built.initialContents[sec.id] || `# ${sec.title}\n\n`;
      sectionContents[sec.id] = content;
      await fileService.saveFile(sec.path, content);
    }
  }

  const snapshots = await loadSnapshots(projectPath);

  const project: PaperProject = {
    version: 1,
    name: existingProject?.name || folderName,
    preset: existingProject?.preset || preset,
    createdAt: existingProject?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    targetTotalWords: existingProject?.targetTotalWords ?? 4500,
    sections,
    extraFiles: (existingProject?.extraFiles || []).map((f) => ({
      ...f,
      path: fileService.joinPath(projectPath, 'notes', f.fileName),
    })),
    activeTemplateId:
      existingProject?.activeTemplateId ||
      (preset === 'ieee-cs'
        ? 'ieee-twocolumn'
        : preset === 'imrad'
          ? 'standard-imrad'
          : 'springer-nature-compat'),
    templateSlotMap: existingProject?.templateSlotMap || {},
    citationCommandMode: existingProject?.citationCommandMode || 'auto',
    glossary: existingProject?.glossary || [],
    customDictionary: existingProject?.customDictionary || [],
    comments: existingProject?.comments || {},
    snapshots,
    gitRemoteUrl: existingProject?.gitRemoteUrl,
    zotero: existingProject?.zotero || { enabled: true, port: 23119 },
  };

  await savePaperProject(projectPath, project);
  return { project, frontMatter, bibContent, scratchpad, sectionContents };
}

export async function savePaperProject(projectPath: string, project: PaperProject): Promise<void> {
  const { snapshots: _snaps, ...rest } = project;
  const portable: Omit<PaperProject, 'snapshots'> = {
    ...rest,
    updatedAt: new Date().toISOString(),
    sections: project.sections.map(({ subsections: _sub, wordCount: _wc, path: _p, ...sec }) => ({
      ...sec,
      path: sec.fileName,
    })),
    extraFiles: project.extraFiles.map(({ path: _p, ...f }) => ({ ...f, path: f.fileName })),
  };
  await fileService.saveFile(
    fileService.joinPath(projectPath, PROJECT_CONFIG_FILE),
    JSON.stringify(portable, null, 2)
  );
}

export async function saveFrontMatter(projectPath: string, fm: PaperFrontMatter): Promise<void> {
  await fileService.saveFile(
    fileService.joinPath(projectPath, FRONTMATTER_FILE),
    JSON.stringify(fm, null, 2)
  );
}

export async function saveBibFile(projectPath: string, content: string): Promise<void> {
  await fileService.saveFile(fileService.joinPath(projectPath, BIB_FILE), content);
}

export async function saveScratchpad(projectPath: string, content: string): Promise<void> {
  await fileService.saveFile(fileService.joinPath(projectPath, SCRATCHPAD_FILE), content);
}

export async function createNewSectionFile(
  projectPath: string,
  existingSections: PaperSection[],
  title: string,
  role: SectionRole
): Promise<{ section: PaperSection; content: string }> {
  const num = String(existingSections.length + 1).padStart(2, '0');
  const slug = slugifySectionName(title);
  let fileName = `${num}-${slug}.md`;
  let counter = 2;
  const usedNames = new Set(existingSections.map((s) => s.fileName.toLowerCase()));
  while (usedNames.has(fileName.toLowerCase())) {
    fileName = `${num}-${slug}-${counter++}.md`;
  }
  const fullPath = fileService.joinPath(projectPath, 'sections', fileName);
  const content = `# ${title.trim()}\n\n`;
  await fileService.saveFile(fullPath, content);

  const section: PaperSection = {
    id: makeId('sec'),
    title: title.trim(),
    role,
    fileName,
    path: fullPath,
    status: 'draft',
    wordLimit: role === 'abstract' ? 250 : undefined,
    isBackMatter: role === 'acknowledgments' || role === 'supplementary' || role === 'appendix' || role === 'declarations',
    starred: role === 'acknowledgments' || role === 'declarations',
  };
  return { section, content };
}

function timestampSlug(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}_${p(now.getHours())}-${p(now.getMinutes())}-${p(now.getSeconds())}`;
}

export async function flushScratchpadToGraveyard(
  projectPath: string,
  content: string
): Promise<string> {
  const fileName = `${timestampSlug()}_scratchpad.md`;
  const dir = fileService.joinPath(projectPath, GRAVEYARD_DIR);
  await fileService.createDir(dir);
  await fileService.saveFile(fileService.joinPath(dir, fileName), content);
  return fileName;
}

export async function moveSectionToGraveyard(
  projectPath: string,
  sectionPath: string
): Promise<string> {
  const dir = fileService.joinPath(projectPath, GRAVEYARD_DIR);
  await fileService.createDir(dir);
  const targetName = `${timestampSlug()}_${fileService.extractFileName(sectionPath)}`;
  await fileService.renamePath(sectionPath, fileService.joinPath(dir, targetName));
  return targetName;
}

export async function loadSnapshots(projectPath: string): Promise<PaperSnapshot[]> {
  try {
    const raw = await fileService.readFileDirect(
      fileService.joinPath(projectPath, '.mirtex', 'snapshots.json')
    );
    const parsed = JSON.parse(raw.content) as PaperSnapshot[];
    return Array.isArray(parsed)
      ? parsed.map((s) => ({
          ...s,
          sectionPath: fileService.joinPath(
            projectPath,
            'sections',
            fileService.extractFileName(s.sectionPath)
          ),
        }))
      : [];
  } catch {
    return [];
  }
}

export async function saveSnapshots(
  projectPath: string,
  snapshots: PaperSnapshot[]
): Promise<void> {
  const portable = snapshots.map((s) => ({
    ...s,
    sectionPath: fileService.extractFileName(s.sectionPath),
  }));
  await fileService.saveFile(
    fileService.joinPath(projectPath, '.mirtex', 'snapshots.json'),
    JSON.stringify(portable, null, 2)
  );
}
