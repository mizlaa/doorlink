import type {
  ActionStatus,
  AnswerStatus,
  AssetType,
  AiVerdict,
  DocumentKind,
  DocumentOrigin,
  FindingSeverity,
  InspectionResult,
  InspectionStatus,
  JobStatus,
  LeadStatus,
  QuoteStatus,
  SubmissionStatus,
  SubscriptionStatus,
  TransactionStatus,
  UrgencyLevel,
  VerificationStatus,
} from '@prisma/client'

export type Tone = 'neutral' | 'signal' | 'caution' | 'good' | 'bad'

// One place for every enum's human label and badge tone. These are
// exhaustive `Record<Enum, ...>` types on purpose: adding a value to an
// enum in the schema then breaks the build here rather than silently
// rendering `undefined` in a badge somewhere.

export const DOCUMENT_KIND_LABELS: Record<DocumentKind, string> = {
  INSTALL_MANUAL: 'Installation manual',
  USER_MANUAL: 'User manual',
  WIRING_DIAGRAM: 'Wiring diagram',
  PARTS_LIST: 'Parts list',
  SPEC_SHEET: 'Spec sheet',
  WARRANTY: 'Warranty',
  SERVICE_BULLETIN: 'Service bulletin',
  PROGRAMMING_GUIDE: 'Programming guide',
  TROUBLESHOOTING_GUIDE: 'Troubleshooting guide',
  TECHNICAL_DOCUMENT: 'Technical document',
  SAFETY_DOCUMENT: 'Safety document',
  QUICK_START: 'Quick start',
  DECLARATION_OF_CONFORMITY: 'Declaration of conformity',
}

export const DOCUMENT_ORIGIN_LABELS: Record<DocumentOrigin, string> = {
  MANUFACTURER_ORIGINAL: "Manufacturer's original",
  THIRD_PARTY_GUIDE: 'Third-party guide',
  COMMUNITY_CONTRIBUTED: 'Community contributed',
  DOORLINK_AUTHORED: 'Written by Doorlink',
  UNKNOWN: 'Origin unknown',
}

// Only a manufacturer's own file gets a confident tone. Everything else
// is useful but not official, and the badge has to say so.
export const DOCUMENT_ORIGIN_TONE: Record<DocumentOrigin, Tone> = {
  MANUFACTURER_ORIGINAL: 'good',
  THIRD_PARTY_GUIDE: 'caution',
  COMMUNITY_CONTRIBUTED: 'caution',
  DOORLINK_AUTHORED: 'signal',
  UNKNOWN: 'neutral',
}

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: 'New',
  OPEN_FOR_QUOTES: 'Open for quotes',
  QUOTED: 'Quoted',
  ASSIGNED: 'Assigned',
  CONTACTED: 'Contacted',
  QUALIFIED: 'Qualified',
  CONVERTED: 'Converted',
  CLOSED: 'Closed',
  EXPIRED: 'Expired',
  CANCELLED: 'Cancelled',
}

export const LEAD_STATUS_TONE: Record<LeadStatus, Tone> = {
  NEW: 'signal',
  OPEN_FOR_QUOTES: 'signal',
  QUOTED: 'caution',
  ASSIGNED: 'good',
  CONTACTED: 'caution',
  QUALIFIED: 'caution',
  CONVERTED: 'good',
  CLOSED: 'neutral',
  EXPIRED: 'neutral',
  CANCELLED: 'neutral',
}

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  REQUESTED: 'Awaiting business confirmation',
  ACCEPTED: 'Confirmed',
  AWAITING_PAYMENT: 'Awaiting customer payment',
  PAYMENT_CONFIRMED: 'Payment confirmed',
  SCHEDULED: 'Scheduled',
  IN_PROGRESS: 'Work in progress',
  BUSINESS_COMPLETED: 'Awaiting customer confirmation',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  DISPUTED: 'Disputed',
  DECLINED: 'Declined',
}

export const JOB_STATUS_TONE: Record<JobStatus, Tone> = {
  REQUESTED: 'signal',
  ACCEPTED: 'signal',
  AWAITING_PAYMENT: 'caution',
  PAYMENT_CONFIRMED: 'good',
  SCHEDULED: 'caution',
  IN_PROGRESS: 'caution',
  BUSINESS_COMPLETED: 'caution',
  COMPLETED: 'good',
  CANCELLED: 'neutral',
  DISPUTED: 'bad',
  DECLINED: 'neutral',
}

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  PENDING: 'Pending',
  ACCEPTED: 'Accepted',
  DECLINED: 'Declined',
  WITHDRAWN: 'Withdrawn',
  EXPIRED: 'Expired',
}

export const QUOTE_STATUS_TONE: Record<QuoteStatus, Tone> = {
  PENDING: 'signal',
  ACCEPTED: 'good',
  DECLINED: 'neutral',
  WITHDRAWN: 'neutral',
  EXPIRED: 'neutral',
}

export const URGENCY_LABELS: Record<UrgencyLevel, string> = {
  EMERGENCY: 'Emergency',
  URGENT: 'Urgent',
  STANDARD: 'Standard',
  FLEXIBLE: 'Flexible',
}

export const URGENCY_TONE: Record<UrgencyLevel, Tone> = {
  EMERGENCY: 'bad',
  URGENT: 'caution',
  STANDARD: 'neutral',
  FLEXIBLE: 'neutral',
}

export const VERIFICATION_LABELS: Record<VerificationStatus, string> = {
  UNVERIFIED: 'Not verified',
  SUBMITTED: 'Documents submitted',
  IN_REVIEW: 'In review',
  VERIFIED: 'Verified by Doorlink',
  REJECTED: 'Verification rejected',
}

export const VERIFICATION_TONE: Record<VerificationStatus, Tone> = {
  UNVERIFIED: 'neutral',
  SUBMITTED: 'caution',
  IN_REVIEW: 'caution',
  VERIFIED: 'good',
  REJECTED: 'bad',
}

export const TRANSACTION_STATUS_LABELS: Record<TransactionStatus, string> = {
  PENDING: 'Pending',
  REQUIRES_ACTION: 'Requires action',
  PAID: 'Paid',
  FAILED: 'Failed',
  REFUNDED: 'Refunded',
  PARTIALLY_REFUNDED: 'Partially refunded',
  CANCELLED: 'Cancelled',
}

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  INCOMPLETE: 'Incomplete',
  TRIALING: 'Trialing',
  ACTIVE: 'Active',
  PAST_DUE: 'Past due',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
}

// ---------------------------------------------------------------------
// Inspection engine
// ---------------------------------------------------------------------

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  ROLLER_SHUTTER: 'Roller shutter',
  SECTIONAL_DOOR: 'Sectional door',
  GARAGE_DOOR: 'Garage door',
  AUTOMATIC_GATE: 'Automatic gate',
  SLIDING_GATE: 'Sliding gate',
  SWING_GATE: 'Swing gate',
  INDUSTRIAL_DOOR: 'Industrial door',
  MANUAL_DOOR: 'Manual door',
  OTHER: 'Other',
}

export const INSPECTION_STATUS_LABELS: Record<InspectionStatus, string> = {
  DRAFT: 'Draft',
  IN_PROGRESS: 'In progress',
  AWAITING_REVIEW: 'Awaiting review',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
}

export const INSPECTION_STATUS_TONE: Record<InspectionStatus, Tone> = {
  DRAFT: 'neutral',
  IN_PROGRESS: 'signal',
  AWAITING_REVIEW: 'caution',
  COMPLETED: 'good',
  CANCELLED: 'neutral',
}

export const INSPECTION_RESULT_LABELS: Record<InspectionResult, string> = {
  PASS: 'Pass',
  ATTENTION_REQUIRED: 'Attention required',
  FAILED: 'Failed',
  INCOMPLETE: 'Incomplete',
}

export const INSPECTION_RESULT_TONE: Record<InspectionResult, Tone> = {
  PASS: 'good',
  ATTENTION_REQUIRED: 'caution',
  FAILED: 'bad',
  INCOMPLETE: 'neutral',
}

export const ANSWER_STATUS_LABELS: Record<AnswerStatus, string> = {
  PASS: 'Pass',
  FAIL: 'Fail',
  NOT_APPLICABLE: 'N/A',
  NOT_TESTED: 'Not tested',
}

export const ANSWER_STATUS_TONE: Record<AnswerStatus, Tone> = {
  PASS: 'good',
  FAIL: 'bad',
  NOT_APPLICABLE: 'neutral',
  NOT_TESTED: 'caution',
}

// Severity is the technician's assessment of how serious a condition
// is. It is never, on its own, a statement that a law has been broken —
// the UI keeps regulatory citations in a separate, sourced panel.
export const SEVERITY_LABELS: Record<FindingSeverity, string> = {
  INFO: 'Information',
  OBSERVATION: 'Observation',
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  CRITICAL: 'Critical',
}

export const SEVERITY_TONE: Record<FindingSeverity, Tone> = {
  INFO: 'neutral',
  OBSERVATION: 'neutral',
  LOW: 'signal',
  MEDIUM: 'caution',
  HIGH: 'bad',
  CRITICAL: 'bad',
}

export const ACTION_STATUS_LABELS: Record<ActionStatus, string> = {
  OPEN: 'Open',
  ASSIGNED: 'Assigned',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  VERIFIED: 'Verified',
  CLOSED: 'Closed',
}

export const ACTION_STATUS_TONE: Record<ActionStatus, Tone> = {
  OPEN: 'bad',
  ASSIGNED: 'caution',
  IN_PROGRESS: 'signal',
  COMPLETED: 'good',
  VERIFIED: 'good',
  CLOSED: 'neutral',
}

// Submitted-manual wording.
//
// Deliberately plain: a submitter reads these, not an engineer. Note
// FLAGGED does not say "rejected" — the AI flagging something is not a
// decision, and telling somebody their manual was rejected when a person
// has not looked at it yet would be untrue.
export const SUBMISSION_LABELS: Record<SubmissionStatus, string> = {
  RECEIVED: 'Received',
  CHECKING: 'Being checked',
  AWAITING_REVIEW: 'Waiting for review',
  FLAGGED: 'Needs a closer look',
  POSSIBLE_DUPLICATE: 'We may already have this',
  INFO_REQUESTED: 'We need more information',
  APPROVED: 'In the library',
  REJECTED: 'Not added',
  WITHDRAWN: 'Withdrawn',
}

export const SUBMISSION_TONE: Record<SubmissionStatus, Tone> = {
  RECEIVED: 'neutral',
  CHECKING: 'neutral',
  AWAITING_REVIEW: 'caution',
  FLAGGED: 'caution',
  POSSIBLE_DUPLICATE: 'caution',
  INFO_REQUESTED: 'caution',
  APPROVED: 'good',
  REJECTED: 'bad',
  WITHDRAWN: 'neutral',
}

// Admin-facing. These say what the check actually reported, including
// the two that mean no useful check happened — which a reviewer must be
// able to tell apart from a pass at a glance.
export const AI_VERDICT_LABELS: Record<AiVerdict, string> = {
  NOT_RUN: 'No check ran',
  VERIFIED: 'Verified by check',
  NEEDS_REVIEW: 'Check wants a human',
  REJECTED: 'Check rejected it',
  POSSIBLE_DUPLICATE: 'Check thinks it is a duplicate',
  ERRORED: 'Check failed to complete',
}

export const AI_VERDICT_TONE: Record<AiVerdict, Tone> = {
  NOT_RUN: 'neutral',
  VERIFIED: 'good',
  NEEDS_REVIEW: 'caution',
  REJECTED: 'bad',
  POSSIBLE_DUPLICATE: 'caution',
  ERRORED: 'bad',
}
