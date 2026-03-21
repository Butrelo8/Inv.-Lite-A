import { useRef, useState, useMemo, useEffect } from "react";
import { flushSync } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useInventory, useFilterOptions, useCreateInventoryItem, useUpdateInventoryItem, useDeleteInventoryItem, useUploadInventoryImage, useImportInventory, useAttachments, useItemDocuments, useUploadEmployeeDocument, useDeleteEmployeeDocument, useUnlinkDocumentFromItem, type InventoryItem } from "@/hooks/use-inventory";
import { useDebounce } from "@/hooks/use-debounce";
import { api, buildUrl } from "@shared/routes";
import { IntelligentSearchBar } from "@/components/IntelligentSearchBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogDescription
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { InventoryForm } from "@/components/InventoryForm";
import { ImageViewer } from "@/components/ImageViewer";
import { ItemLabelDialog } from "@/components/ItemLabelDialog";
import { ItemViewDialog } from "@/components/ItemViewDialog";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { StatusBadge } from "@/components/StatusBadge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Plus, Edit2, Trash2, Copy, Package, FilterX, Loader2, Download, Upload, ImageIcon, ChevronDown, ChevronUp, ChevronsUpDown, FileSpreadsheet, FileText, Columns3, QrCode, ChevronLeft, ChevronRight, X, Eye } from "lucide-react";
import { format } from "date-fns";
import { categoryToDisplay, conditionToDisplay } from "@/lib/category-translate";
import { SUGGESTED_CATEGORIES } from "@/lib/category-suggest";
import { inventoryItemToDuplicateCreateBody } from "@/lib/inventory-duplicate";

const BASE_CATEGORIES = [...SUGGESTED_CATEGORIES, "Office Supplies"];
const CONDITIONS = ["New", "Excellent", "Good", "Fair", "Poor", "Damaged"];

const INVENTORY_COLUMNS_STORAGE_KEY = "inventory-table-columns";
const INVENTORY_SORT_STORAGE_KEY = "inventory-table-sort";

/** Returns the thumbnail URL for a given imageUrl (e.g. /uploads/42-123.jpg → /uploads/thumbs/42-123.webp) */
function thumbUrl(imageUrl: string | null | undefined): string | undefined {
  if (!imageUrl) return undefined;
  const base = imageUrl.replace(/\.[^.]+$/, "");
  const filename = base.split("/").pop();
  return `/uploads/thumbs/${filename}.webp`;
}

type SortableColumn = "code" | "name" | "category" | "responsible" | "company" | "condition" | "units" | "date";
const SORTABLE_COLUMNS: { id: SortableColumn; label: string }[] = [
  { id: "code", label: "Código" },
  { id: "name", label: "Nombre" },
  { id: "category", label: "Categoría" },
  { id: "responsible", label: "Responsable" },
  { id: "company", label: "Empresa" },
  { id: "condition", label: "Condición" },
  { id: "units", label: "Unidades" },
  { id: "date", label: "Fecha" },
];

const DISPLAY_ONLY_COLUMNS: { id: string; label: string }[] = [
  { id: "dateAddedModified", label: "Añadido / Modificado" },
];

const DEFAULT_VISIBLE_COLUMNS: Record<SortableColumn | "image" | "actions" | "dateAddedModified", boolean> = {
  image: true,
  code: true,
  name: true,
  category: true,
  responsible: true,
  company: true,
  condition: true,
  units: true,
  date: true,
  dateAddedModified: true,
  actions: true,
};

function loadColumnVisibility(): Record<string, boolean> {
  if (typeof window === "undefined") return DEFAULT_VISIBLE_COLUMNS;
  try {
    const raw = localStorage.getItem(INVENTORY_COLUMNS_STORAGE_KEY);
    if (!raw) return DEFAULT_VISIBLE_COLUMNS;
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    return { ...DEFAULT_VISIBLE_COLUMNS, ...parsed };
  } catch {
    return DEFAULT_VISIBLE_COLUMNS;
  }
}

function loadSort(): { sortBy: SortableColumn; sortDir: "asc" | "desc" } {
  if (typeof window === "undefined") return { sortBy: "code", sortDir: "asc" };
  try {
    const raw = localStorage.getItem(INVENTORY_SORT_STORAGE_KEY);
    if (!raw) return { sortBy: "code", sortDir: "asc" };
    const parsed = JSON.parse(raw) as { sortBy?: string; sortDir?: string };
    if (SORTABLE_COLUMNS.some((c) => c.id === parsed.sortBy) && (parsed.sortDir === "asc" || parsed.sortDir === "desc")) {
      return { sortBy: parsed.sortBy as SortableColumn, sortDir: parsed.sortDir };
    }
  } catch {}
  return { sortBy: "code", sortDir: "asc" };
}

function getInitialResponsible(): string {
  if (typeof window === "undefined") return "";
  const p = new URLSearchParams(window.location.search);
  return p.get("responsible") ?? "";
}

export default function Dashboard() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("");
  const [responsible, setResponsible] = useState<string>(getInitialResponsible);
  const [companyId, setCompanyId] = useState<number | "">("");
  const [datePreset, setDatePreset] = useState<string>("");
  const [recentPreset, setRecentPreset] = useState<string>("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [duplicatingItem, setDuplicatingItem] = useState<InventoryItem | null>(null);
  const [labelItem, setLabelItem] = useState<InventoryItem | null>(null);
  const [viewingItem, setViewingItem] = useState<InventoryItem | null>(null);
  const [viewItemDetails, setViewItemDetails] = useState<InventoryItem | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(loadColumnVisibility);
  const [sortState, setSortState] = useState<{ sortBy: SortableColumn; sortDir: "asc" | "desc" }>(loadSort);
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectedItemsDetails, setSelectedItemsDetails] = useState<Map<number, { code: string; name: string }>>(new Map());
  const [editingCell, setEditingCell] = useState<{ itemId: number; field: string } | null>(null);
  const [savingInlineCell, setSavingInlineCell] = useState<{ itemId: number; field: string } | null>(null);
  const editInputRefs = useRef<Map<string, HTMLInputElement | HTMLButtonElement>>(new Map());
  const pageSize = 50;
  const queryClient = useQueryClient();

  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDuplicateOpen, setBulkDuplicateOpen] = useState(false);
  const [bulkDuplicating, setBulkDuplicating] = useState(false);

  const debouncedSearch = useDebounce(search, 300);

  const getDateRange = () => {
    const now = new Date();
    const year = now.getFullYear();
    if (datePreset === "this-year") return { dateFrom: `${year}-01-01`, dateTo: `${year}-12-31` };
    if (datePreset === "last-year") return { dateFrom: `${year - 1}-01-01`, dateTo: `${year - 1}-12-31` };
    if (datePreset === "last-6m") {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 6);
      return { dateFrom: d.toISOString().slice(0, 10), dateTo: now.toISOString().slice(0, 10) };
    }
    return {};
  };

  const getRecentRange = () => {
    if (!recentPreset) return {};
    const now = new Date();
    const d = new Date(now);
    if (recentPreset === "added-7" || recentPreset === "modified-7") d.setDate(d.getDate() - 7);
    else if (recentPreset === "added-30" || recentPreset === "modified-30") d.setDate(d.getDate() - 30);
    else return {};
    const after = d.toISOString().slice(0, 10);
    if (recentPreset.startsWith("added-")) return { addedAfter: after };
    if (recentPreset.startsWith("modified-")) return { modifiedAfter: after };
    return {};
  };

  const { dateFrom, dateTo } = getDateRange();
  const { addedAfter, modifiedAfter } = getRecentRange();
  const exportQuery = new URLSearchParams();
  if (debouncedSearch) exportQuery.set("search", debouncedSearch);
  if (category) exportQuery.set("category", category);
  if (responsible) exportQuery.set("responsible", responsible);
  if (companyId !== "") exportQuery.set("companyId", String(companyId));
  if (datePreset && dateFrom) exportQuery.set("dateFrom", dateFrom);
  if (datePreset && dateTo) exportQuery.set("dateTo", dateTo);
  if (addedAfter) exportQuery.set("addedAfter", addedAfter);
  if (modifiedAfter) exportQuery.set("modifiedAfter", modifiedAfter);
  const exportQueryString = exportQuery.toString();
  const selectedIdsArray = useMemo(() => Array.from(selectedIds).sort((a, b) => a - b), [selectedIds]);
  const hasSelection = selectedIds.size > 0;
  const idsQueryString = selectedIdsArray.length > 0 ? `ids=${selectedIdsArray.join(",")}` : "";

  const toggleSelection = (id: number, item?: InventoryItem) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        setSelectedItemsDetails((d) => { const m = new Map(d); m.delete(id); return m; });
        return next;
      }
      next.add(id);
      if (item) setSelectedItemsDetails((d) => new Map(d).set(id, { code: item.code ?? "", name: item.name ?? "" }));
      return next;
    });
  };
  const clearSelection = () => {
    setSelectedIds(new Set());
    setSelectedItemsDetails(new Map());
  };

  const { data: inventoryData, isLoading } = useInventory({
    search: debouncedSearch,
    category: category || undefined,
    responsible: responsible || undefined,
    companyId: companyId === "" ? undefined : Number(companyId),
    dateFrom: datePreset ? dateFrom : undefined,
    dateTo: datePreset ? dateTo : undefined,
    addedAfter,
    modifiedAfter,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });
  const items = inventoryData?.items ?? [];
  const totalItems = inventoryData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const fromItem = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const toItem = Math.min(page * pageSize, totalItems);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, category, responsible, companyId, datePreset, recentPreset]);

  const { data: filterOptions = { categories: [], responsible: [], companies: [] } } = useFilterOptions();
  const companiesById = useMemo(() => {
    const map = new Map<number, string>();
    (filterOptions.companies ?? []).forEach((c) => map.set(c.id, c.name));
    return map;
  }, [filterOptions.companies]);

  const sortedItems = useMemo(() => {
    const { sortBy, sortDir } = sortState;
    const arr = [...items];
    const mult = sortDir === "asc" ? 1 : -1;
    const companyName = (id: number | null) => (companiesById.get(id ?? 0) ?? "");
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortBy === "code") cmp = (a.code ?? "").localeCompare(b.code ?? "");
      else if (sortBy === "name") cmp = (a.name ?? "").localeCompare(b.name ?? "");
      else if (sortBy === "category") cmp = (a.category ?? "").localeCompare(b.category ?? "");
      else if (sortBy === "responsible") cmp = (a.responsible ?? "").localeCompare(b.responsible ?? "");
      else if (sortBy === "company") cmp = companyName(a.companyId ?? null).localeCompare(companyName(b.companyId ?? null));
      else if (sortBy === "condition") cmp = (a.condition ?? "").localeCompare(b.condition ?? "");
      else if (sortBy === "units") cmp = (a.units ?? 0) - (b.units ?? 0);
      else if (sortBy === "date") {
        const dA = a.purchaseDate ? new Date(a.purchaseDate).getTime() : 0;
        const dB = b.purchaseDate ? new Date(b.purchaseDate).getTime() : 0;
        cmp = dA - dB;
      }
      return mult * cmp;
    });
    return arr;
  }, [items, sortState, companiesById]);

  const selectAllOnPage = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      sortedItems.forEach((i) => next.add(i.id));
      return next;
    });
    setSelectedItemsDetails((prev) => {
      const next = new Map(prev);
      sortedItems.forEach((i) => next.set(i.id, { code: i.code ?? "", name: i.name ?? "" }));
      return next;
    });
  };
  const clearAllOnPage = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      sortedItems.forEach((i) => next.delete(i.id));
      return next;
    });
    setSelectedItemsDetails((prev) => {
      const next = new Map(prev);
      sortedItems.forEach((i) => next.delete(i.id));
      return next;
    });
  };
  const allOnPageSelected = sortedItems.length > 0 && sortedItems.every((i) => selectedIds.has(i.id));

  const toggleColumn = (col: string) => {
    setVisibleColumns((prev) => {
      const next = { ...prev, [col]: !prev[col] };
      try {
        localStorage.setItem(INVENTORY_COLUMNS_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const handleSort = (col: SortableColumn) => {
    setSortState((prev) => {
      const sortDir: "asc" | "desc" = prev.sortBy === col && prev.sortDir === "asc" ? "desc" : "asc";
      const next = { sortBy: col, sortDir };
      try {
        localStorage.setItem(INVENTORY_SORT_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const visibleColumnCount = useMemo(
    () => Object.values(visibleColumns).filter(Boolean).length,
    [visibleColumns]
  );

  const editableFieldsOrder = useMemo(() => {
    const order: string[] = [];
    if (visibleColumns.code !== false) order.push("code");
    if (visibleColumns.name !== false) order.push("name");
    if (visibleColumns.category !== false) order.push("category");
    if (visibleColumns.responsible !== false) order.push("responsible");
    if (visibleColumns.company !== false) order.push("companyId");
    if (visibleColumns.condition !== false) order.push("condition");
    if (visibleColumns.units !== false) order.push("units");
    if (visibleColumns.date !== false) order.push("purchaseDate");
    if (visibleColumns.dateAddedModified !== false) order.push("dateAddedModified");
    return order;
  }, [visibleColumns]);

  const hasFilters = category || responsible || companyId !== "" || datePreset || recentPreset;

  const clearFilters = () => {
    setCategory("");
    setResponsible("");
    setCompanyId("");
    setDatePreset("");
    setRecentPreset("");
  };
  const createMutation = useCreateInventoryItem();
  const updateMutation = useUpdateInventoryItem();
  const deleteMutation = useDeleteInventoryItem();
  const uploadImageMutation = useUploadInventoryImage();
  const importMutation = useImportInventory();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const canEdit = (user?.role ?? "viewer") === "editor" || (user?.role ?? "viewer") === "admin";
  const exportCsvEndpoint = canEdit ? "/api/inventory/export/admin" : "/api/inventory/export";
  const exportXlsxEndpoint = canEdit ? "/api/inventory/export/admin/xlsx" : "/api/inventory/export/xlsx";
  const exportPdfEndpoint = canEdit ? "/api/inventory/export/admin/pdf" : "/api/inventory/export/pdf";
  const exportAllCsvUrl = `${exportCsvEndpoint}${exportQueryString ? `?${exportQueryString}` : ""}`;
  const exportAllXlsxUrl = `${exportXlsxEndpoint}${exportQueryString ? `?${exportQueryString}` : ""}`;
  const exportAllPdfUrl = `${exportPdfEndpoint}${exportQueryString ? `?${exportQueryString}` : ""}`;
  const exportSelectedCsvUrl = idsQueryString ? `${exportCsvEndpoint}?${idsQueryString}` : "";
  const exportSelectedXlsxUrl = idsQueryString ? `${exportXlsxEndpoint}?${idsQueryString}` : "";
  const exportSelectedPdfUrl = idsQueryString ? `${exportPdfEndpoint}?${idsQueryString}` : "";
  const { data: viewerAttachments = [] } = useAttachments(viewingItem?.id);
  const { data: viewerDocuments = [] } = useItemDocuments(viewingItem?.id, !!viewingItem);
  const { data: editingDocuments = [] } = useItemDocuments(editingItem?.id, !!editingItem);
  const uploadDocMutation = useUploadEmployeeDocument();
  const deleteDocMutation = useDeleteEmployeeDocument();
  const unlinkDocMutation = useUnlinkDocumentFromItem();
  const itemDocFileRef = useRef<HTMLInputElement>(null);
  const [loadingOverlay, setLoadingOverlay] = useState<{ open: boolean; title: string; message: string; progress?: number }>({
    open: false,
    title: "",
    message: "",
  });

  const handleCreate = async (data: any, imageFiles?: File[]) => {
    const totalSteps = 1 + (imageFiles?.length ?? 0);
    flushSync(() => {
      setLoadingOverlay({ open: true, title: "Creando artículo", message: "Guardando en la base de datos...", progress: 0 });
    });
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => requestAnimationFrame(r));
    try {
      const item = await createMutation.mutateAsync(data);
      if (totalSteps === 1) {
        setLoadingOverlay((prev) => ({ ...prev, progress: 100, message: "Listo." }));
      } else {
        setLoadingOverlay((prev) => ({ ...prev, progress: (1 / totalSteps) * 100, message: "Subiendo imagen 1 de " + imageFiles!.length + "..." }));
      }
      if (imageFiles?.length) {
        for (let i = 0; i < imageFiles.length; i++) {
          await uploadImageMutation.mutateAsync({ id: item.id, file: imageFiles[i] });
          const completed = 1 + i + 1;
          const pct = (completed / totalSteps) * 100;
          setLoadingOverlay((prev) => ({
            ...prev,
            progress: pct,
            message: i + 1 < imageFiles.length ? `Subiendo imagen ${i + 2} de ${imageFiles.length}...` : "Listo.",
          }));
        }
      }
      setIsCreateOpen(false);
      setLoadingOverlay((prev) => ({ ...prev, open: false }));
      toast({
        title: "Éxito",
        description: "Artículo creado correctamente.",
      });
    } catch (err: any) {
      setLoadingOverlay((prev) => ({ ...prev, open: false }));
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const handleUpdate = async (data: any, imageFiles?: File[]) => {
    if (!editingItem) return;
    const totalSteps = 1 + (imageFiles?.length ?? 0);
    flushSync(() => {
      setLoadingOverlay({ open: true, title: "Actualizando artículo", message: "Guardando cambios...", progress: 0 });
    });
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => requestAnimationFrame(r));
    try {
      await updateMutation.mutateAsync({ id: editingItem.id, ...data });
      if (totalSteps === 1) {
        setLoadingOverlay((prev) => ({ ...prev, progress: 100, message: "Listo." }));
      } else {
        setLoadingOverlay((prev) => ({ ...prev, progress: (1 / totalSteps) * 100, message: "Subiendo imagen 1 de " + imageFiles!.length + "..." }));
      }
      if (imageFiles?.length) {
        for (let i = 0; i < imageFiles.length; i++) {
          await uploadImageMutation.mutateAsync({ id: editingItem.id, file: imageFiles[i] });
          const completed = 1 + i + 1;
          const pct = (completed / totalSteps) * 100;
          setLoadingOverlay((prev) => ({
            ...prev,
            progress: pct,
            message: i + 1 < imageFiles.length ? `Subiendo imagen ${i + 2} de ${imageFiles.length}...` : "Listo.",
          }));
        }
      }
      setEditingItem(null);
      setLoadingOverlay((prev) => ({ ...prev, open: false }));
      toast({
        title: "Éxito",
        description: "Artículo actualizado correctamente.",
      });
    } catch (err: any) {
      setLoadingOverlay((prev) => ({ ...prev, open: false }));
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const result = await importMutation.mutateAsync(file);
      const desc = `${result.created} artículos importados${result.errors?.length ? `. ${result.errors.length} filas con errores.` : ""}${result.hint ? ` ${result.hint}` : ""}`;
      toast({
        title: result.created > 0 ? "Importación completada" : "Importación finalizada",
        description: desc,
        variant: result.created === 0 && result.errors?.length ? "destructive" : "default",
      });
      e.target.value = "";
    } catch (err: any) {
      toast({
        title: "Error de importación",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      await deleteMutation.mutateAsync(deletingId);
      setDeletingId(null);
    } catch {
      setDeletingId(null);
    }
  };

  const handleBulkDelete = async () => {
    if (!canEdit) return;
    const ids = selectedIdsArray;
    if (ids.length === 0) return;

    setBulkDeleteOpen(false);
    setBulkDeleting(true);

    const total = ids.length;
    try {
      flushSync(() => {
        setLoadingOverlay({
          open: true,
          title: "Eliminando artículos",
          message: `Eliminando 1 de ${total}...`,
          progress: 0,
        });
      });
      // Let the overlay render before starting the loop.
      await new Promise((r) => requestAnimationFrame(r));

      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        const url = buildUrl(api.inventory.delete.path, { id });
        const res = await fetch(url, {
          method: api.inventory.delete.method,
          credentials: "include",
        });

        if (!res.ok && res.status !== 404) {
          const text = await res.text().catch(() => "");
          throw new Error(`No se pudo eliminar el artículo #${id}${text ? `: ${text}` : ""}`);
        }

        const completed = i + 1;
        const pct = (completed / total) * 100;
        setLoadingOverlay((prev) => ({
          ...prev,
          progress: pct,
          message: `Eliminando ${completed} de ${total}...`,
        }));
      }

      queryClient.invalidateQueries({ queryKey: [api.inventory.list.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/filters"] });

      toast({
        title: "Éxito",
        description: `Se eliminaron ${total} artículo${total !== 1 ? "s" : ""}.`,
      });
      clearSelection();
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.message || "No se pudo eliminar la selección.",
        variant: "destructive",
      });
    } finally {
      setBulkDeleting(false);
      setLoadingOverlay((prev) => ({ ...prev, open: false }));
    }
  };

  const handleBulkDuplicate = async () => {
    if (!canEdit) return;
    const ids = selectedIdsArray;
    if (ids.length === 0) return;

    setBulkDuplicateOpen(false);
    setBulkDuplicating(true);

    const total = ids.length;
    try {
      flushSync(() => {
        setLoadingOverlay({
          open: true,
          title: "Duplicando artículos",
          message: `Duplicando 1 de ${total}...`,
          progress: 0,
        });
      });
      // Let the overlay render before starting the loop.
      await new Promise((r) => requestAnimationFrame(r));

      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];

        const getRes = await fetch(`/api/inventory/${id}`, { credentials: "include" });
        if (!getRes.ok) {
          const text = await getRes.text().catch(() => "");
          throw new Error(`No se pudo cargar el artículo #${id}${text ? `: ${text}` : ""}`);
        }
        const item = (await getRes.json()) as InventoryItem;

        const payload = inventoryItemToDuplicateCreateBody(item);

        const createRes = await fetch(api.inventory.create.path, {
          method: api.inventory.create.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          credentials: "include",
        });

        if (!createRes.ok) {
          const err = await createRes.json().catch(() => ({}));
          const msg = (err as { message?: string }).message || createRes.statusText || "Error duplicando";
          throw new Error(`No se pudo duplicar #${id}: ${msg}`);
        }

        const completed = i + 1;
        const pct = (completed / total) * 100;
        setLoadingOverlay((prev) => ({
          ...prev,
          progress: pct,
          message: `Duplicando ${completed} de ${total}...`,
        }));
      }

      queryClient.invalidateQueries({ queryKey: [api.inventory.list.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/filters"] });

      toast({
        title: "Éxito",
        description: `Se duplicaron ${total} artículo${total !== 1 ? "s" : ""}.`,
      });
      clearSelection();
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.message || "No se pudo duplicar la selección.",
        variant: "destructive",
      });
    } finally {
      setBulkDuplicating(false);
      setLoadingOverlay((prev) => ({ ...prev, open: false }));
    }
  };

  const getNextCell = (rowIndex: number, field: string, direction: "next" | "prev"): { itemId: number; field: string } | null => {
    const idx = editableFieldsOrder.indexOf(field);
    if (idx === -1) return null;
    if (direction === "next") {
      if (idx + 1 < editableFieldsOrder.length) {
        return { itemId: sortedItems[rowIndex].id, field: editableFieldsOrder[idx + 1] };
      }
      if (rowIndex + 1 < sortedItems.length) {
        return { itemId: sortedItems[rowIndex + 1].id, field: editableFieldsOrder[0] };
      }
      return null;
    }
    if (idx > 0) {
      return { itemId: sortedItems[rowIndex].id, field: editableFieldsOrder[idx - 1] };
    }
    if (rowIndex > 0) {
      return { itemId: sortedItems[rowIndex - 1].id, field: editableFieldsOrder[editableFieldsOrder.length - 1] };
    }
    return null;
  };

  const saveInlineEdit = async (itemId: number, field: string, value: unknown) => {
    const item = sortedItems.find((i) => i.id === itemId);
    if (!item) return;
    let normalized: Record<string, unknown> = {};
    if (field === "code" || field === "name" || field === "responsible" || field === "category" || field === "condition") {
      const s = typeof value === "string" ? value.trim() : String(value ?? "");
      if (field === "code" || field === "name") {
        if (!s) {
          toast({ title: "Error", description: field === "code" ? "El código es obligatorio." : "El nombre es obligatorio.", variant: "destructive" });
          return;
        }
      }
      normalized[field] = s || null;
    } else if (field === "companyId") {
      const v = value === "" || value == null ? null : Number(value);
      normalized[field] = Number.isFinite(v) ? v : null;
    } else if (field === "units") {
      const v = Number(value);
      normalized[field] = Number.isFinite(v) && v >= 0 ? v : item.units;
    } else if (field === "purchaseDate") {
      normalized[field] = value && typeof value === "string" ? value : null;
    }
    const current = (item as Record<string, unknown>)[field === "companyId" ? "companyId" : field];
    if (normalized[field] === current) {
      setEditingCell(null);
      return;
    }
    setSavingInlineCell({ itemId, field });
    try {
      await updateMutation.mutateAsync({ id: itemId, ...normalized });
      toast({ title: "Guardado", description: "Cambio guardado." });
      setEditingCell(null);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSavingInlineCell(null);
    }
  };

  useEffect(() => {
    if (!editingCell) return;
    const key = `${editingCell.itemId}-${editingCell.field}`;
    const el = editInputRefs.current.get(key);
    if (el && typeof el.focus === "function") el.focus();
  }, [editingCell]);

  return (
    <div className="space-y-8">
      <LoadingOverlay
        open={loadingOverlay.open}
        title={loadingOverlay.title}
        message={loadingOverlay.message}
        progress={loadingOverlay.progress}
      />
      {/* Action buttons */}
      <div className="flex flex-wrap items-center justify-end gap-2">
          {canEdit && (
          <Button variant="outline" size="sm" onClick={() => { window.location.href = "/api/inventory/export/template"; }}>
            <Download className="w-4 h-4 mr-2" />
            Plantilla
          </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Download className="w-4 h-4 mr-2" />
                Exportar
                <ChevronDown className="w-4 h-4 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {hasSelection && (
                <>
                  <DropdownMenuLabel>Exportar selección ({selectedIds.size})</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => { toast({ title: "Exportando", description: "Preparando descarga..." }); window.location.href = exportSelectedCsvUrl; }}>
                    <Download className="w-4 h-4 mr-2" />
                    Exportar selección a CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { toast({ title: "Exportando", description: "Preparando descarga..." }); window.location.href = exportSelectedXlsxUrl; }}>
                    <FileSpreadsheet className="w-4 h-4 mr-2" />
                    Exportar selección a XLSX
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { toast({ title: "Exportando", description: "Preparando descarga..." }); window.location.href = exportSelectedPdfUrl; }}>
                    <FileText className="w-4 h-4 mr-2" />
                    Exportar selección a PDF
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Exportar todo (filtros)</DropdownMenuLabel>
                </>
              )}
              <DropdownMenuItem onClick={() => { toast({ title: "Exportando", description: "Preparando descarga..." }); window.location.href = exportAllCsvUrl; }}>
                <Download className="w-4 h-4 mr-2" />
                {hasSelection ? "Exportar todo a CSV" : "Exportar a CSV"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { toast({ title: "Exportando", description: "Preparando descarga..." }); window.location.href = exportAllXlsxUrl; }}>
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                {hasSelection ? "Exportar todo a XLSX" : "Exportar a XLSX"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { toast({ title: "Exportando", description: "Preparando descarga..." }); window.location.href = exportAllPdfUrl; }}>
                <FileText className="w-4 h-4 mr-2" />
                {hasSelection ? "Exportar todo a PDF" : "Exportar a PDF"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {canEdit && (
          <>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleImport}
          />
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={importMutation.isPending}>
            {importMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
            Importar CSV
          </Button>
          <Button 
            onClick={() => setIsCreateOpen(true)}
            className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg hover:shadow-primary/25 transition-all"
          >
            <Plus className="w-5 h-5 mr-2" />
            Agregar artículo
          </Button>
          </>
          )}
      </div>

      {/* Filters & Controls */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card p-4 rounded-xl border border-border/50 shadow-sm">
          <div className="relative flex-1 max-w-md">
            <IntelligentSearchBar
              value={search}
              onChange={setSearch}
              items={items}
              isLoading={isLoading}
              placeholder="Buscar por nombre, código, categoría o proveedor…"
            />
          </div>
          <div className="text-sm text-muted-foreground font-medium shrink-0">
            Total: {isLoading ? "..." : totalItems} artículo{totalItems !== 1 ? "s" : ""}
          </div>
        </div>

        {/* Quick Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Filtros rápidos:</span>
          <Select value={category || "all"} onValueChange={(v) => setCategory(v === "all" ? "" : v)}>
            <SelectTrigger className="w-[160px] h-8 text-sm">
              <SelectValue placeholder="Por categoría" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las categorías</SelectItem>
              {filterOptions.categories.map((c) => (
                <SelectItem key={c} value={c}>{categoryToDisplay(c)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={responsible || "all"} onValueChange={(v) => setResponsible(v === "all" ? "" : v)}>
            <SelectTrigger className="w-[160px] h-8 text-sm">
              <SelectValue placeholder="Por persona" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las personas</SelectItem>
              {filterOptions.responsible.map((r) => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={companyId === "" ? "all" : String(companyId)}
            onValueChange={(v) => setCompanyId(v === "all" ? "" : Number(v))}
          >
            <SelectTrigger className="w-[160px] h-8 text-sm">
              <SelectValue placeholder="Por empresa" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las empresas</SelectItem>
              {(filterOptions.companies ?? []).map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={datePreset || "all"} onValueChange={(v) => setDatePreset(v === "all" ? "" : v)}>
            <SelectTrigger className="w-[160px] h-8 text-sm">
              <SelectValue placeholder="Por fecha de compra" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las fechas</SelectItem>
              <SelectItem value="this-year">Este año</SelectItem>
              <SelectItem value="last-year">Año pasado</SelectItem>
              <SelectItem value="last-6m">Últimos 6 meses</SelectItem>
            </SelectContent>
          </Select>
          <Select value={recentPreset || "none"} onValueChange={(v) => setRecentPreset(v === "none" ? "" : v)}>
            <SelectTrigger className="w-[180px] h-8 text-sm">
              <SelectValue placeholder="Recientes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Recientes: ninguno</SelectItem>
              <SelectItem value="added-7">Añadidos últimos 7 días</SelectItem>
              <SelectItem value="added-30">Añadidos últimos 30 días</SelectItem>
              <SelectItem value="modified-7">Modificados últimos 7 días</SelectItem>
              <SelectItem value="modified-30">Modificados últimos 30 días</SelectItem>
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button variant="ghost" size="sm" className="h-8 text-muted-foreground" onClick={clearFilters}>
              <FilterX className="h-4 w-4 mr-1" />
              Limpiar filtros
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8">
                <Columns3 className="w-4 h-4 mr-1.5" />
                Columnas
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Mostrar columnas</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {SORTABLE_COLUMNS.map(({ id, label }) => (
                <DropdownMenuCheckboxItem
                  key={id}
                  checked={visibleColumns[id] !== false}
                  onCheckedChange={() => toggleColumn(id)}
                >
                  {label}
                </DropdownMenuCheckboxItem>
              ))}
              <DropdownMenuSeparator />
              {DISPLAY_ONLY_COLUMNS.map(({ id, label }) => (
                <DropdownMenuCheckboxItem
                  key={id}
                  checked={visibleColumns[id] !== false}
                  onCheckedChange={() => toggleColumn(id)}
                >
                  {label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {hasSelection && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-foreground">
                {selectedIds.size} artículo{selectedIds.size !== 1 ? "s" : ""} seleccionado{selectedIds.size !== 1 ? "s" : ""}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {canEdit && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8"
                      onClick={() => setBulkDuplicateOpen(true)}
                      disabled={loadingOverlay.open || bulkDuplicating || bulkDeleting}
                    >
                      <Copy className="w-4 h-4 mr-2" />
                      Duplicar
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 border-destructive text-destructive hover:bg-destructive/10"
                      onClick={() => setBulkDeleteOpen(true)}
                      disabled={loadingOverlay.open || bulkDuplicating || bulkDeleting}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Eliminar
                    </Button>
                  </>
                )}
                <Button variant="ghost" size="sm" className="h-8" onClick={clearSelection}>
                  Limpiar selección
                </Button>
              </div>
            </div>
            <div className="border-t border-primary/20 pt-2">
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Seleccionados:</p>
              <ScrollArea className="w-full max-h-32 rounded-md border border-border/50 bg-background/50 px-2 py-1.5">
                <div className="flex flex-wrap gap-1.5">
                  {selectedIdsArray.map((id) => {
                    const details = selectedItemsDetails.get(id);
                    const label = details ? `${details.code} – ${details.name}` : `#${id}`;
                    return (
                      <span
                        key={id}
                        className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs font-medium text-foreground"
                      >
                        <span className="truncate max-w-[200px]" title={label}>{label}</span>
                        <button
                          type="button"
                          onClick={() => toggleSelection(id)}
                          className="shrink-0 rounded p-0.5 hover:bg-muted-foreground/20 text-muted-foreground hover:text-foreground"
                          aria-label={`Quitar de selección: ${label}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          </div>
        )}
      </div>

      {/* Data Grid */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[44px]">
                <Checkbox
                  checked={allOnPageSelected}
                  onCheckedChange={(checked) => (checked ? selectAllOnPage() : clearAllOnPage())}
                  aria-label="Seleccionar todos en la página"
                />
              </TableHead>
              {visibleColumns.image !== false && <TableHead className="w-[60px]">Imagen</TableHead>}
              {visibleColumns.code !== false && (
                <TableHead className="w-[100px]">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="-ml-2 h-8 font-medium hover:bg-muted/50 gap-1"
                    onClick={() => handleSort("code")}
                  >
                    Código
                    {sortState.sortBy === "code" ? (sortState.sortDir === "asc" ? <ChevronUp className="w-4 h-4 shrink-0" /> : <ChevronDown className="w-4 h-4 shrink-0" />) : <ChevronsUpDown className="w-4 h-4 shrink-0 text-muted-foreground/50" />}
                  </Button>
                </TableHead>
              )}
              {visibleColumns.name !== false && (
                <TableHead className="min-w-[200px]">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="-ml-2 h-8 font-medium hover:bg-muted/50 gap-1"
                    onClick={() => handleSort("name")}
                  >
                    Nombre / Descripción
                    {sortState.sortBy === "name" ? (sortState.sortDir === "asc" ? <ChevronUp className="w-4 h-4 shrink-0" /> : <ChevronDown className="w-4 h-4 shrink-0" />) : <ChevronsUpDown className="w-4 h-4 shrink-0 text-muted-foreground/50" />}
                  </Button>
                </TableHead>
              )}
              {visibleColumns.category !== false && (
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="-ml-2 h-8 font-medium hover:bg-muted/50 gap-1"
                    onClick={() => handleSort("category")}
                  >
                    Categoría
                    {sortState.sortBy === "category" ? (sortState.sortDir === "asc" ? <ChevronUp className="w-4 h-4 shrink-0" /> : <ChevronDown className="w-4 h-4 shrink-0" />) : <ChevronsUpDown className="w-4 h-4 shrink-0 text-muted-foreground/50" />}
                  </Button>
                </TableHead>
              )}
              {visibleColumns.responsible !== false && (
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="-ml-2 h-8 font-medium hover:bg-muted/50 gap-1"
                    onClick={() => handleSort("responsible")}
                  >
                    Responsable
                    {sortState.sortBy === "responsible" ? (sortState.sortDir === "asc" ? <ChevronUp className="w-4 h-4 shrink-0" /> : <ChevronDown className="w-4 h-4 shrink-0" />) : <ChevronsUpDown className="w-4 h-4 shrink-0 text-muted-foreground/50" />}
                  </Button>
                </TableHead>
              )}
              {visibleColumns.company !== false && (
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="-ml-2 h-8 font-medium hover:bg-muted/50 gap-1"
                    onClick={() => handleSort("company")}
                  >
                    Empresa
                    {sortState.sortBy === "company" ? (sortState.sortDir === "asc" ? <ChevronUp className="w-4 h-4 shrink-0" /> : <ChevronDown className="w-4 h-4 shrink-0" />) : <ChevronsUpDown className="w-4 h-4 shrink-0 text-muted-foreground/50" />}
                  </Button>
                </TableHead>
              )}
              {visibleColumns.condition !== false && (
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="-ml-2 h-8 font-medium hover:bg-muted/50 gap-1"
                    onClick={() => handleSort("condition")}
                  >
                    Condición
                    {sortState.sortBy === "condition" ? (sortState.sortDir === "asc" ? <ChevronUp className="w-4 h-4 shrink-0" /> : <ChevronDown className="w-4 h-4 shrink-0" />) : <ChevronsUpDown className="w-4 h-4 shrink-0 text-muted-foreground/50" />}
                  </Button>
                </TableHead>
              )}
              {visibleColumns.units !== false && (
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="-ml-2 h-8 font-medium hover:bg-muted/50 gap-1"
                    onClick={() => handleSort("units")}
                  >
                    Unidades
                    {sortState.sortBy === "units" ? (sortState.sortDir === "asc" ? <ChevronUp className="w-4 h-4 shrink-0" /> : <ChevronDown className="w-4 h-4 shrink-0" />) : <ChevronsUpDown className="w-4 h-4 shrink-0 text-muted-foreground/50" />}
                  </Button>
                </TableHead>
              )}
              {visibleColumns.date !== false && (
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="-ml-2 h-8 font-medium hover:bg-muted/50 gap-1"
                    onClick={() => handleSort("date")}
                  >
                    Fecha
                    {sortState.sortBy === "date" ? (sortState.sortDir === "asc" ? <ChevronUp className="w-4 h-4 shrink-0" /> : <ChevronDown className="w-4 h-4 shrink-0" />) : <ChevronsUpDown className="w-4 h-4 shrink-0 text-muted-foreground/50" />}
                  </Button>
                </TableHead>
              )}
              {visibleColumns.dateAddedModified !== false && (
                <TableHead className="whitespace-nowrap">Añadido / Modificado</TableHead>
              )}
              {visibleColumns.actions !== false && <TableHead className="text-right">Acciones</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={visibleColumnCount + 1} className="h-48 text-center">
                  <div className="flex items-center justify-center text-muted-foreground gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Cargando inventario...
                  </div>
                </TableCell>
              </TableRow>
            ) : sortedItems && sortedItems.length > 0 ? (
              sortedItems.map((item, rowIndex) => (
                <TableRow key={item.id} className="hover:bg-muted/20 transition-colors group">
                  <TableCell className="w-[44px]">
                    <Checkbox
                      checked={selectedIds.has(item.id)}
                      onCheckedChange={() => toggleSelection(item.id, item)}
                      aria-label={`Seleccionar ${item.name}`}
                    />
                  </TableCell>
                  {visibleColumns.image !== false && (
                    <TableCell className="w-[60px]">
                      {item.imageUrl ? (
                        <button
                          type="button"
                          onClick={() => setViewingItem(item)}
                          className="w-10 h-10 rounded border border-border overflow-hidden bg-muted shrink-0 hover:ring-2 hover:ring-primary/50 cursor-pointer transition-all block"
                        >
                          <img
                            src={thumbUrl(item.imageUrl) ?? item.imageUrl ?? ""}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            className="w-full h-full object-cover"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).src = item.imageUrl ?? ""; }}
                          />
                        </button>
                      ) : (
                        <div className="w-10 h-10 rounded border border-dashed border-muted-foreground/30 flex items-center justify-center bg-muted/30">
                          <ImageIcon className="w-4 h-4 text-muted-foreground" />
                        </div>
                      )}
                    </TableCell>
                  )}
                  {visibleColumns.code !== false && (
                    <TableCell className="font-mono text-sm font-medium text-muted-foreground p-0">
                      {canEdit && savingInlineCell?.itemId === item.id && savingInlineCell?.field === "code" ? (
                        <div className="min-h-8 px-3 py-1.5 flex items-center gap-2 text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                          <span className="text-sm">Guardando...</span>
                        </div>
                      ) : canEdit && editingCell?.itemId === item.id && editingCell?.field === "code" ? (
                        <Input
                          ref={(el) => {
                            if (el) editInputRefs.current.set(`${item.id}-code`, el);
                            else editInputRefs.current.delete(`${item.id}-code`);
                          }}
                          className="h-8 rounded-none border-0 border-b border-transparent bg-transparent font-mono text-sm shadow-none focus-visible:ring-0 focus-visible:border-primary"
                          defaultValue={item.code}
                          onBlur={(e) => saveInlineEdit(item.id, "code", e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              saveInlineEdit(item.id, "code", (e.target as HTMLInputElement).value);
                            } else if (e.key === "Tab") {
                              e.preventDefault();
                              saveInlineEdit(item.id, "code", (e.target as HTMLInputElement).value).then(() => {
                                const next = getNextCell(rowIndex, "code", e.shiftKey ? "prev" : "next");
                                if (next) setEditingCell(next);
                                else setEditingCell(null);
                              });
                            }
                          }}
                        />
                      ) : canEdit ? (
                        <div
                          className="min-h-8 px-3 py-1.5 flex items-center cursor-cell"
                          tabIndex={0}
                          onClick={() => setEditingCell({ itemId: item.id, field: "code" })}
                          onFocus={() => setEditingCell({ itemId: item.id, field: "code" })}
                        >
                          {item.code}
                        </div>
                      ) : (
                        item.code
                      )}
                    </TableCell>
                  )}
                  {visibleColumns.name !== false && (
                    <TableCell className="p-0">
                      {canEdit && savingInlineCell?.itemId === item.id && savingInlineCell?.field === "name" ? (
                        <div className="min-h-8 px-3 py-1.5 flex items-center gap-2 text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                          <span className="text-sm">Guardando...</span>
                        </div>
                      ) : canEdit && editingCell?.itemId === item.id && editingCell?.field === "name" ? (
                        <Input
                          ref={(el) => {
                            if (el) editInputRefs.current.set(`${item.id}-name`, el);
                            else editInputRefs.current.delete(`${item.id}-name`);
                          }}
                          className="h-8 min-w-[120px] rounded-none border-0 border-b border-transparent bg-transparent text-sm shadow-none focus-visible:ring-0 focus-visible:border-primary"
                          defaultValue={item.name}
                          onBlur={(e) => saveInlineEdit(item.id, "name", e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              saveInlineEdit(item.id, "name", (e.target as HTMLInputElement).value);
                            } else if (e.key === "Tab") {
                              e.preventDefault();
                              saveInlineEdit(item.id, "name", (e.target as HTMLInputElement).value).then(() => {
                                const next = getNextCell(rowIndex, "name", e.shiftKey ? "prev" : "next");
                                if (next) setEditingCell(next);
                                else setEditingCell(null);
                              });
                            }
                          }}
                        />
                      ) : canEdit ? (
                        <div
                          className="min-h-8 px-3 py-1.5 cursor-cell"
                          tabIndex={0}
                          onClick={() => setEditingCell({ itemId: item.id, field: "name" })}
                          onFocus={() => setEditingCell({ itemId: item.id, field: "name" })}
                        >
                          <div className="font-medium text-foreground">{item.name}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {item.serialNumber ? `S/N: ${item.serialNumber}` : "Sin S/N"}
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="font-medium text-foreground">{item.name}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {item.serialNumber ? `S/N: ${item.serialNumber}` : "Sin S/N"}
                          </div>
                        </>
                      )}
                    </TableCell>
                  )}
                  {visibleColumns.category !== false && (
                    <TableCell className="p-0">
                      {canEdit && savingInlineCell?.itemId === item.id && savingInlineCell?.field === "category" ? (
                        <div className="min-h-8 px-3 py-1.5 flex items-center gap-2 text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                          <span className="text-sm">Guardando...</span>
                        </div>
                      ) : canEdit && editingCell?.itemId === item.id && editingCell?.field === "category" ? (
                        <Select
                          value={item.category ?? ""}
                          onValueChange={(val) => {
                            saveInlineEdit(item.id, "category", val);
                            setEditingCell(null);
                          }}
                        >
                          <SelectTrigger
                            ref={(el) => {
                              if (el) editInputRefs.current.set(`${item.id}-category`, el);
                              else editInputRefs.current.delete(`${item.id}-category`);
                            }}
                            className="h-8 min-w-[100px] rounded-none border-0 border-b border-transparent bg-transparent shadow-none focus:ring-0 focus-visible:ring-0"
                            onKeyDown={(e) => {
                              if (e.key === "Tab") {
                                e.preventDefault();
                                saveInlineEdit(item.id, "category", item.category ?? "");
                                const next = getNextCell(rowIndex, "category", e.shiftKey ? "prev" : "next");
                                if (next) setEditingCell(next);
                                else setEditingCell(null);
                              }
                            }}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {BASE_CATEGORIES.map((c) => (
                              <SelectItem key={c} value={c}>{categoryToDisplay(c)}</SelectItem>
                            ))}
                            {(filterOptions.categories ?? []).filter((c) => !BASE_CATEGORIES.includes(c)).map((c) => (
                              <SelectItem key={c} value={c}>{categoryToDisplay(c)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : canEdit ? (
                        <div
                          className="min-h-8 px-3 py-1.5 flex items-center cursor-cell"
                          tabIndex={0}
                          onClick={() => setEditingCell({ itemId: item.id, field: "category" })}
                          onFocus={() => setEditingCell({ itemId: item.id, field: "category" })}
                        >
                          {categoryToDisplay(item.category)}
                        </div>
                      ) : (
                        categoryToDisplay(item.category)
                      )}
                    </TableCell>
                  )}
                  {visibleColumns.responsible !== false && (
                    <TableCell className="text-muted-foreground p-0">
                      {canEdit && savingInlineCell?.itemId === item.id && savingInlineCell?.field === "responsible" ? (
                        <div className="min-h-8 px-3 py-1.5 flex items-center gap-2 text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                          <span className="text-sm">Guardando...</span>
                        </div>
                      ) : canEdit && editingCell?.itemId === item.id && editingCell?.field === "responsible" ? (
                        <Input
                          ref={(el) => {
                            if (el) editInputRefs.current.set(`${item.id}-responsible`, el);
                            else editInputRefs.current.delete(`${item.id}-responsible`);
                          }}
                          className="h-8 min-w-[100px] rounded-none border-0 border-b border-transparent bg-transparent text-sm shadow-none focus-visible:ring-0 focus-visible:border-primary"
                          defaultValue={item.responsible ?? ""}
                          onBlur={(e) => saveInlineEdit(item.id, "responsible", e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              saveInlineEdit(item.id, "responsible", (e.target as HTMLInputElement).value);
                            } else if (e.key === "Tab") {
                              e.preventDefault();
                              saveInlineEdit(item.id, "responsible", (e.target as HTMLInputElement).value).then(() => {
                                const next = getNextCell(rowIndex, "responsible", e.shiftKey ? "prev" : "next");
                                if (next) setEditingCell(next);
                                else setEditingCell(null);
                              });
                            }
                          }}
                        />
                      ) : canEdit ? (
                        <div
                          className="min-h-8 px-3 py-1.5 flex items-center cursor-cell"
                          tabIndex={0}
                          onClick={() => setEditingCell({ itemId: item.id, field: "responsible" })}
                          onFocus={() => setEditingCell({ itemId: item.id, field: "responsible" })}
                        >
                          {item.responsible || "-"}
                        </div>
                      ) : (
                        item.responsible || "-"
                      )}
                    </TableCell>
                  )}
                  {visibleColumns.company !== false && (
                    <TableCell className="text-muted-foreground p-0">
                      {canEdit && savingInlineCell?.itemId === item.id && savingInlineCell?.field === "companyId" ? (
                        <div className="min-h-8 px-3 py-1.5 flex items-center gap-2 text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                          <span className="text-sm">Guardando...</span>
                        </div>
                      ) : canEdit && editingCell?.itemId === item.id && editingCell?.field === "companyId" ? (
                        <Select
                          value={item.companyId != null ? String(item.companyId) : ""}
                          onValueChange={(val) => {
                            saveInlineEdit(item.id, "companyId", val === "" ? null : Number(val));
                            setEditingCell(null);
                          }}
                        >
                          <SelectTrigger
                            ref={(el) => {
                              if (el) editInputRefs.current.set(`${item.id}-companyId`, el);
                              else editInputRefs.current.delete(`${item.id}-companyId`);
                            }}
                            className="h-8 min-w-[100px] rounded-none border-0 border-b border-transparent bg-transparent shadow-none focus:ring-0 focus-visible:ring-0"
                            onKeyDown={(e) => {
                              if (e.key === "Tab") {
                                e.preventDefault();
                                saveInlineEdit(item.id, "companyId", item.companyId ?? null);
                                const next = getNextCell(rowIndex, "companyId", e.shiftKey ? "prev" : "next");
                                if (next) setEditingCell(next);
                                else setEditingCell(null);
                              }
                            }}
                          >
                            <SelectValue placeholder="Empresa" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">—</SelectItem>
                            {(filterOptions.companies ?? []).map((c) => (
                              <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : canEdit ? (
                        <div
                          className="min-h-8 px-3 py-1.5 flex items-center cursor-cell"
                          tabIndex={0}
                          onClick={() => setEditingCell({ itemId: item.id, field: "companyId" })}
                          onFocus={() => setEditingCell({ itemId: item.id, field: "companyId" })}
                        >
                          {item.companyId != null ? (companiesById.get(item.companyId) ?? item.companyId) : "-"}
                        </div>
                      ) : (
                        item.companyId != null ? (companiesById.get(item.companyId) ?? item.companyId) : "-"
                      )}
                    </TableCell>
                  )}
                  {visibleColumns.condition !== false && (
                    <TableCell className="p-0">
                      {canEdit && savingInlineCell?.itemId === item.id && savingInlineCell?.field === "condition" ? (
                        <div className="min-h-8 px-3 py-1.5 flex items-center gap-2 text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                          <span className="text-sm">Guardando...</span>
                        </div>
                      ) : canEdit && editingCell?.itemId === item.id && editingCell?.field === "condition" ? (
                        <Select
                          value={item.condition ?? "New"}
                          onValueChange={(val) => {
                            saveInlineEdit(item.id, "condition", val);
                            setEditingCell(null);
                          }}
                        >
                          <SelectTrigger
                            ref={(el) => {
                              if (el) editInputRefs.current.set(`${item.id}-condition`, el);
                              else editInputRefs.current.delete(`${item.id}-condition`);
                            }}
                            className="h-8 min-w-[90px] rounded-none border-0 border-b border-transparent bg-transparent shadow-none focus:ring-0 focus-visible:ring-0"
                            onKeyDown={(e) => {
                              if (e.key === "Tab") {
                                e.preventDefault();
                                saveInlineEdit(item.id, "condition", item.condition ?? "");
                                const next = getNextCell(rowIndex, "condition", e.shiftKey ? "prev" : "next");
                                if (next) setEditingCell(next);
                                else setEditingCell(null);
                              }
                            }}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CONDITIONS.map((c) => (
                              <SelectItem key={c} value={c}>{conditionToDisplay(c)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : canEdit ? (
                        <div
                          className="min-h-8 px-3 py-1.5 flex items-center cursor-cell"
                          tabIndex={0}
                          onClick={() => setEditingCell({ itemId: item.id, field: "condition" })}
                          onFocus={() => setEditingCell({ itemId: item.id, field: "condition" })}
                        >
                          <StatusBadge status={item.condition || "Unknown"} />
                        </div>
                      ) : (
                        <StatusBadge status={item.condition || "Unknown"} />
                      )}
                    </TableCell>
                  )}
                  {visibleColumns.units !== false && (
                    <TableCell className="p-0">
                      {canEdit && savingInlineCell?.itemId === item.id && savingInlineCell?.field === "units" ? (
                        <div className="min-h-8 px-3 py-1.5 flex items-center gap-2 text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                          <span className="text-sm">Guardando...</span>
                        </div>
                      ) : canEdit && editingCell?.itemId === item.id && editingCell?.field === "units" ? (
                        <Input
                          type="number"
                          min={0}
                          ref={(el) => {
                            if (el) editInputRefs.current.set(`${item.id}-units`, el);
                            else editInputRefs.current.delete(`${item.id}-units`);
                          }}
                          className="h-8 w-16 rounded-none border-0 border-b border-transparent bg-transparent text-sm shadow-none focus-visible:ring-0 focus-visible:border-primary"
                          defaultValue={item.units}
                          onBlur={(e) => saveInlineEdit(item.id, "units", e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              saveInlineEdit(item.id, "units", (e.target as HTMLInputElement).value);
                            } else if (e.key === "Tab") {
                              e.preventDefault();
                              saveInlineEdit(item.id, "units", (e.target as HTMLInputElement).value).then(() => {
                                const next = getNextCell(rowIndex, "units", e.shiftKey ? "prev" : "next");
                                if (next) setEditingCell(next);
                                else setEditingCell(null);
                              });
                            }
                          }}
                        />
                      ) : canEdit ? (
                        <div
                          className="min-h-8 px-3 py-1.5 flex items-center cursor-cell"
                          tabIndex={0}
                          onClick={() => setEditingCell({ itemId: item.id, field: "units" })}
                          onFocus={() => setEditingCell({ itemId: item.id, field: "units" })}
                        >
                          {item.units}
                        </div>
                      ) : (
                        item.units
                      )}
                    </TableCell>
                  )}
                  {visibleColumns.date !== false && (
                    <TableCell className="text-muted-foreground text-sm p-0">
                      {canEdit && savingInlineCell?.itemId === item.id && savingInlineCell?.field === "purchaseDate" ? (
                        <div className="min-h-8 px-3 py-1.5 flex items-center gap-2 text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                          <span className="text-sm">Guardando...</span>
                        </div>
                      ) : canEdit && editingCell?.itemId === item.id && editingCell?.field === "purchaseDate" ? (
                        <Input
                          type="date"
                          ref={(el) => {
                            if (el) editInputRefs.current.set(`${item.id}-purchaseDate`, el);
                            else editInputRefs.current.delete(`${item.id}-purchaseDate`);
                          }}
                          className="h-8 min-w-[110px] rounded-none border-0 border-b border-transparent bg-transparent text-sm shadow-none focus-visible:ring-0 focus-visible:border-primary"
                          defaultValue={item.purchaseDate ? String(item.purchaseDate).slice(0, 10) : ""}
                          onBlur={(e) => saveInlineEdit(item.id, "purchaseDate", e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              saveInlineEdit(item.id, "purchaseDate", (e.target as HTMLInputElement).value);
                            } else if (e.key === "Tab") {
                              e.preventDefault();
                              saveInlineEdit(item.id, "purchaseDate", (e.target as HTMLInputElement).value).then(() => {
                                const next = getNextCell(rowIndex, "purchaseDate", e.shiftKey ? "prev" : "next");
                                if (next) setEditingCell(next);
                                else setEditingCell(null);
                              });
                            }
                          }}
                        />
                      ) : canEdit ? (
                        <div
                          className="min-h-8 px-3 py-1.5 flex items-center cursor-cell"
                          tabIndex={0}
                          onClick={() => setEditingCell({ itemId: item.id, field: "purchaseDate" })}
                          onFocus={() => setEditingCell({ itemId: item.id, field: "purchaseDate" })}
                        >
                          {item.purchaseDate ? format(new Date(item.purchaseDate), "MMM dd, yyyy") : "-"}
                        </div>
                      ) : (
                        item.purchaseDate ? format(new Date(item.purchaseDate), "MMM dd, yyyy") : "-"
                      )}
                    </TableCell>
                  )}
                  {visibleColumns.dateAddedModified !== false && (
                    <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                      <span className="block">{item.createdAt ? `Añadido: ${format(new Date(item.createdAt), "MMM dd, yyyy")}` : "—"}</span>
                      {item.updatedAt != null && (
                        <span className="block text-muted-foreground/80">Modificado: {format(new Date(item.updatedAt), "MMM dd, yyyy")}</span>
                      )}
                    </TableCell>
                  )}
                  {visibleColumns.actions !== false && (
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 hover:text-foreground"
                        onClick={() => setLabelItem(item)}
                        title="Etiqueta / Código QR"
                      >
                        <QrCode className="w-4 h-4" />
                      </Button>
                      {!canEdit && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 hover:text-primary hover:bg-primary/10"
                          onClick={() => setViewItemDetails(item)}
                          title="Ver artículo"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      )}
                      {canEdit && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 hover:text-primary hover:bg-primary/10"
                            onClick={() => setEditingItem(item)}
                            title="Editar"
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 hover:bg-muted"
                            onClick={() => {
                              setDuplicatingItem(item);
                              setIsCreateOpen(true);
                            }}
                            title="Duplicar artículo"
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setDeletingId(item.id)}
                            title="Eliminar"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                  )}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={visibleColumnCount + 1} className="h-64 text-center">
                  <div className="flex flex-col items-center justify-center text-muted-foreground gap-3">
                    <div className="p-4 rounded-full bg-muted/50">
                      {search ? <FilterX className="w-8 h-8" /> : <Package className="w-8 h-8" />}
                    </div>
                    <div>
                      <p className="font-medium text-lg">No se encontraron artículos</p>
                      <p className="text-sm mt-1 max-w-xs mx-auto">
                        {search 
                          ? "Prueba ajustando los términos de búsqueda o filtros."
                          : "Tu inventario está vacío. Agrega tu primer artículo para comenzar."}
                      </p>
                    </div>
                    {!search && canEdit && (
                      <Button 
                        variant="outline" 
                        onClick={() => setIsCreateOpen(true)}
                        className="mt-2"
                      >
                        Agregar tu primer artículo
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        {totalItems > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-border bg-muted/20 text-sm">
            <span className="text-muted-foreground">
              {fromItem}–{toItem} de {totalItems}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || isLoading}
              >
                <ChevronLeft className="w-4 h-4" />
                Anterior
              </Button>
              <span className="text-muted-foreground min-w-[4rem] text-center">
                Pág. {page} de {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || isLoading}
              >
                Siguiente
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog
        open={isCreateOpen}
        onOpenChange={(open) => {
          setIsCreateOpen(open);
          if (!open) setDuplicatingItem(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {loadingOverlay.open ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin shrink-0" />
                  Guardando...
                </>
              ) : duplicatingItem ? (
                "Duplicar artículo"
              ) : (
                "Agregar artículo al inventario"
              )}
            </DialogTitle>
            <DialogDescription>
              {loadingOverlay.open
                ? "Guardando en la base de datos."
                : duplicatingItem
                  ? "Revisa los datos copiados y cambia el código o nombre si lo deseas. Se generará un nuevo código al guardar si está vacío."
                  : "Ingresa los detalles del nuevo artículo a continuación."}
            </DialogDescription>
          </DialogHeader>
          <InventoryForm
            defaultValues={
              duplicatingItem
                ? inventoryItemToDuplicateCreateBody(duplicatingItem)
                : undefined
            }
            onSubmit={handleCreate}
            isSubmitting={createMutation.isPending}
            onCancel={() => {
              setIsCreateOpen(false);
              setDuplicatingItem(null);
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingItem} onOpenChange={(open) => !open && setEditingItem(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {loadingOverlay.open ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin shrink-0" />
                  Guardando...
                </>
              ) : (
                "Editar artículo"
              )}
            </DialogTitle>
            <DialogDescription>
              {loadingOverlay.open
                ? "Guardando cambios en la base de datos."
                : "Actualiza los detalles del artículo a continuación."}
            </DialogDescription>
          </DialogHeader>
          {editingItem && (
            <>
              <InventoryForm 
                defaultValues={{ 
                  ...editingItem, 
                  imageUrl: editingItem.imageUrl ?? undefined,
                  purchaseDate: editingItem.purchaseDate ?? undefined
                }}
                onSubmit={handleUpdate} 
                isSubmitting={updateMutation.isPending} 
                onCancel={() => setEditingItem(null)}
              />
              <div className="border-t pt-4 mt-4 space-y-2">
                <p className="text-sm font-medium flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Documentos vinculados
                </p>
                <input
                  ref={itemDocFileRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.odt"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    uploadDocMutation.mutate(
                      { file, itemId: editingItem.id, responsible: editingItem.responsible ?? undefined },
                      {
                        onSuccess: () => {
                          toast({ title: "Documento subido" });
                          e.target.value = "";
                        },
                        onError: (err) => toast({ variant: "destructive", title: "Error", description: err.message }),
                      }
                    );
                  }}
                />
                {canEdit && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => itemDocFileRef.current?.click()}
                    disabled={uploadDocMutation.isPending}
                  >
                    {uploadDocMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    Subir documento
                  </Button>
                )}
                {editingDocuments.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No hay documentos vinculados. Sube PDF, Word, Excel, etc.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {editingDocuments.map((doc) => (
                      <li key={doc.id} className="flex items-center justify-between gap-2 text-sm">
                        <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="truncate text-primary hover:underline">
                          {doc.originalName}
                        </a>
                        {canEdit && (
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-muted-foreground hover:text-foreground"
                              onClick={() => {
                                if (confirm("¿Desvincular este documento del artículo? Seguirá disponible en Empleados.")) {
                                  unlinkDocMutation.mutate(
                                    { documentId: doc.id, itemId: editingItem.id },
                                    {
                                      onSuccess: () => toast({ title: "Documento desvinculado" }),
                                      onError: (err) => toast({ variant: "destructive", title: "Error", description: err.message }),
                                    }
                                  );
                                }
                              }}
                              disabled={unlinkDocMutation.isPending}
                            >
                              Desvincular
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-destructive hover:text-destructive"
                              onClick={() => {
                                if (confirm("¿Eliminar este documento?")) {
                                  deleteDocMutation.mutate(doc.id);
                                }
                              }}
                            >
                              Eliminar
                            </Button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Image Viewer */}
      {viewingItem && (
        <ImageViewer
          images={
            viewerAttachments.length > 0
              ? viewerAttachments.map((a) => a.imageUrl)
              : viewingItem.imageUrl
                ? [viewingItem.imageUrl]
                : []
          }
          documents={viewerDocuments.map((d) => ({ id: d.id, fileUrl: d.fileUrl, originalName: d.originalName }))}
          open={!!viewingItem}
          onOpenChange={(open) => !open && setViewingItem(null)}
          initialIndex={0}
        />
      )}

      {/* View dialog for viewer role */}
      <ItemViewDialog
        item={viewItemDetails}
        open={!!viewItemDetails}
        onOpenChange={(open) => {
          if (!open) setViewItemDetails(null);
        }}
      />

      <ItemLabelDialog
        item={labelItem}
        open={!!labelItem}
        onOpenChange={(open) => !open && setLabelItem(null)}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingId} onOpenChange={(open) => !open && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará permanentemente el artículo de tu inventario.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {deleteMutation.isPending ? "Eliminando..." : "Eliminar artículo"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirmation */}
      <AlertDialog
        open={bulkDeleteOpen}
        onOpenChange={(open) => {
          if (!open) setBulkDeleteOpen(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar selección?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminarán {selectedIds.size} artículos seleccionados de tu inventario.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={bulkDeleting || loadingOverlay.open}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              {bulkDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {bulkDeleting ? "Eliminando..." : "Eliminar artículos"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Duplicate Confirmation */}
      <AlertDialog
        open={bulkDuplicateOpen}
        onOpenChange={(open) => {
          if (!open) setBulkDuplicateOpen(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Duplicar selección?</AlertDialogTitle>
            <AlertDialogDescription>
              Se crearán {selectedIds.size} artículos nuevos a partir de la selección. Se generará un código nuevo para cada uno.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDuplicate}
              disabled={bulkDuplicating || loadingOverlay.open}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {bulkDuplicating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {bulkDuplicating ? "Duplicando..." : "Duplicar artículos"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
