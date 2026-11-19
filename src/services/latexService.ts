import { invoke } from '@tauri-apps/api/core';
import JSZip from 'jszip';
import type { LatexCompileResult, TemplateManifest, TexToolchainInfo } from '../types/latex';
import { scanLatexTemplate } from '../latex/templateScanner';
import * as fileService from './fileService';
import type { TexEngine } from './settings';

const TEXT_ASSET_EXTS = new Set(['tex', 'ltx', 'cls', 'sty', 'bst', 'bbx', 'cbx', 'bib', 'def', 'cfg', 'clo', 'fd', 'txt']);

export async function detectTexToolchain(): Promise<TexToolchainInfo> {
  if (!fileService.isTauri()) {
    return {
      pdflatex: null,
      xelatex: null,
      lualatex: null,
      latexmk: null,
      bibtex: null,
      biber: null,
      texstudio_found: false,
      texworks_found: false,
    };
  }
  return await invoke<TexToolchainInfo>('detect_tex_toolchain');
}

export async function compileLatexBuild(params: {
  buildDir: string;
  texFilename: string;
  engine: TexEngine;
  useBiber: boolean;
}): Promise<LatexCompileResult> {
  if (!fileService.isTauri()) {
    throw new Error('Local LaTeX PDF compilation requires MirTex desktop app mode.');
  }
  return await invoke<LatexCompileResult>('compile_latex', {
    buildDir: params.buildDir,
    texFilename: params.texFilename,
    engine: params.engine,
    useBiber: params.useBiber,
  });
}

function base64ToUint8Array(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Imports a LaTeX template from a `.tex` file or a journal `.zip` archive (e.g., Springer Nature's
 * sn-article-template.zip or Overleaf export), copies all supporting `.cls`/`.sty`/`.bst` assets
 * into `<projectPath>/templates/<templateId>/`, scans the entrypoint `.tex`, and returns the
 * extracted `TemplateManifest`.
 */
export async function importLatexTemplateFile(
  projectPath: string,
  filePath?: string
): Promise<TemplateManifest | null> {
  let chosenPath = filePath ?? null;
  if (!chosenPath) {
    chosenPath = await fileService.pickFileDialog({
      title: 'Load LaTeX Template (.tex or .zip archive)',
      filters: [
        { name: 'LaTeX Template (.tex, .zip)', extensions: ['tex', 'ltx', 'zip'] },
      ],
    });
  }
  if (!chosenPath) return null;

  const fileName = fileService.extractFileName(chosenPath);
  const lower = fileName.toLowerCase();
  const baseSlug = fileName
    .replace(/\.(tex|ltx|zip)$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'custom-template';
  const templateId = `imported-${baseSlug}`;
  const targetDir = fileService.joinPath(projectPath, 'templates', templateId);
  await fileService.createDir(targetDir);

  if (lower.endsWith('.zip')) {
    const b64 = await fileService.readBinaryBase64(chosenPath);
    const zip = await JSZip.loadAsync(base64ToUint8Array(b64));
    const texCandidates: { relPath: string; content: string; score: number }[] = [];
    const supportingFiles: string[] = [];

    // Detect if the zip wraps everything in a single top-level directory
    const rawEntries = Object.values(zip.files).filter((f) => !f.dir && !f.name.includes('__MACOSX'));
    const topPrefixes = new Set(rawEntries.map((f) => f.name.split('/')[0]));
    const stripPrefix =
      topPrefixes.size === 1 && rawEntries.every((f) => f.name.includes('/'))
        ? `${Array.from(topPrefixes)[0]}/`
        : '';

    for (const entry of rawEntries) {
      const rel = stripPrefix ? entry.name.slice(stripPrefix.length) : entry.name;
      if (!rel || rel.startsWith('.') || rel.includes('..')) continue;
      const ext = rel.split('.').pop()?.toLowerCase() || '';
      const destPath = fileService.joinPath(targetDir, ...rel.split('/'));

      if (TEXT_ASSET_EXTS.has(ext)) {
        const text = await entry.async('string');
        try {
          await fileService.saveFile(destPath, text);
        } catch {
          // ignore unsupported auxiliary files inside journal zips
          continue;
        }
        if (ext === 'tex' || ext === 'ltx') {
          let score = 0;
          if (/\\documentclass/.test(text)) score += 10;
          if (/\\begin\{document\}/.test(text)) score += 10;
          if (/\\section/.test(text)) score += 3;
          if (rel.toLowerCase().includes('article') || rel.toLowerCase().includes('main')) score += 2;
          if (!rel.includes('/')) score += 4;
          texCandidates.push({ relPath: rel, content: text, score });
        } else {
          supportingFiles.push(rel);
        }
      } else if (['png', 'jpg', 'jpeg', 'pdf', 'eps', 'svg'].includes(ext)) {
        const bytes = await entry.async('uint8array');
        try {
          await fileService.writeBinaryDirect(destPath, bytes);
          supportingFiles.push(rel);
        } catch {
          // ignore unsupported binary
        }
      }
    }

    texCandidates.sort((a, b) => b.score - a.score);
    const best = texCandidates[0];
    if (!best) {
      throw new Error('No .tex file with \\documentclass found inside the selected archive.');
    }

    const manifest = scanLatexTemplate(best.content, {
      id: templateId,
      name: fileName.replace(/\.zip$/i, ''),
      entryFile: best.relPath,
      supportingFiles,
    });
    await fileService.saveFile(
      fileService.joinPath(targetDir, 'template-manifest.json'),
      JSON.stringify(manifest, null, 2)
    );
    return manifest;
  }

  // Single .tex file
  const opened = await fileService.readFileDirect(chosenPath);
  await fileService.saveFile(fileService.joinPath(targetDir, fileName), opened.content);

  // Also check if sibling .cls / .sty / .bst files exist in the same folder as the .tex
  const supportingFiles: string[] = [];
  if (fileService.isTauri()) {
    const sepIdx = Math.max(chosenPath.lastIndexOf('\\'), chosenPath.lastIndexOf('/'));
    if (sepIdx > 0) {
      const parentDir = chosenPath.slice(0, sepIdx);
      try {
        const tree = await fileService.readDirTree(parentDir);
        for (const node of tree) {
          if (node.is_dir) continue;
          const ext = node.name.split('.').pop()?.toLowerCase() || '';
          if (['cls', 'sty', 'bst', 'bbx', 'cbx', 'clo', 'def'].includes(ext)) {
            await fileService.copyAssetToProject(
              node.path,
              fileService.joinPath(targetDir, node.name)
            );
            supportingFiles.push(node.name);
          }
        }
      } catch {
        // non-fatal if sibling scan fails
      }
    }
  }

  const manifest = scanLatexTemplate(opened.content, {
    id: templateId,
    name: fileName.replace(/\.(tex|ltx)$/i, ''),
    entryFile: fileName,
    supportingFiles,
  });
  await fileService.saveFile(
    fileService.joinPath(targetDir, 'template-manifest.json'),
    JSON.stringify(manifest, null, 2)
  );
  return manifest;
}

/** Loads all imported custom templates cached under `<projectPath>/templates/`. */
export async function loadProjectTemplates(projectPath: string): Promise<TemplateManifest[]> {
  const templatesDir = fileService.joinPath(projectPath, 'templates');
  try {
    const nodes = await fileService.readDirTree(templatesDir);
    const manifests: TemplateManifest[] = [];
    for (const dir of nodes) {
      if (!dir.is_dir) continue;
      const manifestNode = dir.children.find((c) => c.name === 'template-manifest.json');
      if (manifestNode) {
        try {
          const raw = await fileService.readFileDirect(manifestNode.path);
          const stored = JSON.parse(raw.content) as TemplateManifest;
          // Re-scan stored rawSource with the latest scanner rules so template fixes take effect automatically
          if (stored.rawSource) {
            manifests.push(
              scanLatexTemplate(stored.rawSource, {
                id: stored.id,
                name: stored.name,
                entryFile: stored.entryFile,
                supportingFiles: stored.supportingFiles,
              })
            );
          } else {
            manifests.push(stored);
          }
        } catch {
          // skip corrupt manifest
        }
      }
    }
    return manifests;
  } catch {
    return [];
  }
}
