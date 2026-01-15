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
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { ExtractedSection } from "@shared/schema";
import { DEFAULT_SCOPES } from "@shared/schema";
import { cn } from "@/lib/utils";

interface SectionsTableProps {
  sections: ExtractedSection[];
  onUpdateTitle?: (id: string, title: string) => void;
  onUpdatePageRange?: (id: string, startPage: number, endPage: number) => void;
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
}

interface EditingRow {
  id: string;
  value: string;
}

interface EditingPageRange {
  id: string;
  startPage: number;
  endPage: number;
}

export function SectionsTable({ sections, onUpdateTitle, onUpdatePageRange, selectedIds = new Set(), onSelectionChange }: SectionsTableProps) {
  const [editingRow, setEditingRow] = useState<EditingRow | null>(null);
  const [editingPageRange, setEditingPageRange] = useState<EditingPageRange | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const allSelected = sections.length > 0 && sections.every(s => selectedIds.has(s.id));
  const someSelected = sections.some(s => selectedIds.has(s.id)) && !allSelected;

  const handleSelectAll = (checked: boolean) => {
    if (!onSelectionChange) return;
    if (checked) {
      onSelectionChange(new Set(sections.map(s => s.id)));
    } else {
      onSelectionChange(new Set());
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    if (!onSelectionChange) return;
    const newSet = new Set(selectedIds);
    if (checked) {
      newSet.add(id);
    } else {
      newSet.delete(id);
    }
    onSelectionChange(newSet);
  };

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
            {onSelectionChange && (
              <TableHead className="w-12">
                <Checkbox
                  checked={allSelected}
                  ref={(el) => {
                    if (el) {
                      (el as any).indeterminate = someSelected;
                    }
                  }}
                  onCheckedChange={handleSelectAll}
                  data-testid="checkbox-select-all"
                />
              </TableHead>
            )}
            <TableHead className="w-12"></TableHead>
            <TableHead className="w-32 font-semibold">Section</TableHead>
            <TableHead className="font-semibold">Title</TableHead>
            <TableHead className="w-28 text-center font-semibold">Pages</TableHead>
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
                      isExpanded && "bg-muted/30",
                      selectedIds.has(section.id) && "bg-primary/5"
                    )}
                    data-testid={`row-section-${section.id}`}
                  >
                    {onSelectionChange && (
                      <TableCell className="p-2">
                        <Checkbox
                          checked={selectedIds.has(section.id)}
                          onCheckedChange={(checked) => handleSelectOne(section.id, !!checked)}
                          data-testid={`checkbox-section-${section.id}`}
                        />
                      </TableCell>
                    )}
                    <TableCell className="p-2">
                      {(section.content || section.manufacturers?.length || section.modelNumbers?.length || section.materials?.length || section.conflicts?.length || section.notes?.length) && (
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
                      {editingPageRange?.id === section.id ? (
                        <div className="flex items-center gap-1 justify-center">
                          <Input
                            type="number"
                            min={1}
                            value={editingPageRange.startPage}
                            onChange={(e) => setEditingPageRange({ 
                              ...editingPageRange, 
                              startPage: parseInt(e.target.value) || 1 
                            })}
                            className="h-7 w-14 text-xs font-mono"
                            data-testid={`input-start-page-${section.id}`}
                          />
                          <span className="text-muted-foreground">-</span>
                          <Input
                            type="number"
                            min={1}
                            value={editingPageRange.endPage}
                            onChange={(e) => setEditingPageRange({ 
                              ...editingPageRange, 
                              endPage: parseInt(e.target.value) || 1 
                            })}
                            className="h-7 w-14 text-xs font-mono"
                            data-testid={`input-end-page-${section.id}`}
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            disabled={
                              !editingPageRange.startPage || 
                              !editingPageRange.endPage || 
                              editingPageRange.startPage > editingPageRange.endPage ||
                              editingPageRange.startPage < 1
                            }
                            onClick={() => {
                              if (onUpdatePageRange && 
                                  editingPageRange.startPage > 0 && 
                                  editingPageRange.endPage > 0 &&
                                  editingPageRange.startPage <= editingPageRange.endPage) {
                                onUpdatePageRange(section.id, editingPageRange.startPage, editingPageRange.endPage);
                              }
                              setEditingPageRange(null);
                            }}
                            data-testid={`button-save-pages-${section.id}`}
                          >
                            <Check className="h-3 w-3" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => setEditingPageRange(null)}
                            data-testid={`button-cancel-pages-${section.id}`}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : section.startPage && section.endPage ? (
                        <Badge 
                          variant="outline" 
                          className="font-mono text-xs cursor-pointer hover-elevate"
                          onClick={() => onUpdatePageRange && setEditingPageRange({
                            id: section.id,
                            startPage: section.startPage!,
                            endPage: section.endPage!
                          })}
                          data-testid={`badge-pages-${section.id}`}
                        >
                          {section.startPage === section.endPage 
                            ? section.startPage 
                            : `${section.startPage}-${section.endPage}`}
                        </Badge>
                      ) : onUpdatePageRange ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={() => setEditingPageRange({
                            id: section.id,
                            startPage: section.pageNumber || 1,
                            endPage: section.pageNumber || 1
                          })}
                          data-testid={`button-set-pages-${section.id}`}
                        >
                          {section.pageNumber ? `Page ${section.pageNumber}` : "Set pages"}
                        </Button>
                      ) : section.pageNumber ? (
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
                  {(section.content || section.manufacturers?.length || section.modelNumbers?.length || section.materials?.length || section.conflicts?.length) && (
                    <CollapsibleContent asChild>
                      <TableRow className="bg-muted/20" data-testid={`row-content-${section.id}`}>
                        <TableCell colSpan={onSelectionChange ? 7 : 6} className="p-4">
                          <div className="space-y-3">
                            {(section.manufacturers?.length > 0 || section.modelNumbers?.length > 0) && (
                              <div className="grid grid-cols-2 gap-4 text-sm">
                                {section.manufacturers?.length > 0 && (
                                  <div>
                                    <span className="font-medium text-foreground">Manufacturers:</span>
                                    <p className="text-muted-foreground">{section.manufacturers.join(", ")}</p>
                                  </div>
                                )}
                                {section.modelNumbers?.length > 0 && (
                                  <div>
                                    <span className="font-medium text-foreground">Model Numbers:</span>
                                    <p className="text-muted-foreground">{section.modelNumbers.join(", ")}</p>
                                  </div>
                                )}
                              </div>
                            )}
                            {section.materials?.length > 0 && (
                              <div className="text-sm">
                                <span className="font-medium text-foreground">Materials:</span>
                                <p className="text-muted-foreground">{section.materials.join(", ")}</p>
                              </div>
                            )}
                            {section.conflicts?.length > 0 && (
                              <div className="text-sm">
                                <span className="font-medium text-destructive">Conflicts/Notes:</span>
                                <ul className="list-disc list-inside text-muted-foreground">
                                  {section.conflicts.map((c, i) => (
                                    <li key={i}>{c}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {section.content && (
                              <div className="text-sm text-muted-foreground whitespace-pre-wrap max-h-32 overflow-y-auto border-t pt-3 mt-3">
                                {section.content}
                              </div>
                            )}
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
