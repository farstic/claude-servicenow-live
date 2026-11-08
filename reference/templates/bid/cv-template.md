# CV template and staffing matrix

Use this template for CVs in a bid, pre-qualification or panel tender. CVs and the staffing matrix live in the bid folder and in the git-ignored bidder profile (`cv-library/`), never in engine files. A CV is used only with the person's consent.

## CV layout (2–4 pages, one layout across the whole bid)

1. **Header.**
   - Role title, matching the seniority band of the rate card.
   - The bidder's legal-entity name, spelt the same way everywhere.
   - Country of residence.
   - Languages, with CEFR level.
2. **Slot box.**
   - The modules this CV covers in this bid.
   - Years per module, calculated from the dated projects. State how they are counted.
   - The key certifications for those modules.
3. **Profile (3–5 lines).** Tailored to the slot modules and the customer's industry, citing comparable engagements.
4. **Key skills and strengths.** At most five each.
5. **Certifications table.**

   | Certification | Type (mainline, CIS, micro, other) | Date obtained | ID or verification link | Valid until |
   |---|---|---|---|---|

6. **Relevant projects, newest first.** For each project:
   - dates, on the same row;
   - client descriptor, following the anonymisation rule;
   - industry and country;
   - modules;
   - role;
   - scope and size;
   - three to six activity bullets;
   - outcomes;
   - technologies.
7. **Earlier experience.** Condensed.
8. **Education and relevant training.** Condensed. Do not reproduce long course lists.

## Rules

- **Consistency.**
  - The years claimed in the questionnaire equal the years calculated from the CV dates.
  - Round down, never up.
- **Module evidence.** A slot module is evidenced by projects, not by a certificate alone. A certificate-only slot is graded "weak".
- **Anonymisation.**
  - One rule for the whole bid.
  - No client name in a bullet unless naming consent exists and the reference list names the same client.
  - Initials are written in one format, the same as in the questionnaire.
  - If the RFP rejects sample or anonymised CVs, raise it in the clarification window before choosing to use initials.
- **Relevance.** No unrelated side projects in senior profiles. Industry experience is shown where the RFP asks for it.
- **File names.**
  - Name each file `<Module>_<slot>.pdf`, matching the questionnaire row.
  - A consultant covering two slots gets one source and one PDF, named `<ModuleA>_<n> and <ModuleB>_<n>`. Never keep two copies of the same source.
- **Before sending.** Spell-check, clean the metadata, and regenerate the PDFs from the final source.

## Staffing matrix (single source of truth for slots, years and CVs)

| Internal ID | Disclosed as (name / initials) | Country, EU/EEA | Seniority band | Languages | Available within N weeks | Continuity risk | CV file | CV status | Owner |
|---|---|---|---|---|---|---|---|---|---|

Repeat these columns for each module in scope:

| Slot (1 / 2) | Years (from CV dates) | Certification evidence | Projects as evidence | Last project date | Evidence grade (strong / adequate / weak) |
|---|---|---|---|---|---|

Validation rules (check each one before submission):
1. Every module has the required number of unique consultants.
2. No consultant is above the maximum number of modules the RFP allows.
3. The location and language constraints are met.
4. Years in the questionnaire = years in the matrix = years derived from the CV dates.
5. The slot order in the matrix = the questionnaire = the CV file names.
6. Headcount figures state their basis: entity or group; unique or multi-skilled.
7. Every module has at least one reference card.
8. Every "weak" grade is replaced or escalated.
