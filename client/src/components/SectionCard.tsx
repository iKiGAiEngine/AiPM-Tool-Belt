import { useState } from "react";
import { Edit2, Check, X, FileText, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { ExtractedSection } from "@shared/schema";
import { DEFAULT_SCOPES } from "@shared/schema";
import { cn } from "@/lib/utils";

interface SectionCardProps {
  section: ExtractedSection;
  onUpdateTitle?: (id: string, title: string) => void;
}

export function SectionCard({ section, onUpdateTitle }: SectionCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(section.title);
  const [isExpanded, setIsExpanded] = useState(false);

  const defaultTitle = DEFAULT_SCOPES[section.sectionNumber];
  const isDefaultTitle = defaultTitle && section.title === defaultTitle;

  const handleSave = () => {
    if (editValue.trim() && onUpdateTitle) {
      onUpdateTitle(section.id, editValue.trim());
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditValue(section.title);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      handleCancel();
    }
  };

  return (
    <Card className="group transition-all" data-testid={`card-section-${section.id}`}>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 pb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="font-mono text-sm font-semibold text-primary" data-testid="text-section-number">
              {section.sectionNumber}
            </span>
            {section.isEdited && (
              <Badge variant="secondary" className="text-xs">
                Edited
              </Badge>
            )}
            {section.pageNumber && (
              <Badge variant="outline" className="text-xs">
                Page {section.pageNumber}
              </Badge>
            )}
          </div>

          {isEditing ? (
            <div className="flex items-center gap-2">
              <Input
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={handleKeyDown}
                className="h-8 text-base font-semibold"
                autoFocus
                data-testid="input-edit-title"
              />
              <Button size="icon" variant="ghost" onClick={handleSave} data-testid="button-save-title">
                <Check className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={handleCancel} data-testid="button-cancel-edit">
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <h3 className="text-lg font-semibold text-foreground leading-tight" data-testid="text-section-title">
              {section.title}
            </h3>
          )}

          {isDefaultTitle && !isEditing && (
            <p className="mt-1 text-xs text-muted-foreground">
              From default scope
            </p>
          )}
        </div>

        {!isEditing && onUpdateTitle && (
          <Button
            size="icon"
            variant="ghost"
            className="invisible group-hover:visible flex-shrink-0"
            onClick={() => setIsEditing(true)}
            data-testid="button-edit-title"
          >
            <Edit2 className="h-4 w-4" />
          </Button>
        )}
      </CardHeader>

      {section.content && (
        <>
          <CardContent className="pb-3">
            <div
              className={cn(
                "text-sm text-muted-foreground",
                !isExpanded && "line-clamp-3"
              )}
              data-testid="text-section-content"
            >
              {section.content}
            </div>
          </CardContent>

          <CardFooter className="pt-0 pb-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="h-7 px-2 text-xs"
              data-testid="button-toggle-expand"
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="mr-1 h-3 w-3" />
                  Show less
                </>
              ) : (
                <>
                  <ChevronDown className="mr-1 h-3 w-3" />
                  Show more
                </>
              )}
            </Button>
          </CardFooter>
        </>
      )}

      {!section.content && (
        <CardContent className="pb-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <FileText className="h-4 w-4" />
            <span>No content preview available</span>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
