import { useState } from "react";
import { Edit2, Check, X, ChevronDown, ChevronRight } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { ExtractedSection } from "@shared/schema";
import { DEFAULT_SCOPES } from "@shared/schema";
import { cn } from "@/lib/utils";

interface SectionsTableProps {
  sections: ExtractedSection[];
  onUpdateTitle?: (id: string, title: string) => void;
}

interface EditingRow {
  id: string;
  value: string;
}

export function SectionsTable({ sections, onUpdateTitle }: SectionsTableProps) {
  const [editingRow, setEditingRow] = useState<EditingRow | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleExpanded = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleEdit = (section: ExtractedSection) => {
    setEditingRow({ id: section.id, value: section.title });
  };

  const handleSave = () => {
    if (editingRow && editingRow.value.trim() && onUpdateTitle) {
      onUpdateTitle(editingRow.id, editingRow.value.trim());
    }
    setEditingRow(null);
  };

  const handleCancel = () => {
    setEditingRow(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      handleCancel();
    }
  };

  const sortedSections = [...sections].sort((a, b) =>
    a.sectionNumber.localeCompare(b.sectionNumber)
  );

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="w-12"></TableHead>
            <TableHead className="w-32 font-semibold">Section</TableHead>
            <TableHead className="font-semibold">Title</TableHead>
            <TableHead className="w-20 text-center font-semibold">Page</TableHead>
            <TableHead className="w-24 text-center font-semibold">Status</TableHead>
            <TableHead className="w-20 text-right font-semibold">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedSections.map((section) => {
            const isExpanded = expandedRows.has(section.id);
            const isEditing = editingRow?.id === section.id;
            const defaultTitle = DEFAULT_SCOPES[section.sectionNumber];
            const isDefaultTitle = defaultTitle && section.title === defaultTitle;

            return (
              <Collapsible key={section.id} asChild open={isExpanded}>
                <>
                  <TableRow
                    className={cn(
                      "group",
                      isExpanded && "bg-muted/30"
                    )}
                    data-testid={`row-section-${section.id}`}
                  >
                    <TableCell className="p-2">
                      {section.content && (
                        <CollapsibleTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => toggleExpanded(section.id)}
                            data-testid={`button-expand-${section.id}`}
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </Button>
                        </CollapsibleTrigger>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-sm font-semibold text-primary" data-testid={`text-section-number-${section.id}`}>
                        {section.sectionNumber}
                      </span>
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <Input
                            value={editingRow.value}
                            onChange={(e) =>
                              setEditingRow({ ...editingRow, value: e.target.value })
                            }
                            onKeyDown={handleKeyDown}
                            className="h-8"
                            autoFocus
                            data-testid={`input-edit-title-${section.id}`}
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={handleSave}
                            data-testid={`button-save-${section.id}`}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={handleCancel}
                            data-testid={`button-cancel-${section.id}`}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="font-medium" data-testid={`text-section-title-${section.id}`}>
                            {section.title}
                          </span>
                          {isDefaultTitle && (
                            <span className="text-xs text-muted-foreground">(default)</span>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {section.pageNumber ? (
                        <Badge variant="outline" className="font-mono text-xs">
                          {section.pageNumber}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {section.isEdited ? (
                        <Badge variant="secondary" className="text-xs">
                          Edited
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          Original
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {!isEditing && onUpdateTitle && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 invisible group-hover:visible"
                          onClick={() => handleEdit(section)}
                          data-testid={`button-edit-${section.id}`}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                  {section.content && (
                    <CollapsibleContent asChild>
                      <TableRow className="bg-muted/20" data-testid={`row-content-${section.id}`}>
                        <TableCell colSpan={6} className="p-4">
                          <div className="text-sm text-muted-foreground whitespace-pre-wrap max-h-48 overflow-y-auto">
                            {section.content}
                          </div>
                        </TableCell>
                      </TableRow>
                    </CollapsibleContent>
                  )}
                </>
              </Collapsible>
            );
          })}
        </TableBody>
      </Table>

      {sections.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-lg font-medium text-muted-foreground">
            No sections extracted yet
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload a PDF to extract Division 10 sections
          </p>
        </div>
      )}
    </div>
  );
}
