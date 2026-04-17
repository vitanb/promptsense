'use strict';
/**
 * PromptSense — Industry Compliance Rule Engine
 *
 * Defines hard-coded, compliance-grade guardrail rule sets for regulated industries.
 * These rules are enforced by the proxy at request time when an org has
 * `settings.compliance_mode` set, regardless of org-level guardrail configuration.
 *
 * Rules are also exposed as the industry template library via the API so orgs can
 * browse and import them as persistent guardrail records.
 *
 * Industries:
 *   - hipaa      : Healthcare / HIPAA (US)
 *   - financial  : Financial Services / SOX / PCI-DSS
 *   - legal      : Legal / Privilege / eDiscovery
 *   - government : Government / FedRAMP / CUI
 */

/**
 * @typedef {Object} ComplianceRule
 * @property {string}   id          - Stable snake_case identifier
 * @property {string}   name        - Display name
 * @property {string}   description - Human-readable explanation of what is blocked / flagged
 * @property {'input'|'output'|'both'} type
 * @property {'critical'|'high'|'medium'|'low'} severity
 * @property {'block'|'warn'|'log'}  action
 * @property {string}   pattern     - JavaScript RegExp source string (case-insensitive flag applied at runtime)
 * @property {string}   color       - Hex color for display
 * @property {string[]} tags        - Compliance framework tags (e.g. ['hipaa', 'phi'])
 */

/** @type {Record<string, { label: string; icon: string; color: string; description: string; standards: string[]; rules: ComplianceRule[] }>} */
const INDUSTRY_TEMPLATES = {

  // ─────────────────────────────────────────────────────────────────────────────
  hipaa: {
    label:       'Healthcare / HIPAA',
    icon:        '🏥',
    color:       '#2563EB',
    description: 'Protects Protected Health Information (PHI) as required by the Health Insurance Portability and Accountability Act. Blocks 18 HIPAA identifiers and clinical data patterns in both prompts and responses.',
    standards:   ['HIPAA Privacy Rule', 'HIPAA Security Rule', 'HITECH Act', '45 CFR §164'],
    rules: [
      {
        id: 'hipaa_mrn',
        name: 'PHI — Medical Record Number',
        description: 'Blocks medical record number (MRN) patterns — a HIPAA direct identifier.',
        type: 'both', severity: 'critical', action: 'block', color: '#2563EB',
        pattern: String.raw`\b(MRN|medical record(?: number)?|chart number|patient (id|identifier))[:\s#]*\d{5,12}\b`,
        tags: ['hipaa', 'phi'],
      },
      {
        id: 'hipaa_npi',
        name: 'PHI — NPI / Provider Number',
        description: 'Blocks National Provider Identifier (NPI) — a 10-digit healthcare provider ID.',
        type: 'both', severity: 'critical', action: 'block', color: '#2563EB',
        pattern: String.raw`\b(NPI|national provider identifier)[:\s#]*\d{10}\b`,
        tags: ['hipaa', 'phi'],
      },
      {
        id: 'hipaa_dea',
        name: 'PHI — DEA Registration Number',
        description: 'Blocks Drug Enforcement Administration registration numbers used in prescriptions.',
        type: 'both', severity: 'critical', action: 'block', color: '#2563EB',
        pattern: String.raw`\b[A-Z]{2}\d{7}\b`,
        tags: ['hipaa', 'phi'],
      },
      {
        id: 'hipaa_diagnosis',
        name: 'PHI — Diagnosis & Condition Data',
        description: 'Flags clinical diagnosis, treatment, and prescription terms paired with potential patient context.',
        type: 'both', severity: 'critical', action: 'block', color: '#2563EB',
        pattern: String.raw`\b(diagnosis|diagnosed with|medical condition|clinical finding|prescription for|prescribed|treatment plan|patient presents|chief complaint|differential diagnosis|ICD-10|ICD-11|DSM-5)\b`,
        tags: ['hipaa', 'phi', 'clinical'],
      },
      {
        id: 'hipaa_insurance',
        name: 'PHI — Health Insurance Identifiers',
        description: 'Blocks health plan beneficiary numbers, insurance IDs, and policy numbers.',
        type: 'both', severity: 'critical', action: 'block', color: '#2563EB',
        pattern: String.raw`\b(health plan (number|id|beneficiary)|insurance (policy|member|group) (id|number)|beneficiary id|subscriber id)[:\s#]*[\w\d\-]{4,20}\b`,
        tags: ['hipaa', 'phi'],
      },
      {
        id: 'hipaa_dates',
        name: 'PHI — Dates Linked to Individuals',
        description: 'Flags dates of birth, admission, discharge, and death when appearing with patient identifiers.',
        type: 'both', severity: 'high', action: 'warn', color: '#2563EB',
        pattern: String.raw`\b(date of birth|dob|d\.o\.b|born on|admitted on|admission date|discharge date|date of death)\b`,
        tags: ['hipaa', 'phi'],
      },
      {
        id: 'hipaa_ssn',
        name: 'PHI — Social Security Number',
        description: 'Blocks US Social Security Numbers — a HIPAA direct identifier.',
        type: 'both', severity: 'critical', action: 'block', color: '#2563EB',
        pattern: String.raw`\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b`,
        tags: ['hipaa', 'phi', 'ssn'],
      },
      {
        id: 'hipaa_phi_geographic',
        name: 'PHI — Sub-State Geographic Data',
        description: 'Flags geographic units smaller than a state (street address, zip+4, city block) that could identify a patient.',
        type: 'both', severity: 'high', action: 'warn', color: '#2563EB',
        pattern: String.raw`\b(\d{1,5}\s[\w\s]{2,30}(street|st|avenue|ave|boulevard|blvd|road|rd|drive|dr|lane|ln|way|court|ct|place|pl))\b`,
        tags: ['hipaa', 'phi'],
      },
      {
        id: 'hipaa_prompt_injection',
        name: 'HIPAA — Role Override Attempt',
        description: 'Blocks attempts to redirect the AI into acting as an unregulated medical advisor.',
        type: 'input', severity: 'critical', action: 'block', color: '#2563EB',
        pattern: String.raw`(act as (a )?(doctor|physician|nurse|clinician|pharmacist)|ignore (hipaa|phi|privacy)|pretend you.re a medical|no restrictions on (medical|health|patient))`,
        tags: ['hipaa', 'injection'],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  financial: {
    label:       'Financial Services / PCI-DSS / SOX',
    icon:        '🏦',
    color:       '#059669',
    description: 'Protects payment card data, account credentials, and financially sensitive information as required by PCI-DSS, SOX Section 404, and GLBA. Blocks card numbers, routing data, and insider trading signals.',
    standards:   ['PCI-DSS v4.0', 'SOX §302 / §404', 'GLBA', 'FINRA Rule 4370', 'SEC Reg S-P'],
    rules: [
      {
        id: 'fin_pci_pan',
        name: 'PCI-DSS — Payment Card Number (PAN)',
        description: 'Blocks primary account numbers for Visa, Mastercard, Amex, Discover, and JCB.',
        type: 'both', severity: 'critical', action: 'block', color: '#059669',
        pattern: String.raw`\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12}|(?:2131|1800|35\d{3})\d{11})\b`,
        tags: ['financial', 'pci-dss', 'pan'],
      },
      {
        id: 'fin_pci_cvv',
        name: 'PCI-DSS — CVV / CVV2 / CVC',
        description: 'Flags card security code patterns — forbidden to store under PCI-DSS.',
        type: 'both', severity: 'critical', action: 'block', color: '#059669',
        pattern: String.raw`\b(cvv|cvv2|cvc|csc|card (security|verification) (code|number|value))[:\s]*\d{3,4}\b`,
        tags: ['financial', 'pci-dss'],
      },
      {
        id: 'fin_routing',
        name: 'Financial — ABA Routing Number',
        description: 'Blocks US bank routing numbers (9-digit ABA format).',
        type: 'both', severity: 'critical', action: 'block', color: '#059669',
        pattern: String.raw`\b(routing (number|no\.?)|aba|RTN)[:\s#]*\d{9}\b`,
        tags: ['financial', 'banking'],
      },
      {
        id: 'fin_account',
        name: 'Financial — Bank Account Numbers',
        description: 'Blocks bank account number patterns commonly found in wire transfer instructions.',
        type: 'both', severity: 'critical', action: 'block', color: '#059669',
        pattern: String.raw`\b(account (number|no\.?|num)|acct\.?)[:\s#]*\d{8,17}\b`,
        tags: ['financial', 'banking'],
      },
      {
        id: 'fin_swift',
        name: 'Financial — SWIFT / BIC Code',
        description: 'Flags SWIFT/BIC codes used in international wire transfers.',
        type: 'both', severity: 'high', action: 'warn', color: '#059669',
        pattern: String.raw`\b[A-Z]{4}[A-Z]{2}[A-Z2-9][A-NP-Z0-9]([A-Z0-9]{3})?\b`,
        tags: ['financial', 'wire-transfer'],
      },
      {
        id: 'fin_ssn',
        name: 'Financial — SSN in Financial Context',
        description: 'Blocks Social Security Numbers appearing alongside financial data.',
        type: 'both', severity: 'critical', action: 'block', color: '#059669',
        pattern: String.raw`\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b`,
        tags: ['financial', 'pii'],
      },
      {
        id: 'fin_insider',
        name: 'SOX — Insider Information Signals',
        description: 'Flags language indicating potential insider trading scenarios — material non-public information (MNPI).',
        type: 'both', severity: 'high', action: 'warn', color: '#059669',
        pattern: String.raw`\b(material non-public|MNPI|insider (information|trading|knowledge)|non-public information|before (the )?announcement|earnings (before|ahead of|prior to)|merger (secret|confidential|unreleased))\b`,
        tags: ['financial', 'sox', 'insider'],
      },
      {
        id: 'fin_investment_advice',
        name: 'FINRA — Unsolicited Investment Advice',
        description: 'Blocks the AI from generating definitive buy/sell/hold recommendations that could constitute unauthorized investment advice.',
        type: 'output', severity: 'high', action: 'block', color: '#059669',
        pattern: String.raw`\b(you should (buy|sell|invest in|short|go long)|I recommend (buying|selling|shorting)|guaranteed (return|profit|yield)|100% (safe|certain|guaranteed) investment|will definitely (rise|fall|go up|go down))\b`,
        tags: ['financial', 'finra', 'advice'],
      },
      {
        id: 'fin_cusip',
        name: 'Financial — CUSIP / ISIN / SEDOL',
        description: 'Flags securities identifiers that may appear in sensitive trading contexts.',
        type: 'both', severity: 'medium', action: 'log', color: '#059669',
        pattern: String.raw`\b([A-Z0-9]{9}[0-9]|[A-Z]{2}[A-Z0-9]{9}[0-9]|[0-9B-DF-HJ-NP-TV-XZ][0-9B-DF-HJ-NP-TV-Z]{5}[0-9])\b`,
        tags: ['financial', 'securities'],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  legal: {
    label:       'Legal / Attorney-Client Privilege',
    icon:        '⚖️',
    color:       '#7C3AED',
    description: 'Protects attorney-client privileged communications, work-product doctrine materials, and confidential case information from inadvertent disclosure through AI prompts or responses.',
    standards:   ['ABA Model Rules 1.6 / 1.9', 'FRCP Rule 26(b)(3)', 'FRE 502', 'State Bar Regulations'],
    rules: [
      {
        id: 'legal_privilege',
        name: 'Privilege — Attorney-Client Communication',
        description: 'Detects language indicating attorney-client privileged communications that should not be input into external AI systems.',
        type: 'both', severity: 'critical', action: 'block', color: '#7C3AED',
        pattern: String.raw`\b(attorney[- ]client privilege|privileged (and )?confidential|work product|attorney work[- ]product|do not disclose|legally privileged|subject to privilege)\b`,
        tags: ['legal', 'privilege'],
      },
      {
        id: 'legal_case_numbers',
        name: 'Legal — Case / Docket Numbers',
        description: 'Flags court case numbers and docket identifiers that could identify confidential litigation.',
        type: 'both', severity: 'high', action: 'warn', color: '#7C3AED',
        pattern: String.raw`\b(\d{1,2}[-:]\w{2,5}[-:]\d{4,8}|No\.\s*\d{2}[-:]\d{3,6}|Case\s+(No\.|Number|#)\s*[\w\d\-:]{4,20})\b`,
        tags: ['legal', 'litigation'],
      },
      {
        id: 'legal_settlement',
        name: 'Legal — Settlement & Mediation Confidentiality',
        description: 'Flags settlement amounts, mediation communications, and confidential resolution terms.',
        type: 'both', severity: 'critical', action: 'block', color: '#7C3AED',
        pattern: String.raw`\b(settlement (amount|agreement|terms|confidential)|mediation (communication|privilege|confidential)|subject to FRE 408|Rule 408|without prejudice)\b`,
        tags: ['legal', 'settlement'],
      },
      {
        id: 'legal_nda',
        name: 'Legal — NDA Protected Information',
        description: 'Detects references to non-disclosure agreements and their protected information.',
        type: 'both', severity: 'high', action: 'warn', color: '#7C3AED',
        pattern: String.raw`\b(under (NDA|non[- ]disclosure)|confidential (pursuant|per|under) (the )?(NDA|agreement|contract)|trade secret|proprietary (information|data|formula|process))\b`,
        tags: ['legal', 'nda', 'trade-secret'],
      },
      {
        id: 'legal_discovery',
        name: 'Legal — eDiscovery Restricted Material',
        description: 'Blocks submission of documents under litigation hold or protective order into AI systems.',
        type: 'input', severity: 'critical', action: 'block', color: '#7C3AED',
        pattern: String.raw`\b(litigation hold|legal hold|protective order|under seal|filed under seal|confidential.*discovery|discovery (material|document|evidence))\b`,
        tags: ['legal', 'ediscovery'],
      },
      {
        id: 'legal_pii_client',
        name: 'Legal — Client PII in Matters',
        description: 'Warns when client identifying information (SSN, DOB, addresses) appears alongside case references.',
        type: 'input', severity: 'high', action: 'warn', color: '#7C3AED',
        pattern: String.raw`\b(client (ssn|dob|date of birth|social security|address|phone|email)|(ssn|dob|date of birth|social security)\s+(of|for)\s+(client|plaintiff|defendant|opposing party))\b`,
        tags: ['legal', 'pii'],
      },
      {
        id: 'legal_injection',
        name: 'Legal — Unauthorized Legal Advice',
        description: 'Blocks the AI from being prompted to give definitive legal opinions as if it were a licensed attorney.',
        type: 'output', severity: 'high', action: 'block', color: '#7C3AED',
        pattern: String.raw`\b(as your (attorney|lawyer|legal counsel)|I advise you (legally|as your lawyer)|(legally speaking|as a matter of law), you (must|should|are required to)|this constitutes legal advice)\b`,
        tags: ['legal', 'advice'],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  government: {
    label:       'Government / FedRAMP / CUI',
    icon:        '🏛️',
    color:       '#B45309',
    description: 'Enforces handling rules for Controlled Unclassified Information (CUI) and classified markings per NIST SP 800-171, FedRAMP Moderate, and Executive Order 13526. Prevents classified material from entering commercial AI systems.',
    standards:   ['NIST SP 800-171', 'FedRAMP Moderate', 'EO 13526', 'NARA CUI Registry', 'ITAR', 'DoD 5200.01'],
    rules: [
      {
        id: 'gov_classification',
        name: 'CUI — Classification Markings',
        description: 'Blocks content with US government classification markings (SECRET, TOP SECRET, CONFIDENTIAL) from entering AI systems.',
        type: 'both', severity: 'critical', action: 'block', color: '#B45309',
        pattern: String.raw`\b(TOP SECRET|SECRET|CONFIDENTIAL|UNCLASSIFIED\/\/(FOUO|LES|SBU|NOFORN)|FOR OFFICIAL USE ONLY|FOUO|NOFORN|RELIDO|SI\/TK|SAR|ACCM)\b`,
        tags: ['government', 'classification', 'fedramp'],
      },
      {
        id: 'gov_cui',
        name: 'CUI — Controlled Unclassified Information Markers',
        description: 'Detects CUI category markings from the NARA CUI Registry (CUI//SP-MED, CUI//PRVCY, etc.).',
        type: 'both', severity: 'critical', action: 'block', color: '#B45309',
        pattern: String.raw`\bCUI\s*\/\/\s*(SP-|PRVCY|ITAR|CTI|EXPT|LEI|INTEL|MIL|NUC|INFRA|TAX|PROCURE|PROPPIN|RESRCE|SSI)\w*\b`,
        tags: ['government', 'cui'],
      },
      {
        id: 'gov_itar',
        name: 'ITAR — Defense Article / Technical Data',
        description: 'Flags International Traffic in Arms Regulations technical data and defense article references.',
        type: 'both', severity: 'critical', action: 'block', color: '#B45309',
        pattern: String.raw`\b(ITAR[- ]controlled|USML (Category|Item)|defense article|defense service|technical data.*ITAR|munitions list|22 CFR (120|121|122|123|124|125|126))\b`,
        tags: ['government', 'itar', 'export-control'],
      },
      {
        id: 'gov_ear',
        name: 'EAR — Export Administration Regulations',
        description: 'Flags Export Control Classification Numbers and dual-use technology export indicators.',
        type: 'both', severity: 'high', action: 'warn', color: '#B45309',
        pattern: String.raw`\b(ECCN\s+[0-9][A-E][0-9]{3}[a-z]?|EAR99|export[- ]controlled|controlled technology|Bureau of Industry|BIS (license|authorization))\b`,
        tags: ['government', 'ear', 'export-control'],
      },
      {
        id: 'gov_pii_federal',
        name: 'Federal PII — Privacy Act Records',
        description: 'Blocks submission of Privacy Act-covered federal records including employee IDs, clearance levels, and agency system records.',
        type: 'both', severity: 'critical', action: 'block', color: '#B45309',
        pattern: String.raw`\b(security clearance (level|status)|clearance (TS|SCI|SECRET|CONFIDENTIAL)|agency (employee|personnel) (id|identifier|number)|OPM record|SF-86|eQIP)\b`,
        tags: ['government', 'pii', 'privacy-act'],
      },
      {
        id: 'gov_source_code',
        name: 'FedRAMP — Government Source Code / System Configs',
        description: 'Warns on Federal government system configuration data and source code that should not leave FedRAMP-authorized environments.',
        type: 'both', severity: 'high', action: 'warn', color: '#B45309',
        pattern: String.raw`\b(fedramp[- ](authorized|boundary|system)|gov\.cloud|\.gov\.il|azure\.us|govcloud|aws-us-gov)\b`,
        tags: ['government', 'fedramp'],
      },
      {
        id: 'gov_injection',
        name: 'Government — System Boundary Override Attempt',
        description: 'Blocks attempts to make the AI ignore government data handling rules or operate outside its authorized boundary.',
        type: 'input', severity: 'critical', action: 'block', color: '#B45309',
        pattern: String.raw`(ignore (classification|cui|itar|fedramp)|disregard (security|handling) (markings|rules)|pretend (this|data) is unclassified|treat (this|it) as (unclassified|public))\b`,
        tags: ['government', 'injection'],
      },
    ],
  },
};

/**
 * Returns all industry template definitions (without rule details) for the template gallery.
 */
function getIndustryTemplates() {
  return Object.entries(INDUSTRY_TEMPLATES).map(([id, t]) => ({
    id,
    label:       t.label,
    icon:        t.icon,
    color:       t.color,
    description: t.description,
    standards:   t.standards,
    ruleCount:   t.rules.length,
    rules:       t.rules,
  }));
}

/**
 * Returns rules for a specific industry mode.
 * @param {string} mode  - One of 'hipaa' | 'financial' | 'legal' | 'government'
 * @returns {ComplianceRule[]}
 */
function getRulesForMode(mode) {
  return INDUSTRY_TEMPLATES[mode]?.rules || [];
}

/**
 * Runs compliance-mode guardrail rules against `text`.
 * Used by the proxy when `org.settings.compliance_mode` is set.
 *
 * @param {string} complianceMode  - Industry mode key
 * @param {string} text            - Prompt or response text to evaluate
 * @param {'input'|'output'}  direction
 * @returns {{ name: string; severity: string; action: string; id: string }[]} matching rules
 */
function runComplianceRules(complianceMode, text, direction) {
  const rules = getRulesForMode(complianceMode);
  const matches = [];
  for (const rule of rules) {
    if (rule.type !== 'both' && rule.type !== direction) continue;
    try {
      if (new RegExp(rule.pattern, 'i').test(text)) {
        matches.push({ id: rule.id, name: rule.name, severity: rule.severity, action: rule.action });
      }
    } catch (_) {
      // Defensive: malformed pattern should never prevent other rules from running
    }
  }
  return matches;
}

module.exports = { getIndustryTemplates, getRulesForMode, runComplianceRules, INDUSTRY_TEMPLATES };
