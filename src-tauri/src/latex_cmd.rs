use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Instant;

use crate::commands::{ProjectRoot, ensure_inside, hidden_command};

#[derive(Serialize, Clone)]
pub struct TexToolchainInfo {
    pub pdflatex: Option<String>,
    pub xelatex: Option<String>,
    pub lualatex: Option<String>,
    pub latexmk: Option<String>,
    pub bibtex: Option<String>,
    pub biber: Option<String>,
    pub texstudio_found: bool,
    pub texworks_found: bool,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
pub struct LatexDiagnostic {
    pub severity: String, // "error" | "warning"
    pub file: String,
    pub line: Option<u32>,
    pub message: String,
}

#[derive(Serialize, Clone)]
pub struct LatexCompileResult {
    pub success: bool,
    pub engine_used: String,
    pub pdf_path: Option<String>,
    pub pdf_base64: Option<String>,
    pub diagnostics: Vec<LatexDiagnostic>,
    pub log: String,
    pub elapsed_ms: u64,
}

fn find_executable<S: AsRef<str>>(bin_name: &str, extra_candidates: &[S]) -> Option<PathBuf> {
    #[cfg(windows)]
    let names = [format!("{bin_name}.exe"), bin_name.to_string()];
    #[cfg(not(windows))]
    let names = [bin_name.to_string()];

    if let Some(path_var) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&path_var) {
            for name in &names {
                let candidate = dir.join(name);
                if candidate.is_file() {
                    return Some(candidate);
                }
            }
        }
    }

    for extra in extra_candidates {
        let p = Path::new(extra.as_ref());
        if p.is_file() {
            return Some(p.to_path_buf());
        }
    }

    None
}

fn describe_found_tool<S: AsRef<str>>(bin_name: &str, extra_candidates: &[S]) -> Option<String> {
    let found = find_executable(bin_name, extra_candidates)?;
    Some(format!("{bin_name} ({})", found.display()))
}

#[tauri::command]
pub async fn detect_tex_toolchain() -> Result<TexToolchainInfo, String> {
    let texlive_bins = [
        r"C:\texlive\2026\bin\windows",
        r"C:\texlive\2025\bin\windows",
        r"C:\texlive\2024\bin\windows",
        r"C:\texlive\2023\bin\windows",
    ];
    let with_texlive = |exe: &str| -> Vec<String> {
        texlive_bins
            .iter()
            .map(|d| format!(r"{d}\{exe}.exe"))
            .collect()
    };

    let pdflatex_extra = with_texlive("pdflatex");
    let xelatex_extra = with_texlive("xelatex");
    let lualatex_extra = with_texlive("lualatex");
    let latexmk_extra = with_texlive("latexmk");
    let bibtex_extra = with_texlive("bibtex");
    let biber_extra = with_texlive("biber");
    let mut texworks_extra = with_texlive("texworks");
    texworks_extra.push(r"C:\Program Files\TeXworks\TeXworks.exe".to_string());

    Ok(TexToolchainInfo {
        pdflatex: describe_found_tool("pdflatex", &pdflatex_extra),
        xelatex: describe_found_tool("xelatex", &xelatex_extra),
        lualatex: describe_found_tool("lualatex", &lualatex_extra),
        latexmk: describe_found_tool("latexmk", &latexmk_extra),
        bibtex: describe_found_tool("bibtex", &bibtex_extra),
        biber: describe_found_tool("biber", &biber_extra),
        texstudio_found: find_executable(
            "texstudio",
            &[
                r"C:\Program Files\texstudio\texstudio.exe",
                r"C:\Program Files (x86)\texstudio\texstudio.exe",
            ],
        )
        .is_some(),
        texworks_found: find_executable("texworks", &texworks_extra).is_some(),
    })
}

#[tauri::command]
pub async fn compile_latex(
    state: tauri::State<'_, ProjectRoot>,
    build_dir: String,
    tex_filename: String,
    engine: Option<String>,
    use_biber: Option<bool>,
) -> Result<LatexCompileResult, String> {
    let root = state.get()?;
    let dir = PathBuf::from(&build_dir);
    ensure_inside(&root, &dir)?;

    if tex_filename.contains('/') || tex_filename.contains('\\') || tex_filename.contains("..") {
        return Err("Invalid TeX filename".to_string());
    }

    let engine = match engine.as_deref().unwrap_or("pdflatex") {
        "xelatex" => "xelatex".to_string(),
        "lualatex" => "lualatex".to_string(),
        _ => "pdflatex".to_string(),
    };
    let use_biber = use_biber.unwrap_or(false);

    tauri::async_runtime::spawn_blocking(move || {
        compile_latex_sync(&dir, &tex_filename, &engine, use_biber)
    })
    .await
    .map_err(|e| format!("LaTeX compile task failed: {e}"))?
}

fn compile_latex_sync(
    dir: &Path,
    tex_filename: &str,
    engine: &str,
    use_biber: bool,
) -> Result<LatexCompileResult, String> {
    let started = Instant::now();
    let tex_path = dir.join(tex_filename);
    if !tex_path.is_file() {
        return Err(format!("TeX file not found: {}", tex_path.display()));
    }

    let stem = tex_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("main")
        .to_string();

    let mut combined_log = String::new();

    let resolve_tex_bin = |bin: &str| -> String {
        let extra = [
            format!(r"C:\texlive\2026\bin\windows\{bin}.exe"),
            format!(r"C:\texlive\2025\bin\windows\{bin}.exe"),
            format!(r"C:\texlive\2024\bin\windows\{bin}.exe"),
            format!(r"C:\texlive\2023\bin\windows\{bin}.exe"),
        ];
        let refs: Vec<&str> = extra.iter().map(|s| s.as_str()).collect();
        find_executable(bin, &refs)
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| bin.to_string())
    };

    let engine_bin = resolve_tex_bin(engine);
    let bibtex_bin = resolve_tex_bin("bibtex");
    let biber_bin = resolve_tex_bin("biber");

    let run_engine = |pass: u8, log_buf: &mut String| -> Result<bool, String> {
        let out = hidden_command(&engine_bin)
            .current_dir(dir)
            .stdin(std::process::Stdio::null())
            .args([
                "-interaction=nonstopmode",
                "-file-line-error",
                "-halt-on-error",
                tex_filename,
            ])
            .output()
            .map_err(|e| format!("Failed to invoke {engine}: {e}. Is TeX Live installed on PATH?"))?;

        log_buf.push_str(&format!("\n=== {engine} pass {pass} ===\n"));
        log_buf.push_str(&String::from_utf8_lossy(&out.stdout));
        let stderr = String::from_utf8_lossy(&out.stderr);
        if !stderr.trim().is_empty() {
            log_buf.push_str("\n[stderr]\n");
            log_buf.push_str(&stderr);
        }
        Ok(out.status.success())
    };

    // Pass 1
    let pass1_ok = run_engine(1, &mut combined_log)?;

    // Check whether BibTeX / Biber should run
    let aux_path = dir.join(format!("{stem}.aux"));
    let bcf_path = dir.join(format!("{stem}.bcf"));
    let should_run_biber = use_biber || bcf_path.is_file();
    let should_run_bibtex = if !should_run_biber && aux_path.is_file() {
        fs::read_to_string(&aux_path)
            .map(|c| c.contains("\\bibdata{") && c.contains("\\citation{"))
            .unwrap_or(false)
    } else {
        false
    };

    if pass1_ok && should_run_biber {
        if let Ok(out) = hidden_command(&biber_bin)
            .current_dir(dir)
            .stdin(std::process::Stdio::null())
            .arg(&stem)
            .output()
        {
            combined_log.push_str("\n=== biber ===\n");
            combined_log.push_str(&String::from_utf8_lossy(&out.stdout));
            combined_log.push_str(&String::from_utf8_lossy(&out.stderr));
        }
    } else if pass1_ok && should_run_bibtex {
        if let Ok(out) = hidden_command(&bibtex_bin)
            .current_dir(dir)
            .stdin(std::process::Stdio::null())
            .arg(&stem)
            .output()
        {
            combined_log.push_str("\n=== bibtex ===\n");
            combined_log.push_str(&String::from_utf8_lossy(&out.stdout));
            combined_log.push_str(&String::from_utf8_lossy(&out.stderr));
        }
    }

    // Pass 2 & Pass 3 to settle citations and cross-references
    let mut final_ok = pass1_ok;
    if pass1_ok {
        final_ok = run_engine(2, &mut combined_log)?;
        if final_ok && (should_run_bibtex || should_run_biber) {
            final_ok = run_engine(3, &mut combined_log)?;
        }
    }

    // Prefer full .log file for warning/error inspection if present
    let log_file_path = dir.join(format!("{stem}.log"));
    let full_log_text = fs::read_to_string(&log_file_path).unwrap_or_default();
    let diagnostics = parse_latex_log(&combined_log, &full_log_text);

    let pdf_file = dir.join(format!("{stem}.pdf"));
    let (pdf_path, pdf_base64) = if pdf_file.is_file() {
        let b64 = fs::read(&pdf_file).ok().map(|b| BASE64.encode(b));
        (Some(pdf_file.to_string_lossy().to_string()), b64)
    } else {
        (None, None)
    };

    Ok(LatexCompileResult {
        success: final_ok && pdf_path.is_some(),
        engine_used: engine.to_string(),
        pdf_path,
        pdf_base64,
        diagnostics,
        log: combined_log,
        elapsed_ms: started.elapsed().as_millis() as u64,
    })
}

pub fn parse_latex_log(stdout: &str, log_file: &str) -> Vec<LatexDiagnostic> {
    let mut diags = Vec::new();
    let mut seen = std::collections::HashSet::new();

    let combined = format!("{stdout}\n{log_file}");
    for raw_line in combined.lines() {
        let line = raw_line.trim();
        if line.is_empty() {
            continue;
        }

        // -file-line-error format: ./main.tex:42: Undefined control sequence.
        if let Some((file_part, rest)) = line.split_once(':') {
            if file_part.ends_with(".tex") || file_part.ends_with(".cls") || file_part.ends_with(".sty") {
                if let Some((num_part, msg_part)) = rest.split_once(':') {
                    if let Ok(line_no) = num_part.trim().parse::<u32>() {
                        let msg = msg_part.trim().to_string();
                        let key = format!("E:{file_part}:{line_no}:{msg}");
                        if seen.insert(key) {
                            diags.push(LatexDiagnostic {
                                severity: "error".to_string(),
                                file: file_part.trim_start_matches("./").to_string(),
                                line: Some(line_no),
                                message: msg,
                            });
                        }
                        continue;
                    }
                }
            }
        }

        // Classic TeX error starting with "! "
        if let Some(msg) = line.strip_prefix("! ") {
            let msg = msg.trim().to_string();
            let key = format!("E::{msg}");
            if seen.insert(key) {
                diags.push(LatexDiagnostic {
                    severity: "error".to_string(),
                    file: "main.tex".to_string(),
                    line: None,
                    message: msg,
                });
            }
            continue;
        }

        // LaTeX / Package / BibTeX warnings
        if line.starts_with("LaTeX Warning:")
            || line.starts_with("Package ") && line.contains(" Warning:")
            || line.starts_with("Warning--")
        {
            let key = format!("W:{line}");
            if seen.insert(key) {
                let line_no = extract_input_line_number(line);
                diags.push(LatexDiagnostic {
                    severity: "warning".to_string(),
                    file: "main.tex".to_string(),
                    line: line_no,
                    message: line.to_string(),
                });
            }
        }
    }

    diags.truncate(80);
    diags
}

fn extract_input_line_number(s: &str) -> Option<u32> {
    let idx = s.find("on input line ")?;
    let after = &s[idx + "on input line ".len()..];
    let digits: String = after.chars().take_while(|c| c.is_ascii_digit()).collect();
    digits.parse::<u32>().ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_file_line_errors_and_warnings() {
        let sample = "\
./main.tex:84: Undefined control sequence.
! Emergency stop.
LaTeX Warning: Citation `smith2024' on page 2 undefined on input line 112.
Package natbib Warning: Citation `lee2023' on page 3 undefined on input line 140.
";
        let diags = parse_latex_log(sample, "");
        assert_eq!(diags.len(), 4);
        assert_eq!(diags[0].severity, "error");
        assert_eq!(diags[0].file, "main.tex");
        assert_eq!(diags[0].line, Some(84));
        assert_eq!(diags[2].severity, "warning");
        assert_eq!(diags[2].line, Some(112));
        assert_eq!(diags[3].line, Some(140));
    }
}
