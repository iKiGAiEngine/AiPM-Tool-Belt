export interface Attachment {
  id: string;
  fileName: string;
  pageCount: number;
  calloutStamp: string;
  matchStatus: string;
  sortOrder: number;
}

export interface ScheduleLine {
  id: string;
  callout: string;
  desc: string;
  model: string;
  qty: string | number;
  lineStatus: string;
  sortOrder: number;
  attachments: Attachment[];
}

export interface CoverLine {
  id: string;
  spec: string;
  desc: string;
  type: string;
  comment: string;
}

export interface Scope {
  id: string;
  tabName: string;
  csi: string;
  specTitle: string;
  sortOrder: number;
  scopeStatus: string;
  lines: ScheduleLine[];
  coverLines: CoverLine[];
}

export interface SubmittalProject {
  id: string;
  proposalLogId: string;
  projectName: string;
  gc: string;
  attention: string;
  assignedPm: string;
  submittalStatus: string;
  completionPercent: number;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt: number;
  lastActiveScopeId: string | null;
  lastActiveTab: string;
  scopes: Scope[];
  coverDate: string;
  estimateNumber?: string;
  region?: string;
}

export interface ProposalLogEntry {
  id: number;
  projectName: string;
  gcEstimateLead?: string;
  estimateStatus?: string;
  estimateNumber?: string;
  region?: string;
  nbsEstimator?: string;
  proposalTotal?: string;
  anticipatedStart?: string;
}
