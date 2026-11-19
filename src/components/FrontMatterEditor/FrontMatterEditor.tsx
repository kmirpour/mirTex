import { useState, type KeyboardEvent } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { usePaperStore } from '../../stores/paperStore';
import type { AuthorAffiliation, PaperAuthor } from '../../types/paper';
import './FrontMatterEditor.css';

export function FrontMatterEditor() {
  const fm = usePaperStore((s) => s.frontMatter);
  const updateFrontMatter = usePaperStore((s) => s.updateFrontMatter);
  const activeManifest = usePaperStore((s) => s.activeManifest);

  const [keywordInput, setKeywordInput] = useState('');
  const [highlightInput, setHighlightInput] = useState('');

  const addAffiliation = () => {
    const id = `affil-${Date.now().toString(36)}`;
    const next: AuthorAffiliation = {
      id,
      department: '',
      institution: '',
      city: '',
      state: '',
      postcode: '',
      country: '',
    };
    updateFrontMatter((prev) => ({ ...prev, affiliations: [...prev.affiliations, next] }));
  };

  const updateAffiliation = (id: string, partial: Partial<AuthorAffiliation>) => {
    updateFrontMatter((prev) => ({
      ...prev,
      affiliations: prev.affiliations.map((a) => (a.id === id ? { ...a, ...partial } : a)),
    }));
  };

  const removeAffiliation = (id: string) => {
    updateFrontMatter((prev) => ({
      ...prev,
      affiliations: prev.affiliations.filter((a) => a.id !== id),
      authors: prev.authors.map((au) => ({
        ...au,
        affiliationIds: au.affiliationIds.filter((aid) => aid !== id),
      })),
    }));
  };

  const addAuthor = () => {
    const id = `author-${Date.now().toString(36)}`;
    const firstAff = fm.affiliations[0]?.id;
    const next: PaperAuthor = {
      id,
      firstName: '',
      lastName: '',
      email: '',
      orcid: '',
      affiliationIds: firstAff ? [firstAff] : [],
      corresponding: fm.authors.length === 0,
      equalContribution: false,
    };
    updateFrontMatter((prev) => ({ ...prev, authors: [...prev.authors, next] }));
  };

  const updateAuthor = (id: string, partial: Partial<PaperAuthor>) => {
    updateFrontMatter((prev) => ({
      ...prev,
      authors: prev.authors.map((a) => (a.id === id ? { ...a, ...partial } : a)),
    }));
  };

  const toggleAuthorAffil = (authorId: string, affilId: string) => {
    updateFrontMatter((prev) => ({
      ...prev,
      authors: prev.authors.map((a) => {
        if (a.id !== authorId) return a;
        const exists = a.affiliationIds.includes(affilId);
        return {
          ...a,
          affiliationIds: exists
            ? a.affiliationIds.filter((x) => x !== affilId)
            : [...a.affiliationIds, affilId],
        };
      }),
    }));
  };

  const removeAuthor = (id: string) => {
    updateFrontMatter((prev) => ({
      ...prev,
      authors: prev.authors.filter((a) => a.id !== id),
    }));
  };

  const addKeyword = () => {
    const clean = keywordInput.trim();
    if (!clean) return;
    if (!fm.keywords.includes(clean)) {
      updateFrontMatter((prev) => ({ ...prev, keywords: [...prev.keywords, clean] }));
    }
    setKeywordInput('');
  };

  const handleKeywordKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addKeyword();
    }
  };

  const addHighlight = () => {
    const clean = highlightInput.trim();
    if (!clean) return;
    updateFrontMatter((prev) => ({ ...prev, highlights: [...prev.highlights, clean] }));
    setHighlightInput('');
  };

  return (
    <div className="fm-scroll">
      <div className="fm-sheet">
        <div className="fm-header">
          <h1>Front Page & Manuscript Metadata</h1>
          <p>
            Automatically formatted for your active LaTeX template (<strong>{activeManifest.name}</strong> —{' '}
            <code>{activeManifest.documentClass}</code>).
          </p>
        </div>

        {/* Title & Venue */}
        <section className="fm-card">
          <div className="fm-card-title">Title & Identifiers</div>
          <div className="fm-field">
            <label>Full Article Title</label>
            <input
              type="text"
              className="mirtex-input"
              value={fm.title}
              onChange={(e) => updateFrontMatter((p) => ({ ...p, title: e.target.value }))}
              placeholder="Enter the full manuscript title…"
            />
          </div>
          <div className="fm-grid-2">
            <div className="fm-field">
              <label>Short / Running Title (used in sn-jnl headers)</label>
              <input
                type="text"
                className="mirtex-input"
                value={fm.shortTitle}
                onChange={(e) => updateFrontMatter((p) => ({ ...p, shortTitle: e.target.value }))}
                placeholder="Concise header title"
              />
            </div>
            <div className="fm-field">
              <label>Date</label>
              <input
                type="text"
                className="mirtex-input"
                value={fm.date}
                onChange={(e) => updateFrontMatter((p) => ({ ...p, date: e.target.value }))}
              />
            </div>
          </div>
        </section>

        {/* Authors */}
        <section className="fm-card">
          <div className="fm-card-header">
            <div className="fm-card-title">Authors ({fm.authors.length})</div>
            <button type="button" className="mirtex-btn" onClick={addAuthor}>
              <Plus size={13} /> Add Author
            </button>
          </div>
          {fm.authors.map((author, idx) => (
            <div key={author.id} className="fm-subcard">
              <div className="fm-subcard-top">
                <strong style={{ fontSize: 12.5 }}>Author {idx + 1}</strong>
                {fm.authors.length > 1 && (
                  <button
                    type="button"
                    className="binder-icon-btn danger"
                    onClick={() => removeAuthor(author.id)}
                    title="Remove author"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
              <div className="fm-grid-2">
                <div className="fm-field">
                  <label>First / Given Name(s)</label>
                  <input
                    className="mirtex-input"
                    value={author.firstName}
                    onChange={(e) => updateAuthor(author.id, { firstName: e.target.value })}
                    placeholder="First name"
                  />
                </div>
                <div className="fm-field">
                  <label>Last / Family Name</label>
                  <input
                    className="mirtex-input"
                    value={author.lastName}
                    onChange={(e) => updateAuthor(author.id, { lastName: e.target.value })}
                    placeholder="Surname"
                  />
                </div>
              </div>
              <div className="fm-grid-2">
                <div className="fm-field">
                  <label>Email</label>
                  <input
                    className="mirtex-input"
                    value={author.email}
                    onChange={(e) => updateAuthor(author.id, { email: e.target.value })}
                    placeholder="name@institution.edu"
                  />
                </div>
                <div className="fm-field">
                  <label>ORCID iD (optional)</label>
                  <input
                    className="mirtex-input"
                    value={author.orcid || ''}
                    onChange={(e) => updateAuthor(author.id, { orcid: e.target.value })}
                    placeholder="0000-0000-0000-0000"
                  />
                </div>
              </div>
              <div className="fm-field">
                <label>Affiliations</label>
                <div className="fm-chip-row">
                  {fm.affiliations.map((aff, aIdx) => {
                    const selected = author.affiliationIds.includes(aff.id);
                    return (
                      <button
                        key={aff.id}
                        type="button"
                        className={`fm-affil-toggle ${selected ? 'selected' : ''}`}
                        onClick={() => toggleAuthorAffil(author.id, aff.id)}
                      >
                        [{aIdx + 1}] {aff.institution || aff.department || `Affiliation ${aIdx + 1}`}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="fm-checkbox-row">
                <label>
                  <input
                    type="checkbox"
                    checked={author.corresponding}
                    onChange={(e) => updateAuthor(author.id, { corresponding: e.target.checked })}
                  />
                  Corresponding Author (*)
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={Boolean(author.equalContribution)}
                    onChange={(e) => updateAuthor(author.id, { equalContribution: e.target.checked })}
                  />
                  Equal Contribution
                </label>
              </div>
            </div>
          ))}
        </section>

        {/* Affiliations */}
        <section className="fm-card">
          <div className="fm-card-header">
            <div className="fm-card-title">Affiliations ({fm.affiliations.length})</div>
            <button type="button" className="mirtex-btn" onClick={addAffiliation}>
              <Plus size={13} /> Add Affiliation
            </button>
          </div>
          {fm.affiliations.map((aff, idx) => (
            <div key={aff.id} className="fm-subcard">
              <div className="fm-subcard-top">
                <strong style={{ fontSize: 12.5 }}>Affiliation [{idx + 1}]</strong>
                {fm.affiliations.length > 1 && (
                  <button
                    type="button"
                    className="binder-icon-btn danger"
                    onClick={() => removeAffiliation(aff.id)}
                    title="Remove affiliation"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
              <div className="fm-grid-2">
                <div className="fm-field">
                  <label>Department / Division</label>
                  <input
                    className="mirtex-input"
                    value={aff.department}
                    onChange={(e) => updateAffiliation(aff.id, { department: e.target.value })}
                    placeholder="Department of Neuroscience"
                  />
                </div>
                <div className="fm-field">
                  <label>Institution / University</label>
                  <input
                    className="mirtex-input"
                    value={aff.institution}
                    onChange={(e) => updateAffiliation(aff.id, { institution: e.target.value })}
                    placeholder="University Name"
                  />
                </div>
              </div>
              <div className="fm-grid-3">
                <div className="fm-field">
                  <label>City</label>
                  <input
                    className="mirtex-input"
                    value={aff.city}
                    onChange={(e) => updateAffiliation(aff.id, { city: e.target.value })}
                  />
                </div>
                <div className="fm-field">
                  <label>State / Postcode</label>
                  <input
                    className="mirtex-input"
                    value={aff.state || ''}
                    onChange={(e) => updateAffiliation(aff.id, { state: e.target.value })}
                  />
                </div>
                <div className="fm-field">
                  <label>Country</label>
                  <input
                    className="mirtex-input"
                    value={aff.country}
                    onChange={(e) => updateAffiliation(aff.id, { country: e.target.value })}
                  />
                </div>
              </div>
            </div>
          ))}
        </section>

        {/* Keywords & Highlights */}
        <section className="fm-card">
          <div className="fm-card-title">Keywords</div>
          <div className="fm-chip-row">
            {fm.keywords.map((kw) => (
              <span key={kw} className="fm-chip">
                {kw}
                <button
                  type="button"
                  onClick={() =>
                    updateFrontMatter((p) => ({ ...p, keywords: p.keywords.filter((k) => k !== kw) }))
                  }
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="mirtex-input"
              placeholder="Type a keyword and press Enter…"
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              onKeyDown={handleKeywordKeyDown}
            />
            <button type="button" className="mirtex-btn" onClick={addKeyword}>
              Add
            </button>
          </div>
        </section>

        {/* Journal Declarations (Springer Nature / Nature / PLOS) */}
        <section className="fm-card">
          <div className="fm-card-title">Journal Declarations (Springer Nature / Biomedical)</div>
          <div className="fm-field">
            <label>Funding</label>
            <textarea
              className="mirtex-textarea"
              value={fm.declarations.funding}
              onChange={(e) =>
                updateFrontMatter((p) => ({
                  ...p,
                  declarations: { ...p.declarations, funding: e.target.value },
                }))
              }
            />
          </div>
          <div className="fm-field">
            <label>Conflict of Interest / Competing Interests</label>
            <textarea
              className="mirtex-textarea"
              value={fm.declarations.conflictOfInterest}
              onChange={(e) =>
                updateFrontMatter((p) => ({
                  ...p,
                  declarations: { ...p.declarations, conflictOfInterest: e.target.value },
                }))
              }
            />
          </div>
          <div className="fm-field">
            <label>Data Availability</label>
            <textarea
              className="mirtex-textarea"
              value={fm.declarations.dataAvailability}
              onChange={(e) =>
                updateFrontMatter((p) => ({
                  ...p,
                  declarations: { ...p.declarations, dataAvailability: e.target.value },
                }))
              }
            />
          </div>
          <div className="fm-grid-2">
            <div className="fm-field">
              <label>Ethics Approval (optional)</label>
              <textarea
                className="mirtex-textarea"
                value={fm.declarations.ethicsApproval}
                onChange={(e) =>
                  updateFrontMatter((p) => ({
                    ...p,
                    declarations: { ...p.declarations, ethicsApproval: e.target.value },
                  }))
                }
              />
            </div>
            <div className="fm-field">
              <label>Code Availability / Author Contributions (optional)</label>
              <textarea
                className="mirtex-textarea"
                value={fm.declarations.codeAvailability}
                onChange={(e) =>
                  updateFrontMatter((p) => ({
                    ...p,
                    declarations: { ...p.declarations, codeAvailability: e.target.value },
                  }))
                }
              />
            </div>
          </div>
        </section>

        {/* Research Highlights (Elsevier) */}
        <section className="fm-card">
          <div className="fm-card-title">Research Highlights (Optional — for Elsevier templates)</div>
          {fm.highlights.map((h, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ flex: 1, fontSize: 13 }}>• {h}</span>
              <button
                type="button"
                className="binder-icon-btn danger"
                onClick={() =>
                  updateFrontMatter((p) => ({
                    ...p,
                    highlights: p.highlights.filter((_, idx) => idx !== i),
                  }))
                }
              >
                <X size={13} />
              </button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="mirtex-input"
              placeholder="Add a key bullet-point highlight…"
              value={highlightInput}
              onChange={(e) => setHighlightInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addHighlight();
                }
              }}
            />
            <button type="button" className="mirtex-btn" onClick={addHighlight}>
              Add
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
