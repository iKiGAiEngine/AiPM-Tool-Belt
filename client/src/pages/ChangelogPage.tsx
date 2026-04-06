import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Copy, Check } from "lucide-react";
import {
  parseChangelog,
  formatEntryForClipboard,
  getExplanation,
} from "@/lib/changelogParser";
import type { ChangelogEntry } from "@/lib/changelogParser";

export default function ChangelogPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [copied, setCopied] = useState(false);

  // Fetch changelog content
  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/changelog"],
    queryFn: async () => {
      const res = await fetch("/api/changelog");
      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(errorData?.message || `Failed to fetch changelog (${res.status})`);
      }
      return res.json();
    },
  });

  useEffect(() => {
    if (data?.content) {
      const parsed = parseChangelog(data.content);
      setEntries(parsed);
    }
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white dark:bg-zinc-950">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-600 dark:border-yellow-400 mx-auto mb-4"></div>
          <p className="text-gray-700 dark:text-gray-300">Loading changelog...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white dark:bg-zinc-950">
        <div className="text-center text-red-600 dark:text-red-400">
          <p className="text-lg font-semibold">Failed to load changelog</p>
          <p className="text-sm mt-2">
            {error instanceof Error ? error.message : "Unable to fetch changelog"}
          </p>
        </div>
      </div>
    );
  }

  const handleCopyEntry = (entry: ChangelogEntry) => {
    const markdown = formatEntryForClipboard(entry);
    navigator.clipboard.writeText(markdown);
    setCopied(true);
    toast({
      title: "Copied",
      description: "Changelog entry copied to clipboard",
      duration: 2000,
    });
    setTimeout(() => setCopied(false), 2000);
  };

  const renderBulletWithTooltip = (bullet: string) => {
    const terms = extractTechnicalTerms(bullet);

    if (terms.length === 0) {
      return <span>{bullet}</span>;
    }

    // Split bullet by technical terms and add tooltips
    let lastIndex = 0;
    const parts: JSX.Element[] = [];

    terms.forEach((term, idx) => {
      const startIdx = bullet.indexOf(term.text, lastIndex);
      if (startIdx > lastIndex) {
        parts.push(
          <span key={`text-${idx}`}>{bullet.substring(lastIndex, startIdx)}</span>
        );
      }

      const explanation = getExplanation(term.text);
      if (explanation) {
        parts.push(
          <TooltipProvider key={`tooltip-${idx}`}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="underline decoration-dotted decoration-yellow-600 dark:decoration-yellow-400 cursor-help">
                  {term.text}
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs bg-gray-900 dark:bg-white text-white dark:text-black">
                <p>{explanation}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      } else {
        parts.push(<span key={`text-plain-${idx}`}>{term.text}</span>);
      }

      lastIndex = startIdx + term.text.length;
    });

    if (lastIndex < bullet.length) {
      parts.push(<span key="text-end">{bullet.substring(lastIndex)}</span>);
    }

    return parts;
  };

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2 font-rajdhani">
            Changelog
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            AiPM Tool Belt development history and updates
          </p>
        </div>

        {/* Copy Entry Dropdown */}
        {entries.length > 0 && (
          <div className="mb-8 bg-gray-50 dark:bg-zinc-900 p-4 rounded-lg border border-gray-200 dark:border-zinc-800">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Copy entry for AI session:
            </label>
            <div className="flex gap-2">
              <Select onValueChange={(idx) => handleCopyEntry(entries[parseInt(idx)])}>
                <SelectTrigger className="w-full max-w-xs bg-white dark:bg-zinc-800 border-gray-300 dark:border-zinc-700">
                  <SelectValue placeholder="Select an entry..." />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-zinc-800">
                  {entries.map((entry, idx) => (
                    <SelectItem key={idx} value={idx.toString()}>
                      {entry.date} — {entry.version}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                disabled={!copied}
                className="text-gray-700 dark:text-gray-300"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        )}

        {/* Changelog Entries */}
        <Accordion type="single" collapsible className="space-y-3">
          {entries.map((entry, idx) => (
            <AccordionItem
              key={idx}
              value={`entry-${idx}`}
              className="border border-gray-200 dark:border-zinc-800 rounded-lg overflow-hidden bg-white dark:bg-zinc-900 hover:shadow-md dark:hover:shadow-black transition-shadow"
            >
              <AccordionTrigger className="px-6 py-4 hover:bg-gray-50 dark:hover:bg-zinc-800 text-left">
                <div className="flex flex-col items-start gap-1">
                  <span className="text-sm font-mono text-gray-500 dark:text-gray-400">
                    {entry.date}
                  </span>
                  <span className="text-lg font-semibold text-gray-900 dark:text-white font-rajdhani">
                    {entry.version}
                  </span>
                </div>
              </AccordionTrigger>

              <AccordionContent className="px-6 py-4 border-t border-gray-200 dark:border-zinc-800">
                {/* Added Section */}
                {entry.added.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider mb-3">
                      Added
                    </h3>
                    <ul className="space-y-2 ml-4">
                      {entry.added.map((item, i) => (
                        <li key={`added-${i}`} className="text-sm text-gray-700 dark:text-gray-300 list-disc">
                          {renderBulletWithTooltip(item)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Changed Section */}
                {entry.changed.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider mb-3">
                      Changed
                    </h3>
                    <ul className="space-y-2 ml-4">
                      {entry.changed.map((item, i) => (
                        <li key={`changed-${i}`} className="text-sm text-gray-700 dark:text-gray-300 list-disc">
                          {renderBulletWithTooltip(item)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Fixed Section */}
                {entry.fixed.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider mb-3">
                      Fixed
                    </h3>
                    <ul className="space-y-2 ml-4">
                      {entry.fixed.map((item, i) => (
                        <li key={`fixed-${i}`} className="text-sm text-gray-700 dark:text-gray-300 list-disc">
                          {renderBulletWithTooltip(item)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Notes Section */}
                {entry.notes.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider mb-3">
                      Notes
                    </h3>
                    <ul className="space-y-2 ml-4">
                      {entry.notes.map((item, i) => (
                        <li key={`notes-${i}`} className="text-sm text-gray-700 dark:text-gray-300 list-disc">
                          {renderBulletWithTooltip(item)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        {entries.length === 0 && (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            <p>No changelog entries found</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Extract technical terms from text for tooltips
function extractTechnicalTerms(
  text: string
): Array<{ text: string; startIdx: number }> {
  const terms = [
    "RBAC",
    "OTP",
    "UUID",
    "serial",
    "HTTP-only cookies",
    "ACID",
    "Drizzle ORM",
    "Zod validation",
    "Rate limiting",
    "Soft delete",
    "Hard delete",
    "Session store",
    "OAuth 2.0",
    "Bi-directional sync",
    "Proposal log",
    "Audit trail",
    "Ownership check",
    "Admin bypass",
    "Async",
    "GPT-4o",
    "OCR",
    "PDF parsing",
    "FK NOT NULL",
    "FK",
  ];

  const found: Array<{ text: string; startIdx: number }> = [];

  for (const term of terms) {
    let index = text.indexOf(term);
    while (index !== -1) {
      found.push({ text: term, startIdx: index });
      index = text.indexOf(term, index + 1);
    }
  }

  // Sort by position and remove duplicates
  return found
    .sort((a, b) => a.startIdx - b.startIdx)
    .reduce((unique: typeof found, item) => {
      if (!unique.some((u) => u.startIdx === item.startIdx)) {
        unique.push(item);
      }
      return unique;
    }, []);
}
