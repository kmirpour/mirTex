import * as fileService from '../services/fileService';
import type { ProjectFigureFile } from '../types/paper';

export type ImageFormat = 'png' | 'jpg' | 'gif' | 'bmp' | 'webp' | 'svg';

export type ResolvedDocxImage =
  | {
      kind: 'raster';
      type: 'png' | 'jpg' | 'gif' | 'bmp';
      data: Uint8Array;
      width: number;
      height: number;
    }
  | {
      kind: 'svg';
      data: Uint8Array;
      fallbackPng: Uint8Array;
      width: number;
      height: number;
    };

const PAGE_TEXT_WIDTH_PX = 624; // 6.5 in at 96 DPI (US Letter with 1" margins)
const MAX_FIGURE_HEIGHT_PX = 672; // 7.0 in so figure + caption stay together
const RASTER_SIBLING_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg'] as const;

export function base64ToBytes(b64: string): Uint8Array | null {
  try {
    const clean = b64.replace(/\s+/g, '');
    const bin = atob(clean);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      out[i] = bin.charCodeAt(i);
    }
    return out;
  } catch {
    return null;
  }
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    bin += String.fromCharCode(...slice);
  }
  return btoa(bin);
}

export function parseDataUrl(dataUrl: string): { mime: string; bytes: Uint8Array } | null {
  if (!dataUrl || !dataUrl.startsWith('data:')) return null;
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) return null;

  const meta = dataUrl.slice(5, commaIdx);
  const parts = meta.split(';').map((p) => p.trim());
  const firstPart = parts[0] || '';
  const mime = firstPart && !firstPart.includes('=') ? firstPart.toLowerCase() : 'application/octet-stream';
  const isBase64 = parts.some((p) => p.toLowerCase() === 'base64');
  const payload = dataUrl.slice(commaIdx + 1);

  if (isBase64) {
    const bytes = base64ToBytes(payload);
    return bytes ? { mime, bytes } : null;
  }

  let decoded = payload;
  try {
    decoded = decodeURIComponent(payload);
  } catch {
    // Keep raw payload if percent-encoding is partial
  }
  return { mime, bytes: new TextEncoder().encode(decoded) };
}

export function detectImageFormat(bytes: Uint8Array, hint = ''): ImageFormat | null {
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpg';
  }
  if (bytes.length >= 4 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return 'gif';
  }
  if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return 'bmp';
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'webp';
  }

  const headText = new TextDecoder('utf-8', { fatal: false })
    .decode(bytes.subarray(0, Math.min(bytes.length, 2048)))
    .replace(/^\uFEFF/, '')
    .trimStart()
    .toLowerCase();
  if (headText.includes('<svg')) {
    return 'svg';
  }

  const h = hint.toLowerCase();
  if (h.includes('image/png') || h.endsWith('.png') || h === 'png') return 'png';
  if (h.includes('image/jpeg') || h.includes('image/jpg') || h.endsWith('.jpg') || h.endsWith('.jpeg') || h === 'jpg' || h === 'jpeg') {
    return 'jpg';
  }
  if (h.includes('image/gif') || h.endsWith('.gif') || h === 'gif') return 'gif';
  if (h.includes('image/bmp') || h.endsWith('.bmp') || h === 'bmp') return 'bmp';
  if (h.includes('image/webp') || h.endsWith('.webp') || h === 'webp') return 'webp';
  if (h.includes('image/svg') || h.endsWith('.svg') || h === 'svg') return 'svg';

  return null;
}

function parseSvgLengthPx(raw: string | undefined): number | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed || trimmed.endsWith('%')) return null;
  const m = /^([0-9]+(?:\.[0-9]+)?)(px|pt|in|cm|mm)?$/.exec(trimmed);
  if (!m) return null;
  const val = Number(m[1]);
  if (!Number.isFinite(val) || val <= 0) return null;
  const unit = m[2] || 'px';
  if (unit === 'px') return val;
  if (unit === 'pt') return (val * 96) / 72;
  if (unit === 'in') return val * 96;
  if (unit === 'cm') return (val * 96) / 2.54;
  if (unit === 'mm') return (val * 96) / 25.4;
  return null;
}

export function probeImageDimensions(
  bytes: Uint8Array,
  format: 'png' | 'jpg' | 'gif' | 'bmp' | 'svg'
): { width: number; height: number } | null {
  if (format === 'png') {
    if (bytes.length < 24 || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) {
      return null;
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const width = view.getUint32(16, false);
    const height = view.getUint32(20, false);
    return width > 0 && height > 0 ? { width, height } : null;
  }

  if (format === 'gif') {
    if (bytes.length < 10) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const width = view.getUint16(6, true);
    const height = view.getUint16(8, true);
    return width > 0 && height > 0 ? { width, height } : null;
  }

  if (format === 'bmp') {
    if (bytes.length < 26) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const dibSize = view.getUint32(14, true);
    if (dibSize === 12 && bytes.length >= 22) {
      const width = view.getUint16(18, true);
      const height = view.getUint16(20, true);
      return width > 0 && height > 0 ? { width, height } : null;
    }
    const width = view.getInt32(18, true);
    const height = Math.abs(view.getInt32(22, true));
    return width > 0 && height > 0 ? { width, height } : null;
  }

  if (format === 'jpg') {
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let offset = 2;
    while (offset + 1 < bytes.length) {
      if (bytes[offset] !== 0xff) break;
      while (offset < bytes.length && bytes[offset] === 0xff) offset++;
      if (offset >= bytes.length) break;
      const marker = bytes[offset++];
      if (marker === 0x00) continue;
      if (
        marker === 0xd8 ||
        marker === 0xd9 ||
        marker === 0x01 ||
        (marker >= 0xd0 && marker <= 0xd7)
      ) {
        continue;
      }
      if (offset + 2 > bytes.length) break;
      const segLen = view.getUint16(offset, false);
      if (segLen < 2 || offset + segLen > bytes.length) break;
      const isSof =
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf);
      if (isSof && segLen >= 7 && offset + 7 <= bytes.length) {
        const height = view.getUint16(offset + 3, false);
        const width = view.getUint16(offset + 5, false);
        if (width > 0 && height > 0) return { width, height };
      }
      offset += segLen;
    }
    return null;
  }

  if (format === 'svg') {
    const svgText = new TextDecoder('utf-8', { fatal: false }).decode(
      bytes.subarray(0, Math.min(bytes.length, 8192))
    );
    const openMatch = /<svg\b([^>]*)>/i.exec(svgText);
    if (!openMatch) return null;
    const attrs = openMatch[1];
    const widthMatch = /\bwidth\s*=\s*["']([^"']+)["']/i.exec(attrs);
    const heightMatch = /\bheight\s*=\s*["']([^"']+)["']/i.exec(attrs);
    const viewBoxMatch = /\bviewBox\s*=\s*["']([^"']+)["']/i.exec(attrs);

    const w = parseSvgLengthPx(widthMatch?.[1]);
    const h = parseSvgLengthPx(heightMatch?.[1]);
    let vbW: number | null = null;
    let vbH: number | null = null;
    if (viewBoxMatch) {
      const nums = viewBoxMatch[1]
        .trim()
        .split(/[\s,]+/)
        .map(Number);
      if (nums.length === 4 && Number.isFinite(nums[2]) && Number.isFinite(nums[3]) && nums[2] > 0 && nums[3] > 0) {
        vbW = nums[2];
        vbH = nums[3];
      }
    }

    if (w && h) return { width: Math.round(w), height: Math.round(h) };
    if (w && vbW && vbH) return { width: Math.round(w), height: Math.round((w * vbH) / vbW) };
    if (h && vbW && vbH) return { width: Math.round((h * vbW) / vbH), height: Math.round(h) };
    if (vbW && vbH) return { width: Math.round(vbW), height: Math.round(vbH) };
    return null;
  }

  return null;
}

function ensureSvgDimensionsInDataUrl(
  svgBytes: Uint8Array,
  svgDims: { width: number; height: number } | null
): string {
  if (!svgDims) {
    return `data:image/svg+xml;base64,${bytesToBase64(svgBytes)}`;
  }
  const svgText = new TextDecoder('utf-8', { fatal: false }).decode(svgBytes);
  const patched = svgText.replace(/<svg\b([^>]*)>/i, (full, attrs: string) => {
    const hasWidth = /\bwidth\s*=/i.test(attrs) && !/\bwidth\s*=\s*["'][^"']*%["']/i.test(attrs);
    const hasHeight = /\bheight\s*=/i.test(attrs) && !/\bheight\s*=\s*["'][^"']*%["']/i.test(attrs);
    if (hasWidth && hasHeight) return full;
    const cleanAttrs = attrs
      .replace(/\bwidth\s*=\s*["'][^"']*%["']/gi, '')
      .replace(/\bheight\s*=\s*["'][^"']*%["']/gi, '');
    const wAttr = hasWidth ? '' : ` width="${svgDims.width}"`;
    const hAttr = hasHeight ? '' : ` height="${svgDims.height}"`;
    return `<svg${cleanAttrs}${wAttr}${hAttr}>`;
  });
  return `data:image/svg+xml;base64,${bytesToBase64(new TextEncoder().encode(patched))}`;
}

export async function rasterizeDataUrlToPng(
  dataUrl: string,
  opts?: {
    minWidth?: number;
    isSvg?: boolean;
    svgDims?: { width: number; height: number } | null;
  }
): Promise<{ bytes: Uint8Array; width: number; height: number } | null> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return null;

  return await new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const natW = img.naturalWidth || img.width || opts?.svgDims?.width || 800;
        const natH = img.naturalHeight || img.height || opts?.svgDims?.height || 500;
        let canvasW = natW;
        let canvasH = natH;
        if (opts?.minWidth && canvasW > 0 && canvasW < opts.minWidth) {
          const factor = opts.minWidth / canvasW;
          canvasW = Math.min(2400, Math.round(canvasW * factor));
          canvasH = Math.min(2400, Math.max(1, Math.round(canvasH * factor)));
        }
        const canvas = document.createElement('canvas');
        canvas.width = canvasW;
        canvas.height = canvasH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, canvasW, canvasH);
        canvas.toBlob((blob) => {
          if (!blob) {
            resolve(null);
            return;
          }
          void blob.arrayBuffer().then(
            (buf) => resolve({ bytes: new Uint8Array(buf), width: natW, height: natH }),
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

export function computeFigureDisplaySize(
  natW: number,
  natH: number,
  widthFraction: number,
  isVector: boolean
): { width: number; height: number } {
  const clampedFrac = Math.min(
    1.0,
    Math.max(0.15, Number.isFinite(widthFraction) ? widthFraction : 0.85)
  );
  const maxW = Math.round(PAGE_TEXT_WIDTH_PX * clampedFrac);
  if (natW <= 0 || natH <= 0) {
    return { width: maxW, height: Math.round(maxW * 0.62) };
  }
  const scale = isVector
    ? Math.min(maxW / natW, MAX_FIGURE_HEIGHT_PX / natH)
    : Math.min(maxW / natW, MAX_FIGURE_HEIGHT_PX / natH, 1);
  return {
    width: Math.max(1, Math.round(natW * scale)),
    height: Math.max(1, Math.round(natH * scale)),
  };
}

function mimeForExt(ext: string): string {
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'bmp') return 'image/bmp';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'svg') return 'image/svg+xml';
  return 'application/octet-stream';
}

export async function resolveFigureImage(
  src: string,
  opts: {
    imageDataUrls: Record<string, string>;
    projectFigures: ProjectFigureFile[];
    projectPath?: string;
  }
): Promise<ResolvedDocxImage | null> {
  const trimmed = src.trim();
  if (!trimmed) return null;

  let dataUrl: string | undefined;
  let formatHint = '';

  if (trimmed.startsWith('data:')) {
    dataUrl = trimmed;
    formatHint = trimmed.slice(0, 64);
  } else {
    const cleanSrc = trimmed.replace(/\\/g, '/').replace(/^\.\//, '');
    const basename = cleanSrc.split('/').pop() || cleanSrc;
    const dotIdx = basename.lastIndexOf('.');
    const ext = dotIdx >= 0 ? basename.slice(dotIdx + 1).toLowerCase() : '';
    const stem = dotIdx >= 0 ? basename.slice(0, dotIdx) : basename;
    const dir = cleanSrc.includes('/') ? cleanSrc.slice(0, cleanSrc.lastIndexOf('/')) : '';

    // Build case-insensitive index of imageDataUrls (normalized path + basename)
    const lowerUrlMap = new Map<string, { key: string; url: string }>();
    for (const [k, url] of Object.entries(opts.imageDataUrls)) {
      const normK = k.trim().replace(/\\/g, '/').replace(/^\.\//, '');
      const lowerK = normK.toLowerCase();
      if (!lowerUrlMap.has(lowerK)) lowerUrlMap.set(lowerK, { key: normK, url });
      const baseK = (normK.split('/').pop() || normK).toLowerCase();
      if (!lowerUrlMap.has(baseK)) lowerUrlMap.set(baseK, { key: normK, url });
    }

    const candidates: string[] = [
      cleanSrc,
      basename,
      `figures/${basename}`,
      `figure/${basename}`,
    ];

    // If vector/unsupported-by-word (e.g. .pdf/.eps) or missing, also check raster siblings with same stem
    for (const rExt of RASTER_SIBLING_EXTS) {
      if (dir) candidates.push(`${dir}/${stem}.${rExt}`);
      candidates.push(`figures/${stem}.${rExt}`);
      candidates.push(`figure/${stem}.${rExt}`);
      candidates.push(`${stem}.${rExt}`);
    }

    // Also inspect projectFigures for any matching path/stem
    const stemLower = stem.toLowerCase();
    for (const fig of opts.projectFigures) {
      const figNorm = fig.relPath.trim().replace(/\\/g, '/').replace(/^\.\//, '');
      const figBase = fig.name.replace(/\.[^.]+$/, '').toLowerCase();
      if (figNorm.toLowerCase() === cleanSrc.toLowerCase() || figBase === stemLower) {
        candidates.push(figNorm, fig.name);
      }
    }

    for (const cand of candidates) {
      const hit = lowerUrlMap.get(cand.toLowerCase());
      if (hit) {
        dataUrl = hit.url;
        formatHint = hit.key;
        break;
      }
    }

    // Fallback to reading from Tauri disk if not already in imageDataUrls
    if (!dataUrl && opts.projectPath && fileService.isTauri()) {
      const diskCandidates = [
        cleanSrc,
        `figures/${basename}`,
        `figure/${basename}`,
        ...(ext === 'pdf' || ext === 'eps' || !ext
          ? RASTER_SIBLING_EXTS.flatMap((rExt) => [
              ...(dir ? [`${dir}/${stem}.${rExt}`] : []),
              `figures/${stem}.${rExt}`,
              `figure/${stem}.${rExt}`,
            ])
          : []),
      ];
      for (const rel of diskCandidates) {
        const relExt = rel.split('.').pop()?.toLowerCase() || '';
        if (relExt === 'pdf' || relExt === 'eps') continue;
        try {
          const fullPath = fileService.joinPath(opts.projectPath, ...rel.split('/'));
          const b64 = await fileService.readBinaryBase64(fullPath);
          dataUrl = `data:${mimeForExt(relExt)};base64,${b64}`;
          formatHint = rel;
          break;
        } catch {
          // Try next candidate
        }
      }
    }
  }

  if (!dataUrl) return null;

  const parsed = parseDataUrl(dataUrl);
  if (!parsed || parsed.bytes.length === 0) return null;

  const format = detectImageFormat(parsed.bytes, `${parsed.mime} ${formatHint}`);
  if (!format) return null;

  if (format === 'png' || format === 'jpg' || format === 'gif' || format === 'bmp') {
    const dims = probeImageDimensions(parsed.bytes, format) ?? { width: 624, height: 390 };
    return {
      kind: 'raster',
      type: format,
      data: parsed.bytes,
      width: dims.width,
      height: dims.height,
    };
  }

  if (format === 'webp') {
    const png = await rasterizeDataUrlToPng(dataUrl);
    if (!png) return null;
    return {
      kind: 'raster',
      type: 'png',
      data: png.bytes,
      width: png.width,
      height: png.height,
    };
  }

  // SVG requires a PNG fallback in Word
  const svgDims = probeImageDimensions(parsed.bytes, 'svg');
  const svgDataUrl = ensureSvgDimensionsInDataUrl(parsed.bytes, svgDims);
  const pngFallback = await rasterizeDataUrlToPng(svgDataUrl, {
    minWidth: 1200,
    isSvg: true,
    svgDims,
  });
  if (!pngFallback) return null;

  return {
    kind: 'svg',
    data: parsed.bytes,
    fallbackPng: pngFallback.bytes,
    width: svgDims?.width ?? pngFallback.width,
    height: svgDims?.height ?? pngFallback.height,
  };
}
