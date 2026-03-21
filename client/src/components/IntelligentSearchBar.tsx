import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Search, Tag, Hash, FileText, User } from "lucide-react";
import { categoryToDisplay } from "@/lib/category-translate";
import { cn } from "@/lib/utils";
import type { InventoryItem } from "@/hooks/use-inventory";

interface IntelligentSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  items: InventoryItem[];
  isLoading?: boolean;
  placeholder?: string;
  className?: string;
}

const MAX_SUGGESTIONS = 6;

function extractSuggestions(items: InventoryItem[], query: string): { type: string; label: string; value: string; icon: React.ReactNode }[] {
  const q = query.trim().toLowerCase();
  if (!q || items.length === 0) return [];

  const suggestions: { type: string; label: string; value: string; icon: React.ReactNode }[] = [];
  const seen = new Set<string>();

  const add = (val: string, type: string, label: string, icon: React.ReactNode) => {
    if (!val) return;
    const key = `${type}:${val}`;
    if (val.toLowerCase().includes(q) && !seen.has(key)) {
      seen.add(key);
      suggestions.push({ type, label, value: val, icon });
    }
  };

  for (const item of items) {
    if (suggestions.length >= MAX_SUGGESTIONS * 2) break;
    add(item.category || "Uncategorized", "Categoría", categoryToDisplay(item.category || "Uncategorized"), <Tag className="h-3.5 w-3.5" />);
    add(item.code, "Código", item.code, <Hash className="h-3.5 w-3.5" />);
    add(item.name, "Nombre", item.name.length > 45 ? item.name.slice(0, 45) + "…" : item.name, <FileText className="h-3.5 w-3.5" />);
    add(item.responsible || "", "Responsable", item.responsible || "", <User className="h-3.5 w-3.5" />);
  }

  return suggestions.slice(0, MAX_SUGGESTIONS);
}

export function IntelligentSearchBar({
  value,
  onChange,
  items,
  isLoading,
  placeholder = "Buscar por nombre, código, categoría o proveedor…",
  className,
}: IntelligentSearchBarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = extractSuggestions(items, value);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const showDropdown = isOpen && value.length > 0;

  const handleSelect = (suggestionValue: string) => {
    onChange(suggestionValue);
    setIsOpen(false);
    setHighlightedIndex(-1);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown || suggestions.length === 0) {
      if (e.key === "Escape") setIsOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) => (i < suggestions.length - 1 ? i + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => (i > 0 ? i - 1 : suggestions.length - 1));
    } else if (e.key === "Enter" && highlightedIndex >= 0 && suggestions[highlightedIndex]) {
      e.preventDefault();
      handleSelect(suggestions[highlightedIndex].value);
    } else if (e.key === "Escape") {
      setIsOpen(false);
      setHighlightedIndex(-1);
    }
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setIsOpen(true);
            setHighlightedIndex(-1);
          }}
          onFocus={() => value.length > 0 && setIsOpen(true)}
          onKeyDown={handleKeyDown}
          className="pl-9 bg-background border-border/50 focus:border-primary/50 pr-4"
          aria-autocomplete="list"
          aria-expanded={showDropdown}
          aria-controls="search-suggestions"
          aria-activedescendant={highlightedIndex >= 0 ? `suggestion-${highlightedIndex}` : undefined}
        />
      </div>

      {showDropdown && (
        <ul
          id="search-suggestions"
          role="listbox"
          className="absolute z-50 top-full left-0 right-0 mt-1 py-1 rounded-lg border border-border bg-popover shadow-lg overflow-hidden max-h-[240px] overflow-y-auto"
        >
          {suggestions.length === 0 ? (
            <li className="px-3 py-2.5 text-sm text-muted-foreground">
              {isLoading ? "Buscando…" : "Sin coincidencias"}
            </li>
          ) : (
            suggestions.map((s, i) => (
              <li
                key={`${s.type}-${s.value}-${i}`}
                id={`suggestion-${i}`}
                role="option"
                aria-selected={i === highlightedIndex}
                className={cn(
                  "flex items-center gap-2 px-3 py-2.5 text-sm cursor-pointer transition-colors",
                  i === highlightedIndex ? "bg-accent text-accent-foreground ring-2 ring-inset ring-ring" : "hover:bg-accent/50"
                )}
                onMouseEnter={() => setHighlightedIndex(i)}
                onClick={() => handleSelect(s.value)}
              >
                <span className="text-muted-foreground shrink-0">{s.icon}</span>
                <span className="truncate flex-1">{s.label}</span>
                <span className="text-xs text-muted-foreground shrink-0">{s.type}</span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
