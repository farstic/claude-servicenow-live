# prompt-patterns.md — Reusable Prompt Templates

**Version:** 1.0
**For:** ServiceNow Architecture Engine v2.0
**Purpose:** Copy-paste prompt templates for common operations against the Chief Architect orchestrator.

## How to use


> **Governance:** all patterns below are subject to `governance-rules.md` §1.1 (Baseline-First / Zero Custom Objects). When a pattern's filled example references a custom scoped app or table (e.g., `x_acme_itsm`), the example is illustrative only — actual dispatch envelopes must either (a) declare "no custom objects required" or (b) carry explicit prior approval from the Chief Architect for any custom object the design will produce.


Each pattern has four parts: name (`PP-XX`), when-to-use, the template (with `{{PLACEHOLDERS}}`), and a filled example. Copy the template, replace placeholders, paste into chat. The Chief Architect handles routing from there.

Conventions:
- `{{PLACEHOLDER}}` — required input.
- `{{OPTIONAL: hint}}` — optional input; remove the line if unused.
- Patterns are grouped by phase: Routing → Discovery → Design → Build → Review → Quality.

---

## Group A — Routing and orchestration

### PP-01: Status check
**When to use:** Start of any session, or when uncertain about active persona, release-family lock, or roster state.

**Template:**
> Status

**Example (filled):**
> Status

*Chief Architect responds with active persona (or "routing"), roster summary across the four functional groups, release-family confirmation (Australia), and any drift detected in recent prompts.*

---

### PP-02: Explicit specialist invocation
**When to use:** You have already decided which specialist is correct and want to bypass the routing-protocol approval step.

**Template:**
> Act as the {{SPECIALIST_NAME}}.
> Task: {{TASK_DESCRIPTION}}.
> Constraints: {{OPTIONAL: release family, scoped app prefix, performance targets}}.
> Inputs:
> {{OPTIONAL: paste of relevant context, design docs, transcripts, code}}

**Example (filled):**
> Act as the Story Writer.
> Task: Produce sprint-ready Gherkin stories for an incident escalation feature based on the transcript below.
> Constraints: Australia release; ITSM module; Service Operations Workspace; existing escalation table is `sn_si_incident`.
> Inputs:
> [paste workshop transcript]

---

### PP-03: Confidentiality firewall reset
**When to use:** You realise you've pasted client-specific content into the Master Project. Use immediately to clear context and confirm the firewall is intact.

**Template:**
> The previous message contained client-specific content and was posted in the Master Project by mistake. Confirm the confidentiality firewall and tell me which satellite project I should move to. Do not echo the content back.

**Example (filled):**
*(Use as-is, no placeholders.)*

---

## Group B — Discovery and requirements

### PP-04: Transcript-to-stories chain
**When to use:** You have a workshop or interview transcript and need sprint-ready Gherkin stories. This is the "Discovery extracts → Story Writer converts" two-step pattern from taxonomy §5.

**Template:**
> Two-step task. Step 1: Discovery Specialist extracts requirements from the transcript below — produce a structured requirements list with personas, processes, gaps, and open questions. Step 2: Story Writer converts the requirements into Gherkin Feature files following ServiceNow conventions, with explicit OPEN QUESTIONS blocks.
>
> Module: {{MODULE — ITSM / CSM / HRSD / etc.}}
> Workspace / portal: {{WORKSPACE_OR_PORTAL_NAME}}
> Roles in scope: {{ROLE_LIST}}
>
> Transcript:
> [paste transcript]

**Example (filled):**
> Two-step task. Step 1: Discovery Specialist extracts requirements from the transcript below. Step 2: Story Writer converts to Gherkin.
>
> Module: ITSM
> Workspace / portal: Service Operations Workspace
> Roles in scope: itil, sn_incident_write, l1_agent
>
> Transcript:
> [paste workshop transcript]

---

### PP-05: Gap analysis from current/target state
**When to use:** You've described both current and target state and need a structured gap list for an HLD or roadmap.

**Template:**
> Discovery Specialist task: produce a gap analysis between the current state and target state described below. Output: structured table of gaps with category (process / data / integration / role / capability), severity (blocker / major / minor), recommended remediation, and owning specialist for downstream design.
>
> Current state:
> {{CURRENT_STATE_DESCRIPTION}}
>
> Target state:
> {{TARGET_STATE_DESCRIPTION}}

---

## Group C — Design

### PP-06: HLD initiation
**When to use:** You need a High-Level Design document for a feature, programme, or scoped application.

**Template:**
> HLD/LLD Writer task: produce a High-Level Design for {{SOLUTION_OR_PROGRAMME_NAME}} following the standard 8-section template (Executive Summary, Solution Overview, Functional Architecture, Technical Architecture, Integrations, Security & Compliance, Operations, Open Decisions).
>
> Scope: {{SCOPE_STATEMENT}}
> Modules involved: {{MODULE_LIST}}
> Integrations in scope: {{INTEGRATION_LIST}}
> Personas: {{PERSONA_LIST}}
> Known constraints: {{CONSTRAINT_LIST}}
> Release family: Australia
>
> Surface routing-time consults per taxonomy §3.1.

---

### PP-07: LLD initiation
**When to use:** HLD is approved and you need component-level Low-Level Design.

**Template:**
> HLD/LLD Writer task: produce a Low-Level Design for the components listed below. For each component, deliver: purpose, table/field model, ACL matrix, business rule list with rationale, flow steps, configuration steps, and test approach.
>
> Components:
> 1. {{COMPONENT_1}}
> 2. {{COMPONENT_2}}
> 3. {{COMPONENT_3}}
>
> Parent HLD: {{REFERENCE_TO_HLD}}
> Scoped app prefix: {{SCOPE_PREFIX — e.g., x_acme_app}}
> Release family: Australia

---

### PP-08: Technical design with consult flags
**When to use:** You need a technical design (table model, ACLs, business rule list, flow design) but not yet a full LLD.

**Template:**
> Technical Designer task: design the {{COMPONENT_OR_FEATURE_NAME}} per the requirements below. Deliver: table model, field list with types, ACL matrix, business rule list with rationale, flow outline, integration touchpoints, and explicit OPEN QUESTIONS for client decisions.
>
> Requirements:
> {{REQUIREMENTS_LIST_OR_REFERENCE}}
>
> Volume context: {{VOLUME_ESTIMATES — e.g., 50K incidents/year, 5M CIs}}
> Sensitive data in scope: {{YES_NO_AND_TYPE — e.g., PII, financial, HR}}
> Scoped app prefix: {{SCOPE_PREFIX}}
>
> Surface taxonomy §3.1 routing-time consults that fire (Performance & Scale, Security & GRC, CMDB & CSDM, DevOps).

---

## Group D — Build

### PP-09: Developer task with consult flags
**When to use:** You have a design and need code (Script Include, Business Rule, Client Script, Scheduled Job, Background Script).

**Template:**
> Developer task: implement {{ARTEFACT_TYPE}} named {{ARTEFACT_NAME}} per the spec below.
>
> Spec:
> {{DESIGN_SPEC_OR_LLD_REFERENCE}}
>
> Scoped app prefix: {{SCOPE_PREFIX}}
> Volume context: {{VOLUME_ESTIMATES}}
> Roles required: {{ROLE_LIST}}
>
> Surface taxonomy §3.1 consults that fire pre-build, and follow §6.2 post-build evaluation: Code Reviewer pass before final delivery.

**Example (filled):**
> Developer task: implement a Script Include named SLABreachRiskCalculator per the spec below.
>
> Spec:
> - Class: SLABreachRiskCalculator
> - Method: calculateRisk(incidentSysId)
> - Returns: { risk: 'low' | 'medium' | 'high', score: 0-100, basis: string }
> - Calculation: based on assignment_group historical breach rate from contract_sla over the past 90 days, weighted by current priority and elapsed % of SLA.
>
> Scoped app prefix: x_acme_itsm
> Volume context: ~3M historical incidents, ~50K active concurrent. Must complete in <100ms when called from a Business Rule.
> Roles required: x_acme_itsm.user
>
> Surface §3.1 consults and follow §6.2.

---

### PP-10: Flow design
**When to use:** You need a Flow Designer flow, subflow, or custom Action.

**Template:**
> Flow Designer Specialist task: design a {{FLOW / SUBFLOW / ACTION}} named {{FLOW_NAME}} that {{TRIGGER_AND_PURPOSE}}.
>
> Trigger: {{TRIGGER_TYPE — record event / scheduled / programmatic / form button}}
> Inputs: {{INPUT_LIST}}
> Outputs: {{OUTPUT_LIST}}
> Integrations called: {{INTEGRATION_LIST_IF_ANY}}
> Error handling: {{ERROR_HANDLING_REQUIREMENTS}}
> Scoped app prefix: {{SCOPE_PREFIX}}

---

### PP-11: Integration design (steady-state)
**When to use:** Ongoing data flow between ServiceNow and another system. Use PP-12 for one-time migration.

**Template:**
> Integration Specialist task: design the integration between ServiceNow and {{EXTERNAL_SYSTEM}} per the requirements below.
>
> Direction: {{INBOUND / OUTBOUND / BIDIRECTIONAL}}
> Trigger: {{TRIGGER_DESCRIPTION}}
> Payload: {{PAYLOAD_DESCRIPTION_OR_SCHEMA_REFERENCE}}
> Volumes: {{TPS_OR_DAILY_VOLUME}}
> Authentication: {{AUTH_METHOD — OAuth2 / mutual TLS / API key / basic}}
> Network: {{MID_SERVER_REQUIRED_YES_NO}}
> SLA: {{LATENCY_AND_AVAILABILITY_TARGETS}}
> Scoped app prefix: {{SCOPE_PREFIX}}
>
> Surface §3.1 consults: Security & GRC for sensitive payloads, CMDB & CSDM if writes target `cmdb_*`.

---

### PP-12: Migration design (one-time)
**When to use:** One-time data load from a legacy system with cutover.

**Template:**
> Migration Specialist task: design the one-time migration from {{LEGACY_SYSTEM}} into ServiceNow per the requirements below.
>
> Source tables: {{SOURCE_TABLE_LIST}}
> Target tables: {{TARGET_TABLE_LIST}}
> Volume: {{RECORD_COUNT}}
> Cutover window: {{TIME_WINDOW}}
> Data quality requirements: {{DQ_REQUIREMENTS}}
> Rollback strategy: {{ROLLBACK_REQUIREMENTS}}

---

### PP-13: Now Assist capability design
**When to use:** AI Agent, Now Assist skill, or agentic workflow design.

**Template:**
> Now Assist Specialist task: design the {{AI_AGENT / NOW_ASSIST_SKILL / AGENTIC_WORKFLOW}} named {{CAPABILITY_NAME}} per the spec below.
>
> Capability: {{ONE_SENTENCE_CAPABILITY_STATEMENT}}
> Trigger: {{TRIGGER_TYPE}}
> Inputs: {{INPUT_LIST}}
> Tools / actions available: {{TOOL_LIST}}
> Confidence routing: {{HIGH_CONFIDENCE_ACTION_VS_LOW_CONFIDENCE_ACTION}}
> Override conditions: {{HUMAN_IN_LOOP_CONDITIONS}}
> Multilanguage scope: {{LANGUAGE_LIST}}
> Scoped app prefix: {{SCOPE_PREFIX}}

---

## Group E — Review and consult

### PP-14: Code Review pass (manual invocation)
**When to use:** You have code (yours or inherited) and want a review against the four checklists. Note: §6.2 fires this automatically after Developer sub-agent completes — this pattern is for *manual* invocation on existing code.

**Template:**
> Code Reviewer task: review the code below against the four checklists (style, performance, security, best-practice). Output the standard review report with severity ratings (block / fix-before-prod / consider) and explicit recommendations.
>
> Artefact type: {{SCRIPT_INCLUDE / BUSINESS_RULE / CLIENT_SCRIPT / FLOW_ACTION / ATF_STEP}}
> Context: {{TABLE_AND_TRIGGER_CONTEXT}}
> Volume context: {{VOLUME_ESTIMATES}}
> Sensitivity context: {{SENSITIVE_DATA_FLAG}}
>
> Code:
> ```javascript
> [paste code]
> ```

---

### PP-15: Performance & Scale audit
**When to use:** Forward-looking design check at high volumes, or audit of an existing design against scale assumptions.

**Template:**
> Performance & Scale Specialist task: {{AUDIT_OR_DESIGN}} the {{COMPONENT_NAME}} for the following scale assumptions.
>
> Volume: {{RECORD_COUNT_AND_GROWTH}}
> Throughput: {{TPS_OR_QPS}}
> Latency target: {{LATENCY_TARGET}}
> Concurrency: {{CONCURRENT_USER_COUNT}}
> Failure budget: {{ALLOWED_DOWNTIME_OR_ERROR_RATE}}
>
> Artefact under review:
> {{PASTE_DESIGN_OR_CODE}}

---

### PP-16: Security & GRC ACL review
**When to use:** ACL design review, RBAC model design, audit-logging design, or GRC control mapping.

**Template:**
> Security & GRC Specialist task: design / review the {{ACL_MODEL / RBAC / AUDIT_LOGGING}} for {{COMPONENT_NAME}}.
>
> Sensitive data classification: {{PII / FINANCIAL / HR / NONE}}
> Roles in scope: {{ROLE_LIST}}
> Tables in scope: {{TABLE_LIST}}
> Regulatory drivers: {{GDPR / SOX / ISO27001 / OTHER}}
> Threat model concerns: {{KNOWN_CONCERNS}}

---

## Group F — Quality and operations

### PP-17: ATF authoring
**When to use:** New code or flow needs ATF coverage. Skill mode for single component, sub-agent mode for full app suite.

**Template:**
> ATF Author task ({{SKILL_MODE / SUB_AGENT_MODE}}): produce ATF coverage for {{COMPONENT_OR_APP_NAME}}.
>
> Artefact under test:
> {{PASTE_CODE_OR_FLOW_OR_REFERENCE}}
>
> Test scope: {{HAPPY_PATH_ONLY / HAPPY_PATH_PLUS_EDGES / FULL_NEGATIVE_COVERAGE}}
> Test data requirements: {{TEST_DATA_NEEDS}}
> Deployment notes: {{UPDATE_SET_OR_REPO}}

---

### PP-18: Runbook + KBA authoring
**When to use:** Feature is approaching production readiness. §3.2 fires this automatically on go-live signal — this pattern is for explicit invocation.

**Template:**
> Operational Documentation task: produce {{RUNBOOK / KBA / BOTH}} for {{FEATURE_OR_PROCESS_NAME}}.
>
> Audience: {{OPERATORS / END_USERS / L1_SUPPORT / L2_SUPPORT}}
> Tone: {{INSTRUCTIONAL / REFERENCE / TROUBLESHOOTING}}
> Procedures to cover: {{PROCEDURE_LIST}}
> Known failure modes: {{FAILURE_MODE_LIST}}
> Related KBAs: {{REFERENCE_LIST_IF_ANY}}

---

## Maintenance

This file is updated when:
- A new specialist persona is added — add the relevant build / review pattern.
- A real prompt-flow proves useful enough to commit as a pattern — add it.
- The Chief Architect's routing protocol changes — update affected templates.

Updates committed with message: `prompt-patterns: <change-summary>`.

---

*End of prompt-patterns.md v1.0.*
