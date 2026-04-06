export interface ChangelogEntry {
  version: string;
  date: string;
  added: string[];
  changed: string[];
  fixed: string[];
  notes: string[];
}

export function parseChangelog(content: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  const lines = content.split('\n');
  
  let currentEntry: Partial<ChangelogEntry> | null = null;
  let currentSection: 'added' | 'changed' | 'fixed' | 'notes' | null = null;

  for (const line of lines) {
    // Match version header: ## [MM-DD-YYYY] vX.X.X
    const versionMatch = line.match(/^##\s+\[([^\]]+)\]\s+(.+)$/);
    if (versionMatch) {
      if (currentEntry && currentEntry.version) {
        entries.push(currentEntry as ChangelogEntry);
      }
      currentEntry = {
        date: versionMatch[1],
        version: versionMatch[2],
        added: [],
        changed: [],
        fixed: [],
        notes: [],
      };
      currentSection = null;
      continue;
    }

    // Match section headers: ### Added, ### Changed, etc.
    const sectionMatch = line.match(/^###\s+(Added|Changed|Fixed|Notes)$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1].toLowerCase() as 'added' | 'changed' | 'fixed' | 'notes';
      continue;
    }

    // Match bullet points: - [text]
    const bulletMatch = line.match(/^-\s+(.+)$/);
    if (bulletMatch && currentEntry && currentSection) {
      const sectionArray = currentEntry[currentSection] as string[];
      sectionArray.push(bulletMatch[1]);
    }
  }

  if (currentEntry && currentEntry.version) {
    entries.push(currentEntry as ChangelogEntry);
  }

  return entries;
}

export function formatEntryForClipboard(entry: ChangelogEntry): string {
  let markdown = `## [${entry.date}] ${entry.version}\n`;

  if (entry.added.length > 0) {
    markdown += '### Added\n';
    entry.added.forEach(item => {
      markdown += `- ${item}\n`;
    });
  }

  if (entry.changed.length > 0) {
    markdown += '### Changed\n';
    entry.changed.forEach(item => {
      markdown += `- ${item}\n`;
    });
  }

  if (entry.fixed.length > 0) {
    markdown += '### Fixed\n';
    entry.fixed.forEach(item => {
      markdown += `- ${item}\n`;
    });
  }

  if (entry.notes.length > 0) {
    markdown += '### Notes\n';
    entry.notes.forEach(item => {
      markdown += `- ${item}\n`;
    });
  }

  return markdown;
}

// Technical term explanations for tooltips
export const technicalTermExplanations: Record<string, string> = {
  'FK': 'Foreign Key - links a record in one table to a record in another table',
  'FK NOT NULL': 'This column is required to reference another table record - orphaned records are blocked',
  'RBAC': 'Role-Based Access Control - users are assigned roles, and roles grant access to features',
  'OTP': 'One-Time Password - a 6-digit code sent via email that works only once',
  'UUID': 'Universally Unique Identifier - a 128-bit random ID that is globally unique',
  'serial': 'Auto-incrementing integer ID - database automatically generates 1, 2, 3, etc.',
  'HTTP-only cookies': 'Cookies that JavaScript cannot access - more secure for storing session tokens',
  'ACID': 'Atomicity, Consistency, Isolation, Durability - database guarantees that transactions are reliable',
  'Drizzle ORM': 'TypeScript library that lets you define databases in code without writing SQL',
  'Zod validation': 'Library that checks data types at runtime before storing in database',
  'Rate limiting': 'Restricting number of requests - e.g. 5 OTP attempts per email per hour',
  'Soft delete': 'Marking records as deleted (deletedAt field) instead of actually removing them',
  'Hard delete': 'Permanently removing records from the database',
  'Session store': 'Where session data is stored - in this case, PostgreSQL database',
  'OAuth 2.0': 'Secure way to let users authorize third-party apps without sharing passwords',
  'Bi-directional sync': 'Changes on either side (app or Google Sheet) automatically sync to the other',
  'Proposal log': 'The main proposal/estimate tracking table with 35+ fields',
  'Audit trail': 'Complete history of who changed what and when',
  'Ownership check': 'Verifying that the logged-in user is the owner before allowing edits',
  'Admin bypass': 'Admins skip permission checks and can access everything',
  'Async': 'Asynchronous - operation happens in background without blocking other code',
  'GPT-4o': 'Large language model AI from OpenAI that can understand images and text',
  'OCR': 'Optical Character Recognition - extracting text from images',
  'PDF parsing': 'Reading and extracting data from PDF files',
};

export function getExplanation(term: string): string | undefined {
  // Try exact match first
  if (technicalTermExplanations[term]) {
    return technicalTermExplanations[term];
  }

  // Try partial match (case-insensitive)
  for (const [key, explanation] of Object.entries(technicalTermExplanations)) {
    if (term.toLowerCase().includes(key.toLowerCase()) || key.toLowerCase().includes(term.toLowerCase())) {
      return explanation;
    }
  }

  return undefined;
}
