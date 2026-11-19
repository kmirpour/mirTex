/**
 * Balanced-brace LaTeX lexer & structural helper utilities.
 * Handles % comments, escaped characters (\%, \{, \}, \\), optional [...] args,
 * mandatory {...} args, and nested \begin{env}...\end{env} environments while
 * preserving exact character offsets in the source string.
 */

export interface BalancedSpan {
  /** Index of the opening delimiter ({ or [) */
  openIdx: number;
  /** Index immediately after the closing delimiter (} or ]) */
  endIdx: number;
  /** Inner content between delimiters */
  content: string;
}

export interface ParsedCommand {
  name: string;
  starred: boolean;
  start: number;
  end: number;
  optArgs: BalancedSpan[];
  args: BalancedSpan[];
}

export interface ParsedEnvironment {
  name: string;
  start: number;
  end: number;
  bodyStart: number;
  bodyEnd: number;
  optArg?: string;
}

/** Returns true if the character at `idx` is preceded by an odd number of backslashes. */
export function isEscaped(src: string, idx: number): boolean {
  let bs = 0;
  let i = idx - 1;
  while (i >= 0 && src[i] === '\\') {
    bs++;
    i--;
  }
  return bs % 2 === 1;
}

/** Skips spaces, tabs, newlines, and % comments starting at `pos`. */
export function skipWhitespaceAndComments(src: string, pos: number): number {
  let i = pos;
  const len = src.length;
  while (i < len) {
    const ch = src[i];
    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
      i++;
      continue;
    }
    if (ch === '%' && !isEscaped(src, i)) {
      while (i < len && src[i] !== '\n') i++;
      continue;
    }
    break;
  }
  return i;
}

/** Finds the matching closing delimiter for `openChar` at `openIdx`, skipping comments & escapes. */
export function findBalancedGroup(
  src: string,
  openIdx: number,
  openChar: '{' | '[' = '{',
  closeChar: '}' | ']' = '}'
): BalancedSpan | null {
  if (openIdx >= src.length || src[openIdx] !== openChar) return null;
  let depth = 0;
  let i = openIdx;
  const len = src.length;

  while (i < len) {
    const ch = src[i];
    if (ch === '%' && !isEscaped(src, i)) {
      while (i < len && src[i] !== '\n') i++;
      continue;
    }
    if (ch === openChar && !isEscaped(src, i)) {
      depth++;
    } else if (ch === closeChar && !isEscaped(src, i)) {
      depth--;
      if (depth === 0) {
        return {
          openIdx,
          endIdx: i + 1,
          content: src.slice(openIdx + 1, i),
        };
      }
    }
    i++;
  }
  return null;
}

/**
 * Parses a LaTeX command at `backslashIdx` with up to `maxMandatory` `{...}` arguments
 * and any interleaved optional `[...]` arguments.
 */
export function parseCommandAt(
  src: string,
  backslashIdx: number,
  maxMandatory = 1,
  maxOptional = 2
): ParsedCommand | null {
  if (src[backslashIdx] !== '\\') return null;
  let i = backslashIdx + 1;
  while (i < src.length && /[a-zA-Z@]/.test(src[i])) i++;
  if (i === backslashIdx + 1) return null;

  const name = src.slice(backslashIdx + 1, i);
  let starred = false;
  if (src[i] === '*') {
    starred = true;
    i++;
  }

  const optArgs: BalancedSpan[] = [];
  const args: BalancedSpan[] = [];
  let end = i;

  while (args.length < maxMandatory) {
    const next = skipWhitespaceAndComments(src, i);
    if (src[next] === '[' && optArgs.length < maxOptional) {
      const span = findBalancedGroup(src, next, '[', ']');
      if (!span) break;
      optArgs.push(span);
      i = span.endIdx;
      end = i;
      continue;
    }
    if (src[next] === '{') {
      const span = findBalancedGroup(src, next, '{', '}');
      if (!span) break;
      args.push(span);
      i = span.endIdx;
      end = i;
      continue;
    }
    break;
  }

  return { name, starred, start: backslashIdx, end, optArgs, args };
}

const MACRO_DEF_TWO_ARG = new Set([
  'newcommand',
  'renewcommand',
  'providecommand',
  'DeclareRobustCommand',
  'DeclareMathOperator',
]);

const MACRO_DEF_THREE_ARG = new Set(['newenvironment', 'renewenvironment']);
const TEX_DEF_COMMANDS = new Set(['def', 'gdef', 'edef', 'xdef']);

/**
 * Iterates over all top-level (brace depth 0), non-commented LaTeX command
 * invocations matching `targetNames` within `[rangeStart, rangeEnd)`.
 * Automatically skips macro/environment definitions (`\newcommand`, `\def`,
 * `\let`, `\newenvironment`, etc.) and requires commands with mandatory
 * arguments to actually carry their `{...}` argument(s).
 */
export function findCommands(
  src: string,
  targetNames: Set<string>,
  rangeStart = 0,
  rangeEnd = src.length,
  mandatoryArgCount?: (name: string) => number
): ParsedCommand[] {
  const results: ParsedCommand[] = [];
  let i = rangeStart;
  let braceDepth = 0;

  while (i < rangeEnd) {
    const ch = src[i];
    if (ch === '%' && !isEscaped(src, i)) {
      while (i < rangeEnd && src[i] !== '\n') i++;
      continue;
    }
    if (ch === '{' && !isEscaped(src, i)) {
      braceDepth++;
      i++;
      continue;
    }
    if (ch === '}' && !isEscaped(src, i)) {
      braceDepth = Math.max(0, braceDepth - 1);
      i++;
      continue;
    }
    if (ch === '\\' && !isEscaped(src, i)) {
      let j = i + 1;
      while (j < rangeEnd && /[a-zA-Z@]/.test(src[j])) j++;
      const name = src.slice(i + 1, j);

      // Skip macro / environment definitions so commands inside definitions are never mistaken for document slots
      if (braceDepth === 0 && MACRO_DEF_TWO_ARG.has(name)) {
        const defCmd = parseCommandAt(src, i, 2, 2);
        i = defCmd ? defCmd.end : Math.max(j, i + 1);
        continue;
      }
      if (braceDepth === 0 && MACRO_DEF_THREE_ARG.has(name)) {
        const envDef = parseCommandAt(src, i, 3, 2);
        i = envDef ? envDef.end : Math.max(j, i + 1);
        continue;
      }
      if (braceDepth === 0 && TEX_DEF_COMMANDS.has(name)) {
        // Advance past parameter list to balanced {body}
        let scan = j;
        while (scan < rangeEnd && src[scan] !== '{') {
          if (src[scan] === '%' && !isEscaped(src, scan)) {
            while (scan < rangeEnd && src[scan] !== '\n') scan++;
            continue;
          }
          scan++;
        }
        const body = scan < rangeEnd ? findBalancedGroup(src, scan, '{', '}') : null;
        i = body ? body.endIdx : Math.max(j, i + 1);
        continue;
      }
      if (braceDepth === 0 && name === 'let') {
        // Skip `\let\foo=\bar`
        let scan = skipWhitespaceAndComments(src, j);
        for (let tok = 0; tok < 2 && scan < rangeEnd; tok++) {
          if (src[scan] === '=') {
            scan = skipWhitespaceAndComments(src, scan + 1);
          }
          if (src[scan] === '\\') {
            scan++;
            while (scan < rangeEnd && /[a-zA-Z@]/.test(src[scan])) scan++;
          } else {
            scan++;
          }
          scan = skipWhitespaceAndComments(src, scan);
        }
        i = Math.max(scan, j);
        continue;
      }

      if (braceDepth === 0 && targetNames.has(name)) {
        const count = mandatoryArgCount ? mandatoryArgCount(name) : 1;
        const parsed = parseCommandAt(src, i, count, 2);
        if (parsed && parsed.end <= rangeEnd && parsed.args.length >= count) {
          results.push(parsed);
          i = parsed.end;
          continue;
        }
      }
      i = Math.max(j, i + 1);
      continue;
    }
    i++;
  }

  return results;
}

/**
 * Finds all top-level (non-commented) `\begin{name}...\end{name}` environments
 * whose name is in `targetNames` within `[rangeStart, rangeEnd)`.
 */
export function findEnvironments(
  src: string,
  targetNames: Set<string>,
  rangeStart = 0,
  rangeEnd = src.length
): ParsedEnvironment[] {
  const results: ParsedEnvironment[] = [];
  let i = rangeStart;

  while (i < rangeEnd) {
    const ch = src[i];
    if (ch === '%' && !isEscaped(src, i)) {
      while (i < rangeEnd && src[i] !== '\n') i++;
      continue;
    }
    if (ch === '\\' && src.startsWith('\\begin', i) && !isEscaped(src, i)) {
      const beginCmd = parseCommandAt(src, i, 1, 0);
      if (beginCmd && beginCmd.name === 'begin' && beginCmd.args.length === 1) {
        const envName = beginCmd.args[0].content.trim();
        if (targetNames.has(envName)) {
          // Optional argument immediately after \begin{env}[...]
          let bodyStart = beginCmd.end;
          let optArg: string | undefined;
          const afterBegin = skipWhitespaceAndComments(src, beginCmd.end);
          if (src[afterBegin] === '[') {
            const optSpan = findBalancedGroup(src, afterBegin, '[', ']');
            if (optSpan) {
              optArg = optSpan.content;
              bodyStart = optSpan.endIdx;
            }
          }

          // Match nested \begin{envName} ... \end{envName}
          let depth = 1;
          let scan = bodyStart;
          let matchedEnd: { bodyEnd: number; end: number } | null = null;
          while (scan < rangeEnd) {
            if (src[scan] === '%' && !isEscaped(src, scan)) {
              while (scan < rangeEnd && src[scan] !== '\n') scan++;
              continue;
            }
            if (src[scan] === '\\' && !isEscaped(src, scan)) {
              if (src.startsWith('\\begin', scan)) {
                const inner = parseCommandAt(src, scan, 1, 0);
                if (inner && inner.name === 'begin' && inner.args[0]?.content.trim() === envName) {
                  depth++;
                  scan = inner.end;
                  continue;
                }
              } else if (src.startsWith('\\end', scan)) {
                const endCmd = parseCommandAt(src, scan, 1, 0);
                if (endCmd && endCmd.name === 'end' && endCmd.args[0]?.content.trim() === envName) {
                  depth--;
                  if (depth === 0) {
                    matchedEnd = { bodyEnd: scan, end: endCmd.end };
                    break;
                  }
                  scan = endCmd.end;
                  continue;
                }
              }
            }
            scan++;
          }

          if (matchedEnd) {
            results.push({
              name: envName,
              start: i,
              end: matchedEnd.end,
              bodyStart,
              bodyEnd: matchedEnd.bodyEnd,
              optArg,
            });
            i = matchedEnd.end;
            continue;
          }
        }
      }
    }
    i++;
  }

  return results;
}

/** Converts a 0-based character offset to a 1-based line number. */
export function offsetToLine(src: string, offset: number): number {
  let line = 1;
  const clamped = Math.min(offset, src.length);
  for (let i = 0; i < clamped; i++) {
    if (src[i] === '\n') line++;
  }
  return line;
}

/** Strips simple LaTeX formatting from a heading/snippet for readable UI display. */
export function cleanLatexDisplay(text: string): string {
  return text
    .replace(/%.*$/gm, '')
    .replace(/\\label\{[^}]*\}/g, '')
    .replace(/\\(?:textbf|textit|emph|texttt|fnm|sur)\{([^}]*)\}/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}
