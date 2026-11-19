import JSZip from 'jszip';
import type { BibEntry } from '../types/citation';
import type { TemplateManifest } from '../types/latex';
import type { PaperFrontMatter, PaperProject } from '../types/paper';
import { pruneBibEntries, serializeBibLibrary } from '../citations/bibtex';
import { patchLatexTemplate } from '../latex/templatePatcher';
import * as fileService from '../services/fileService';

export interface AssembledLatexOutput {
  buildDir: string;
  entryFile: string;
  texPath: string;
  texSource: string;
  bibSource: string;
  citedKeys: string[];
  injectedPackages: string[];
}

function base64ToUint8Array(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Generates the complete LaTeX build directory (`<project>/build/`):
 * - Patched entrypoint `.tex`
 * - `references.bib` (optionally pruned to cited entries)
 * - All template supporting files (`.cls`, `.sty`, `.bst`, logos)
 * - All paper images from `figures/`
 */
export async function assembleLatexBuildDir(params: {
  projectPath: string;
  project: PaperProject;
  frontMatter: PaperFrontMatter;
  sectionContents: Record<string, string>;
  manifest: TemplateManifest;
  bibEntries: BibEntry[];
  pruneUnusedBib?: boolean;
}): Promise<AssembledLatexOutput> {
  const {
    projectPath,
    project,
    frontMatter,
    sectionContents,
    manifest,
    bibEntries,
    pruneUnusedBib = true,
  } = params;

  const patched = patchLatexTemplate({
    manifest,
    frontMatter,
    sections: project.sections,
    sectionContents,
    slotMap: project.templateSlotMap,
    citationCommandOverride: project.citationCommandMode,
    bibFileName: 'references',
  });

  const exportedEntries = pruneUnusedBib
    ? pruneBibEntries(bibEntries, patched.citedKeys)
    : bibEntries;
  const bibSource = serializeBibLibrary(exportedEntries);

  const buildDir = fileService.joinPath(projectPath, 'build');
  const entryName = fileService.extractFileName(manifest.entryFile || 'main.tex');
  const texPath = fileService.joinPath(buildDir, entryName);

  await fileService.createDir(buildDir);
  await fileService.saveFile(texPath, patched.texSource);
  await fileService.saveFile(fileService.joinPath(buildDir, 'references.bib'), bibSource);

  // Copy supporting template assets (.cls, .sty, .bst, logos) from templates/<id>/ into build/
  if (fileService.isTauri() && manifest.supportingFiles.length > 0) {
    const tplDir = fileService.joinPath(projectPath, 'templates', manifest.id);
    for (const rel of manifest.supportingFiles) {
      const src = fileService.joinPath(tplDir, ...rel.split('/'));
      const dst = fileService.joinPath(buildDir, ...rel.split('/'));
      try {
        await fileService.copyAssetToProject(src, dst);
      } catch {
        // non-fatal if optional asset missing
      }
    }
  }

  // Copy project figures/ into build/figures/
  if (fileService.isTauri()) {
    try {
      const figNodes = await fileService.readDirTree(fileService.joinPath(projectPath, 'figures'));
      const buildFigDir = fileService.joinPath(buildDir, 'figures');
      if (figNodes.length > 0) {
        await fileService.createDir(buildFigDir);
        for (const node of figNodes) {
          if (node.is_dir) continue;
          await fileService.copyAssetToProject(
            node.path,
            fileService.joinPath(buildFigDir, node.name)
          );
        }
      }
    } catch {
      // figures folder may be empty
    }
  }

  return {
    buildDir,
    entryFile: entryName,
    texPath,
    texSource: patched.texSource,
    bibSource,
    citedKeys: patched.citedKeys,
    injectedPackages: patched.injectedPackages,
  };
}

/**
 * Packages the entire LaTeX project (`main.tex`, `references.bib`, template `.cls`/`.sty`/`.bst`,
 * and `figures/*`) into an Overleaf-ready / journal-submission `.zip` archive.
 */
export async function buildOverleafZip(params: {
  projectPath: string;
  assembled: AssembledLatexOutput;
  manifest: TemplateManifest;
}): Promise<Blob> {
  const { projectPath, assembled, manifest } = params;
  const zip = new JSZip();

  zip.file(assembled.entryFile, assembled.texSource);
  zip.file('references.bib', assembled.bibSource);

  if (fileService.isTauri()) {
    const tplDir = fileService.joinPath(projectPath, 'templates', manifest.id);
    for (const rel of manifest.supportingFiles) {
      const src = fileService.joinPath(tplDir, ...rel.split('/'));
      try {
        const b64 = await fileService.readBinaryBase64(src);
        zip.file(rel, base64ToUint8Array(b64));
      } catch {
        // skip missing
      }
    }

    try {
      const figNodes = await fileService.readDirTree(fileService.joinPath(projectPath, 'figures'));
      for (const node of figNodes) {
        if (node.is_dir) continue;
        try {
          const b64 = await fileService.readBinaryBase64(node.path);
          zip.file(`figures/${node.name}`, base64ToUint8Array(b64));
        } catch {
          // skip
        }
      }
    } catch {
      // no figures
    }
  }

  return await zip.generateAsync({ type: 'blob' });
}

/** Builds a clean single combined Markdown file for portable archiving. */
export function buildCombinedMarkdown(
  frontMatter: PaperFrontMatter,
  project: PaperProject,
  sectionContents: Record<string, string>
): string {
  const parts: string[] = [];
  parts.push(`# ${frontMatter.title}`);
  if (frontMatter.authors.length > 0) {
    parts.push(
      `**Authors:** ${frontMatter.authors.map((a) => `${a.firstName} ${a.lastName}`).join(', ')}`
    );
  }
  if (frontMatter.keywords.length > 0) {
    parts.push(`**Keywords:** ${frontMatter.keywords.join(', ')}`);
  }
  parts.push('---');
  for (const sec of project.sections) {
    const md = (sectionContents[sec.id] ?? '').trim();
    if (md) parts.push(md);
  }
  return parts.join('\n\n') + '\n';
}
