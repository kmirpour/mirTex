use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;

#[derive(Serialize, Clone)]
pub struct ZoteroStatus {
    pub connected: bool,
    pub mode: String, // "local-api" | "better-bibtex" | "offline"
    pub port: u16,
    pub message: String,
}

#[derive(Serialize, Clone)]
pub struct ZoteroSearchItem {
    pub key: String,
    pub citekey: String,
    pub item_type: String,
    pub title: String,
    pub authors: String,
    pub year: String,
    pub journal: String,
    pub doi: String,
    pub bibtex: String,
}

#[derive(Serialize, Clone)]
pub struct ZoteroCollection {
    pub key: String,
    pub name: String,
    pub parent_key: Option<String>,
}

fn http_client(timeout_secs: u64) -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(timeout_secs))
        .user_agent("MirTex/0.1 (Scientific Paper Studio)")
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {e}"))
}

#[tauri::command]
pub async fn zotero_ping(port: Option<u16>) -> Result<ZoteroStatus, String> {
    let port = port.unwrap_or(23119);
    tauri::async_runtime::spawn_blocking(move || zotero_ping_sync(port))
        .await
        .map_err(|e| format!("Zotero ping task error: {e}"))?
}

fn zotero_ping_sync(port: u16) -> Result<ZoteroStatus, String> {
    let client = http_client(3)?;

    // 1. Try Zotero 7–10 built-in Local Read-Only HTTP API (zero plugins required)
    let native_url = format!("http://127.0.0.1:{port}/api/users/0/items?limit=1");
    if let Ok(resp) = client
        .get(&native_url)
        .header("Zotero-API-Version", "3")
        .send()
    {
        if resp.status().is_success() {
            return Ok(ZoteroStatus {
                connected: true,
                mode: "local-api".to_string(),
                port,
                message: "Connected to Zotero Local API (no plugins required).".to_string(),
            });
        }
        if resp.status().as_u16() == 403 {
            return Ok(ZoteroStatus {
                connected: false,
                mode: "offline".to_string(),
                port,
                message: "Zotero is running, but Local API access is disabled. Enable 'Allow other applications on this computer to communicate with Zotero' in Zotero Settings → Advanced.".to_string(),
            });
        }
    }

    // 2. Try Better BibTeX JSON-RPC if installed
    let bbt_url = format!("http://127.0.0.1:{port}/better-bibtex/json-rpc");
    let body = serde_json::json!({ "jsonrpc": "2.0", "method": "api.ready", "params": [] });
    if let Ok(resp) = client.post(&bbt_url).json(&body).send() {
        if resp.status().is_success() {
            return Ok(ZoteroStatus {
                connected: true,
                mode: "better-bibtex".to_string(),
                port,
                message: "Connected to Zotero via Better BibTeX JSON-RPC.".to_string(),
            });
        }
    }

    Ok(ZoteroStatus {
        connected: false,
        mode: "offline".to_string(),
        port,
        message: "Zotero desktop is not reachable on localhost:23119. Open Zotero and enable Settings → Advanced → 'Allow other applications on this computer to communicate with Zotero'.".to_string(),
    })
}

#[tauri::command]
pub async fn zotero_search(
    query: String,
    limit: Option<u32>,
    port: Option<u16>,
) -> Result<Vec<ZoteroSearchItem>, String> {
    let port = port.unwrap_or(23119);
    let limit = limit.unwrap_or(20).min(50);
    tauri::async_runtime::spawn_blocking(move || zotero_search_sync(&query, limit, port))
        .await
        .map_err(|e| format!("Zotero search task error: {e}"))?
}

fn zotero_search_sync(
    query: &str,
    limit: u32,
    port: u16,
) -> Result<Vec<ZoteroSearchItem>, String> {
    let client = http_client(6)?;
    let encoded_q = url_encode(query.trim());

    let url = if encoded_q.is_empty() {
        format!(
            "http://127.0.0.1:{port}/api/users/0/items/top?limit={limit}&sort=dateModified&direction=desc"
        )
    } else {
        format!(
            "http://127.0.0.1:{port}/api/users/0/items/top?q={encoded_q}&limit={limit}&sort=dateModified&direction=desc"
        )
    };

    let resp = client
        .get(&url)
        .header("Zotero-API-Version", "3")
        .send()
        .map_err(|e| format!("Could not connect to Zotero Local API on port {port}: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!(
            "Zotero Local API returned HTTP {}. Ensure Local API is enabled in Zotero Settings → Advanced.",
            resp.status()
        ));
    }

    let items: Vec<Value> = resp
        .json()
        .map_err(|e| format!("Failed to parse Zotero response: {e}"))?;

    let mut results = Vec::new();
    for item in items {
        let data = match item.get("data") {
            Some(d) => d,
            None => continue,
        };
        let item_type = str_field(data, "itemType");
        if item_type == "attachment" || item_type == "note" || item_type == "annotation" {
            continue;
        }
        let key = str_field(data, "key");
        let title = str_field(data, "title");
        if title.is_empty() {
            continue;
        }

        let (authors_display, first_last_name, bib_authors) = extract_creators(data);
        let year = extract_year(&str_field(data, "date"));
        let journal = first_non_empty(&[
            str_field(data, "publicationTitle"),
            str_field(data, "proceedingsTitle"),
            str_field(data, "bookTitle"),
            str_field(data, "university"),
            str_field(data, "publisher"),
        ]);
        let doi = str_field(data, "DOI");

        let citekey = make_citekey(&first_last_name, &year, &title, &key);

        // Try Zotero's built-in BibTeX translator first; fall back to clean synthesized BibTeX.
        let bibtex = fetch_zotero_item_bibtex(&client, port, &key)
            .filter(|b| b.trim().starts_with('@'))
            .unwrap_or_else(|| {
                synthesize_bibtex(
                    &item_type,
                    &citekey,
                    &title,
                    &bib_authors,
                    &year,
                    &journal,
                    &str_field(data, "volume"),
                    &str_field(data, "issue"),
                    &str_field(data, "pages"),
                    &doi,
                    &str_field(data, "url"),
                    &str_field(data, "publisher"),
                )
            });

        // Extract the actual key from Zotero's BibTeX if present
        let resolved_key = extract_bibtex_key(&bibtex).unwrap_or(citekey);

        results.push(ZoteroSearchItem {
            key,
            citekey: resolved_key,
            item_type,
            title,
            authors: authors_display,
            year,
            journal,
            doi,
            bibtex,
        });
    }

    Ok(results)
}

fn fetch_zotero_item_bibtex(
    client: &reqwest::blocking::Client,
    port: u16,
    item_key: &str,
) -> Option<String> {
    let url = format!("http://127.0.0.1:{port}/api/users/0/items/{item_key}?format=bibtex");
    let resp = client
        .get(&url)
        .header("Zotero-API-Version", "3")
        .send()
        .ok()?;
    if resp.status().is_success() {
        resp.text().ok()
    } else {
        None
    }
}

#[tauri::command]
pub async fn zotero_get_collections(port: Option<u16>) -> Result<Vec<ZoteroCollection>, String> {
    let port = port.unwrap_or(23119);
    tauri::async_runtime::spawn_blocking(move || {
        let client = http_client(5)?;
        let url = format!("http://127.0.0.1:{port}/api/users/0/collections?limit=100");
        let resp = client
            .get(&url)
            .header("Zotero-API-Version", "3")
            .send()
            .map_err(|e| format!("Failed to reach Zotero: {e}"))?;
        if !resp.status().is_success() {
            return Err(format!("Zotero returned HTTP {}", resp.status()));
        }
        let raw: Vec<Value> = resp
            .json()
            .map_err(|e| format!("Failed to parse collections: {e}"))?;
        let mut out = Vec::new();
        for c in raw {
            if let Some(data) = c.get("data") {
                let key = str_field(data, "key");
                let name = str_field(data, "name");
                let parent = data
                    .get("parentCollection")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                if !key.is_empty() && !name.is_empty() {
                    out.push(ZoteroCollection {
                        key,
                        name,
                        parent_key: parent,
                    });
                }
            }
        }
        out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        Ok(out)
    })
    .await
    .map_err(|e| format!("Zotero collections task error: {e}"))?
}

#[tauri::command]
pub async fn zotero_collection_bibtex(
    collection_key: String,
    port: Option<u16>,
) -> Result<String, String> {
    let port = port.unwrap_or(23119);
    tauri::async_runtime::spawn_blocking(move || {
        let client = http_client(10)?;
        let url = format!(
            "http://127.0.0.1:{port}/api/users/0/collections/{collection_key}/items/top?format=bibtex&limit=100"
        );
        let resp = client
            .get(&url)
            .header("Zotero-API-Version", "3")
            .send()
            .map_err(|e| format!("Failed to export collection from Zotero: {e}"))?;
        if !resp.status().is_success() {
            return Err(format!("Zotero returned HTTP {}", resp.status()));
        }
        resp.text()
            .map_err(|e| format!("Failed to read BibTeX from Zotero: {e}"))
    })
    .await
    .map_err(|e| format!("Zotero export task error: {e}"))?
}

/// Fetches a clean BibTeX entry from a DOI, PubMed ID (PMID), or arXiv ID.
#[tauri::command]
pub async fn fetch_reference_by_id(identifier: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || fetch_reference_by_id_sync(&identifier))
        .await
        .map_err(|e| format!("Reference lookup failed: {e}"))?
}

fn fetch_reference_by_id_sync(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("Please enter a DOI, PMID, or arXiv ID.".to_string());
    }
    let client = http_client(10)?;

    // 1. arXiv ID (e.g., arXiv:2305.12345 or 2305.12345 or https://arxiv.org/abs/2305.12345)
    let lower = trimmed.to_lowercase();
    if lower.starts_with("arxiv:") || lower.contains("arxiv.org/") || is_bare_arxiv_id(trimmed) {
        let arxiv_id = extract_arxiv_id(trimmed);
        return fetch_arxiv_bibtex(&client, &arxiv_id);
    }

    // 2. PubMed ID (PMID:12345678 or 6–9 pure digits)
    if lower.starts_with("pmid:") || (trimmed.len() >= 6 && trimmed.len() <= 9 && trimmed.chars().all(|c| c.is_ascii_digit())) {
        let pmid = trimmed
            .trim_start_matches("PMID:")
            .trim_start_matches("pmid:")
            .trim();
        return fetch_pmid_bibtex(&client, pmid);
    }

    // 3. Default: DOI (10.xxxx/... or https://doi.org/10.xxxx/...)
    let doi = trimmed
        .trim_start_matches("https://doi.org/")
        .trim_start_matches("http://doi.org/")
        .trim_start_matches("https://dx.doi.org/")
        .trim_start_matches("doi:")
        .trim_start_matches("DOI:")
        .trim();

    let doi_url = format!("https://doi.org/{doi}");
    let resp = client
        .get(&doi_url)
        .header("Accept", "application/x-bibtex; charset=utf-8")
        .send()
        .map_err(|e| format!("DOI lookup failed for '{doi}': {e}"))?;

    if !resp.status().is_success() {
        return Err(format!(
            "Could not resolve DOI '{doi}' (HTTP {}). Check the identifier and try again.",
            resp.status()
        ));
    }

    let text = resp
        .text()
        .map_err(|e| format!("Failed to read BibTeX response: {e}"))?;
    if !text.trim().starts_with('@') {
        return Err(format!("DOI resolver did not return valid BibTeX for '{doi}'."));
    }
    Ok(text.trim().to_string())
}

#[derive(Deserialize)]
struct PubMedAuthor {
    name: Option<String>,
}

fn fetch_pmid_bibtex(client: &reqwest::blocking::Client, pmid: &str) -> Result<String, String> {
    let url = format!(
        "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id={pmid}&retmode=json"
    );
    let resp = client
        .get(&url)
        .send()
        .map_err(|e| format!("PubMed lookup failed: {e}"))?;
    let json: Value = resp
        .json()
        .map_err(|e| format!("Invalid PubMed response: {e}"))?;
    let doc = json
        .get("result")
        .and_then(|r| r.get(pmid))
        .ok_or_else(|| format!("PubMed article {pmid} not found"))?;

    // If PubMed gives a DOI, prefer doi.org's richer BibTeX!
    if let Some(ids) = doc.get("articleids").and_then(|v| v.as_array()) {
        for id in ids {
            if id.get("idtype").and_then(|v| v.as_str()) == Some("doi") {
                if let Some(doi) = id.get("value").and_then(|v| v.as_str()) {
                    if let Ok(bib) = fetch_reference_by_id_sync(doi) {
                        return Ok(bib);
                    }
                }
            }
        }
    }

    let title = str_field(doc, "title").trim_end_matches('.').to_string();
    let journal = str_field(doc, "fulljournalname");
    let year = extract_year(&str_field(doc, "pubdate"));
    let volume = str_field(doc, "volume");
    let issue = str_field(doc, "issue");
    let pages = str_field(doc, "pages");
    let authors_vec: Vec<PubMedAuthor> = doc
        .get("authors")
        .and_then(|a| serde_json::from_value(a.clone()).ok())
        .unwrap_or_default();
    let author_names: Vec<String> = authors_vec.into_iter().filter_map(|a| a.name).collect();
    let first_last = author_names
        .first()
        .and_then(|n| n.split_whitespace().next())
        .unwrap_or("pubmed")
        .to_string();
    let bib_authors = author_names.join(" and ");
    let key = make_citekey(&first_last, &year, &title, pmid);

    Ok(synthesize_bibtex(
        "journalArticle",
        &key,
        &title,
        &bib_authors,
        &year,
        &journal,
        &volume,
        &issue,
        &pages,
        "",
        &format!("https://pubmed.ncbi.nlm.nih.gov/{pmid}/"),
        "",
    ))
}

fn fetch_arxiv_bibtex(client: &reqwest::blocking::Client, arxiv_id: &str) -> Result<String, String> {
    let url = format!("https://export.arxiv.org/api/query?id_list={arxiv_id}");
    let xml = client
        .get(&url)
        .send()
        .map_err(|e| format!("arXiv lookup failed: {e}"))?
        .text()
        .map_err(|e| format!("Failed to read arXiv response: {e}"))?;

    let entry = xml
        .split("<entry>")
        .nth(1)
        .ok_or_else(|| format!("arXiv paper '{arxiv_id}' not found"))?;
    let title = extract_xml_tag(entry, "title")
        .unwrap_or_default()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    let published = extract_xml_tag(entry, "published").unwrap_or_default();
    let year = extract_year(&published);

    let mut authors = Vec::new();
    for part in entry.split("<author>").skip(1) {
        if let Some(name) = extract_xml_tag(part, "name") {
            authors.push(name.trim().to_string());
        }
    }
    let first_last = authors
        .first()
        .and_then(|n| n.split_whitespace().last())
        .unwrap_or("arxiv")
        .to_string();
    let key = make_citekey(&first_last, &year, &title, arxiv_id);

    Ok(format!(
        "@misc{{{key},\n  title = {{{title}}},\n  author = {{{}}},\n  year = {{{year}}},\n  eprint = {{{arxiv_id}}},\n  archivePrefix = {{arXiv}},\n  url = {{https://arxiv.org/abs/{arxiv_id}}}\n}}",
        authors.join(" and ")
    ))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn str_field(v: &Value, key: &str) -> String {
    v.get(key)
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .trim()
        .to_string()
}

fn first_non_empty(vals: &[String]) -> String {
    vals.iter()
        .find(|s| !s.is_empty())
        .cloned()
        .unwrap_or_default()
}

fn extract_creators(data: &Value) -> (String, String, String) {
    let creators = match data.get("creators").and_then(|c| c.as_array()) {
        Some(arr) => arr,
        None => return (String::new(), "ref".to_string(), String::new()),
    };
    let mut display_parts = Vec::new();
    let mut bib_parts = Vec::new();
    let mut first_last = String::new();

    for c in creators {
        let last = str_field(c, "lastName");
        let first = str_field(c, "firstName");
        let single = str_field(c, "name");
        if !last.is_empty() {
            if first_last.is_empty() {
                first_last = last.clone();
            }
            if !first.is_empty() {
                display_parts.push(format!("{last}, {}", first.chars().next().unwrap_or(' ')));
                bib_parts.push(format!("{last}, {first}"));
            } else {
                display_parts.push(last.clone());
                bib_parts.push(last);
            }
        } else if !single.is_empty() {
            if first_last.is_empty() {
                first_last = single.clone();
            }
            display_parts.push(single.clone());
            bib_parts.push(format!("{{{single}}}"));
        }
    }

    let display = if display_parts.len() > 3 {
        format!("{} et al.", display_parts[0])
    } else {
        display_parts.join("; ")
    };
    (
        display,
        if first_last.is_empty() {
            "ref".to_string()
        } else {
            first_last
        },
        bib_parts.join(" and "),
    )
}

fn extract_year(date: &str) -> String {
    for token in date.split(|c: char| !c.is_ascii_digit()) {
        if token.len() == 4 && (token.starts_with("19") || token.starts_with("20")) {
            return token.to_string();
        }
    }
    String::new()
}

fn make_citekey(last: &str, year: &str, title: &str, fallback: &str) -> String {
    let clean_last: String = last
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect::<String>()
        .to_lowercase();
    let first_word: String = title
        .split_whitespace()
        .find(|w| w.len() > 3)
        .unwrap_or("")
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect::<String>()
        .to_lowercase();
    let base = format!(
        "{}{}{}",
        if clean_last.is_empty() {
            "ref"
        } else {
            &clean_last
        },
        year,
        first_word
    );
    if base.len() < 4 {
        format!("ref_{}", fallback.to_lowercase())
    } else {
        base
    }
}

fn extract_bibtex_key(bib: &str) -> Option<String> {
    let brace = bib.find('{')?;
    let comma = bib[brace + 1..].find(',')?;
    let key = bib[brace + 1..brace + 1 + comma].trim();
    if key.is_empty() {
        None
    } else {
        Some(key.to_string())
    }
}

#[allow(clippy::too_many_arguments)]
fn synthesize_bibtex(
    item_type: &str,
    key: &str,
    title: &str,
    authors: &str,
    year: &str,
    journal: &str,
    volume: &str,
    issue: &str,
    pages: &str,
    doi: &str,
    url: &str,
    publisher: &str,
) -> String {
    let bib_type = match item_type {
        "journalArticle" => "article",
        "conferencePaper" => "inproceedings",
        "book" => "book",
        "bookSection" => "incollection",
        "thesis" => "phdthesis",
        "preprint" => "misc",
        _ => "misc",
    };
    let mut lines = vec![format!("@{bib_type}{{{key},")];
    if !title.is_empty() {
        lines.push(format!("  title = {{{title}}},"));
    }
    if !authors.is_empty() {
        lines.push(format!("  author = {{{authors}}},"));
    }
    if !journal.is_empty() {
        let field = if bib_type == "inproceedings" || bib_type == "incollection" {
            "booktitle"
        } else {
            "journal"
        };
        lines.push(format!("  {field} = {{{journal}}},"));
    }
    if !year.is_empty() {
        lines.push(format!("  year = {{{year}}},"));
    }
    if !volume.is_empty() {
        lines.push(format!("  volume = {{{volume}}},"));
    }
    if !issue.is_empty() {
        lines.push(format!("  number = {{{issue}}},"));
    }
    if !pages.is_empty() {
        lines.push(format!("  pages = {{{pages}}},"));
    }
    if !publisher.is_empty() {
        lines.push(format!("  publisher = {{{publisher}}},"));
    }
    if !doi.is_empty() {
        lines.push(format!("  doi = {{{doi}}},"));
    }
    if !url.is_empty() {
        lines.push(format!("  url = {{{url}}},"));
    }
    if let Some(last) = lines.last_mut() {
        if last.ends_with(',') {
            last.pop();
        }
    }
    lines.push("}".to_string());
    lines.join("\n")
}

fn is_bare_arxiv_id(s: &str) -> bool {
    let core = s.split('v').next().unwrap_or(s);
    let parts: Vec<&str> = core.split('.').collect();
    parts.len() == 2
        && parts[0].len() == 4
        && parts[0].chars().all(|c| c.is_ascii_digit())
        && (parts[1].len() == 4 || parts[1].len() == 5)
        && parts[1].chars().all(|c| c.is_ascii_digit())
}

fn extract_arxiv_id(s: &str) -> String {
    let trimmed = s.trim();
    if let Some(idx) = trimmed.to_lowercase().find("arxiv.org/abs/") {
        return trimmed[idx + "arxiv.org/abs/".len()..]
            .trim_end_matches('/')
            .to_string();
    }
    if let Some(idx) = trimmed.to_lowercase().find("arxiv.org/pdf/") {
        return trimmed[idx + "arxiv.org/pdf/".len()..]
            .trim_end_matches(".pdf")
            .to_string();
    }
    trimmed
        .trim_start_matches("arXiv:")
        .trim_start_matches("arxiv:")
        .trim()
        .to_string()
}

fn extract_xml_tag(xml: &str, tag: &str) -> Option<String> {
    let open = format!("<{tag}>");
    let close = format!("</{tag}>");
    let start = xml.find(&open)? + open.len();
    let end = xml[start..].find(&close)?;
    Some(xml[start..start + end].to_string())
}

fn url_encode(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char);
            }
            b' ' => out.push_str("%20"),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_arxiv_ids() {
        assert!(is_bare_arxiv_id("2305.12345"));
        assert!(is_bare_arxiv_id("2305.12345v2"));
        assert!(!is_bare_arxiv_id("10.1038/s41586-021-03819-2"));
        assert_eq!(extract_arxiv_id("https://arxiv.org/abs/2305.12345"), "2305.12345");
    }

    #[test]
    fn synthesizes_clean_bibtex() {
        let bib = synthesize_bibtex(
            "journalArticle",
            "vaswani2017attention",
            "Attention Is All You Need",
            "Vaswani, Ashish and Shazeer, Noam",
            "2017",
            "NeurIPS",
            "30",
            "",
            "5998--6008",
            "10.5555/3295222.3295349",
            "",
            "",
        );
        assert!(bib.starts_with("@article{vaswani2017attention,"));
        assert!(bib.contains("journal = {NeurIPS}"));
        assert_eq!(extract_bibtex_key(&bib).as_deref(), Some("vaswani2017attention"));
    }
}
