import JSZip from 'jszip';
import type { BibEntry, CitationStyle } from '../types/citation';
import type { TemplateManifest } from '../types/latex';
import type { PaperFrontMatter, PaperProject, ProjectFigureFile } from '../types/paper';
import { pruneBibEntries, serializeBibLibrary } from '../citations/bibtex';
import { patchLatexTemplate } from '../latex/templatePatcher';
import { unicodeToLatexText } from '../latex/unicodeToLatex';
import { figureLabelFromFileName } from '../utils/paperOutline';
import * as fileService from '../services/fileService';

const BUILD_FIGURE_EXTS = new Set([
  'png',
  'jpg',
  'jpeg',
  'svg',
  'webp',
  'gif',
  'pdf',
  'eps',
  'tif',
  'tiff',
]);
const RASTERIZE_TO_PNG_EXTS = new Set(['svg', 'webp', 'gif']);

export interface AssembledLatexOutput {
  buildDir: string;
  entryFile: string;
  texPath: string;
  texSource: string;
  bibSource: string;
  citedKeys: string[];
  injectedPackages: string[];
  extraFigureAssets?: { zipPath: string; bytes: Uint8Array }[];
}

function mimeForFigureExt(ext: string): string {
  if (ext === 'svg') return 'image/svg+xml';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  return 'application/octet-stream';
}

function sanitizeFigureSubPath(relSubPath: string): string {
  return relSubPath
    .split('/')
    .map((seg) => seg.replace(/[^a-zA-Z0-9._-]/g, '-'))
    .join('/');
}

async function rasterizeImageToPngBytes(dataUrl: string): Promise<Uint8Array | null> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return null;
  return await new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const w = img.naturalWidth || img.width || 800;
        const h = img.naturalHeight || img.height || 600;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob((blob) => {
          if (!blob) {
            resolve(null);
            return;
          }
          void blob.arrayBuffer().then(
            (buf) => resolve(new Uint8Array(buf)),
            () => resolve(null)
          );
        }, 'image/png');
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

function base64ToUint8Array(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function collectFolderFiles(
  projectPath: string,
  folder: string
): Promise<{ relSubPath: string; path: string }[]> {
  const out: { relSubPath: string; path: string }[] = [];
  const walk = (nodes: fileService.BinderNode[], prefix: string) => {
    for (const node of nodes) {
      const rel = prefix ? `${prefix}/${node.name}` : node.name;
      if (node.is_dir) {
        walk(node.children || [], rel);
      } else {
        out.push({ relSubPath: rel, path: node.path });
      }
    }
  };
  try {
    const nodes = await fileService.readDirTree(fileService.joinPath(projectPath, folder));
    walk(nodes, '');
  } catch {
    // folder may be empty or missing
  }
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
  citationStyle?: CitationStyle;
  pruneUnusedBib?: boolean;
  projectFigures?: ProjectFigureFile[];
}): Promise<AssembledLatexOutput> {
  const {
    projectPath,
    project,
    frontMatter,
    sectionContents,
    manifest,
    bibEntries,
    citationStyle,
    pruneUnusedBib = true,
    projectFigures = [],
  } = params;

  const folderEntries: { folder: string; relSubPath: string; path: string }[] = [];
  const discoveredByRel = new Map<string, ProjectFigureFile>();

  if (fileService.isTauri()) {
    for (const folder of ['figures', 'figure']) {
      const figFiles = await collectFolderFiles(projectPath, folder);
      for (const f of figFiles) {
        const ext = f.relSubPath.split('.').pop()?.toLowerCase() || '';
        if (!BUILD_FIGURE_EXTS.has(ext)) continue;
        folderEntries.push({ folder, relSubPath: f.relSubPath, path: f.path });
        const relPath = `${folder}/${f.relSubPath}`;
        const fileName = f.relSubPath.split('/').pop() || f.relSubPath;
        if (!discoveredByRel.has(relPath)) {
          discoveredByRel.set(relPath, {
            name: fileName,
            relPath,
            label: figureLabelFromFileName(fileName),
            title: fileName,
          });
        }
      }
    }
  }

  for (const fig of projectFigures) {
    if (!discoveredByRel.has(fig.relPath)) {
      discoveredByRel.set(fig.relPath, fig);
    }
  }
  const mergedFigures = Array.from(discoveredByRel.values());

  const patched = patchLatexTemplate({
    manifest,
    frontMatter,
    sections: project.sections,
    sectionContents,
    slotMap: project.templateSlotMap,
    citationCommandOverride: project.citationCommandMode,
    citationStyle,
    bibFileName: 'references',
    projectFigures: mergedFigures,
  });

  const exportedEntries = pruneUnusedBib
    ? pruneBibEntries(bibEntries, patched.citedKeys)
    : bibEntries;
  // Convert Greek/math Unicode inside exported BibTeX titles (e.g., α, β, μ, –) so pdfLaTeX compiles cleanly
  const bibSource = unicodeToLatexText(serializeBibLibrary(exportedEntries));

  const buildDir = fileService.joinPath(projectPath, 'build');
  const entryName = fileService.extractFileName(manifest.entryFile || 'main.tex');
  const texPath = fileService.joinPath(buildDir, entryName);

  await fileService.createDir(buildDir);
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

  // Copy project figures/ and figure/ into build/, sanitizing unsafe filenames & rasterizing SVG/WebP/GIF to PNG
  const pathRewrites = new Map<string, string>();
  const extraFigureAssets: { zipPath: string; bytes: Uint8Array }[] = [];
  const nativePngByStem = new Map<string, string>();

  for (const entry of folderEntries) {
    const ext = entry.relSubPath.split('.').pop()?.toLowerCase() || '';
    if (ext === 'png') {
      const sanitizedStem = sanitizeFigureSubPath(entry.relSubPath).replace(/\.[^.]+$/, '');
      const origStemKey = `${entry.folder}/${entry.relSubPath.replace(/\.[^.]+$/, '')}`.toLowerCase();
      nativePngByStem.set(origStemKey, `${entry.folder}/${sanitizedStem}.png`);
    }
  }

  if (fileService.isTauri()) {
    for (const entry of folderEntries) {
      const { folder, relSubPath, path: srcPath } = entry;
      const buildFigDir = fileService.joinPath(buildDir, folder);
      const origRel = `${folder}/${relSubPath}`;
      const origName = relSubPath.split('/').pop() || relSubPath;
      const ext = relSubPath.split('.').pop()?.toLowerCase() || '';
      const sanitizedSub = sanitizeFigureSubPath(relSubPath);
      const sanitizedRel = `${folder}/${sanitizedSub}`;

      try {
        await fileService.copyAssetToProject(
          srcPath,
          fileService.joinPath(buildFigDir, ...relSubPath.split('/'))
        );
      } catch {
        // skip unreadable figure
      }

      if (sanitizedSub !== relSubPath) {
        try {
          await fileService.copyAssetToProject(
            srcPath,
            fileService.joinPath(buildFigDir, ...sanitizedSub.split('/'))
          );
          pathRewrites.set(origRel, sanitizedRel);
          if (!relSubPath.includes('/')) {
            pathRewrites.set(origName, sanitizedRel);
          }
          const b64 = await fileService.readBinaryBase64(srcPath);
          extraFigureAssets.push({ zipPath: sanitizedRel, bytes: base64ToUint8Array(b64) });
        } catch {
          // ignore
        }
      }

      if (RASTERIZE_TO_PNG_EXTS.has(ext)) {
        const stemKey = `${folder}/${relSubPath.replace(/\.[^.]+$/, '')}`.toLowerCase();
        const existingPngRel = nativePngByStem.get(stemKey);
        if (existingPngRel) {
          pathRewrites.set(origRel, existingPngRel);
          pathRewrites.set(sanitizedRel, existingPngRel);
          if (!relSubPath.includes('/')) {
            pathRewrites.set(origName, existingPngRel);
          }
          continue;
        }
        try {
          const b64 = await fileService.readBinaryBase64(srcPath);
          const dataUrl = `data:${mimeForFigureExt(ext)};base64,${b64}`;
          const pngBytes = await rasterizeImageToPngBytes(dataUrl);
          if (pngBytes) {
            const pngSub = sanitizedSub.replace(/\.[^.]+$/, '.png');
            const pngRel = `${folder}/${pngSub}`;
            await fileService.writeBinaryDirect(
              fileService.joinPath(buildFigDir, ...pngSub.split('/')),
              pngBytes
            );
            pathRewrites.set(origRel, pngRel);
            pathRewrites.set(sanitizedRel, pngRel);
            if (!relSubPath.includes('/')) {
              pathRewrites.set(origName, pngRel);
            }
            extraFigureAssets.push({ zipPath: pngRel, bytes: pngBytes });
          }
        } catch {
          // keep original if conversion fails
        }
      }
    }
  }

  let finalTexSource = patched.texSource;
  if (pathRewrites.size > 0) {
    finalTexSource = finalTexSource.replace(
      /(\\includegraphics(?:\[[^\]]*\])?\{)([^}]+)(\})/g,
      (_m, prefix: string, rawPath: string, suffix: string) => {
        const norm = rawPath.trim().replace(/\\/g, '/').replace(/^\.\//, '');
        const rewritten = pathRewrites.get(norm) ?? pathRewrites.get(norm.split('/').pop() || '');
        return `${prefix}${rewritten || rawPath}${suffix}`;
      }
    );
  }

  await fileService.saveFile(texPath, finalTexSource);

  return {
    buildDir,
    entryFile: entryName,
    texPath,
    texSource: finalTexSource,
    bibSource,
    citedKeys: patched.citedKeys,
    injectedPackages: patched.injectedPackages,
    extraFigureAssets,
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

    for (const folder of ['figures', 'figure']) {
      const figFiles = await collectFolderFiles(projectPath, folder);
      for (const f of figFiles) {
        try {
          const b64 = await fileService.readBinaryBase64(f.path);
          zip.file(`${folder}/${f.relSubPath}`, base64ToUint8Array(b64));
        } catch {
          // skip
        }
      }
    }

    for (const extra of assembled.extraFigureAssets ?? []) {
      zip.file(extra.zipPath, extra.bytes);
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
