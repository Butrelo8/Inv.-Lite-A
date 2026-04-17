import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { z } from "zod";
import { insertInventoryItemSchema } from "@shared/schema";
import { toast } from "@/hooks/use-toast";

// Types derived directly from schema/api
export type InventoryListResponse = z.infer<typeof api.inventory.list.responses[200]>;
export type InventoryItem = InventoryListResponse["items"][number];
export type InsertInventoryItem = z.infer<typeof insertInventoryItemSchema>;

export interface InventoryFilters {
  search?: string;
  category?: string;
  responsible?: string;
  companyId?: number;
  siteId?: number;
  dateFrom?: string;
  dateTo?: string;
  addedAfter?: string;
  modifiedAfter?: string;
  limit?: number;
  offset?: number;
}

export function useInventory(filters?: InventoryFilters | string, options?: { enabled?: boolean }) {
  const f = typeof filters === "string" ? { search: filters } : filters ?? {};
  const limit = f.limit ?? 50;
  const offset = f.offset ?? 0;
  return useQuery({
    queryKey: [api.inventory.list.path, f.search, f.category, f.responsible, f.companyId, f.siteId, f.dateFrom, f.dateTo, f.addedAfter, f.modifiedAfter, limit, offset],
    queryFn: async () => {
      const url = new URL(api.inventory.list.path, window.location.origin);
      if (f.search) url.searchParams.set("search", f.search);
      if (f.category) url.searchParams.set("category", f.category);
      if (f.responsible) url.searchParams.set("responsible", f.responsible);
      if (f.companyId != null) url.searchParams.set("companyId", String(f.companyId));
      if (f.siteId != null) url.searchParams.set("siteId", String(f.siteId));
      if (f.dateFrom) url.searchParams.set("dateFrom", f.dateFrom);
      if (f.dateTo) url.searchParams.set("dateTo", f.dateTo);
      if (f.addedAfter) url.searchParams.set("addedAfter", f.addedAfter);
      if (f.modifiedAfter) url.searchParams.set("modifiedAfter", f.modifiedAfter);
      url.searchParams.set("limit", String(limit));
      url.searchParams.set("offset", String(offset));
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch inventory");
      return api.inventory.list.responses[200].parse(await res.json());
    },
    enabled: options?.enabled !== false,
  });
}

export function useSuggestCode(category: string, name: string, enabled: boolean, siteId?: number) {
  return useQuery({
    queryKey: ["/api/inventory/suggest-code", category, name, siteId],
    queryFn: async () => {
      const url = new URL("/api/inventory/suggest-code", window.location.origin);
      url.searchParams.set("category", category);
      url.searchParams.set("name", name);
      if (siteId != null) url.searchParams.set("siteId", String(siteId));
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to suggest code");
      const data = (await res.json()) as { code: string };
      return data.code;
    },
    enabled: enabled && (!!name.trim() || !!category),
  });
}

export function useFilterOptions(siteId?: number) {
  return useQuery({
    queryKey: ["/api/inventory/filters", siteId],
    queryFn: async () => {
      const url = new URL("/api/inventory/filters", window.location.origin);
      if (siteId != null) url.searchParams.set("siteId", String(siteId));
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch filters");
      return res.json() as Promise<{ categories: string[]; responsible: string[]; companies: { id: number; name: string }[] }>;
    },
  });
}

export interface ResponsibleWithCount {
  name: string;
  count: number;
}

export function useResponsibleWithCounts() {
  return useQuery({
    queryKey: ["/api/responsible"],
    queryFn: async () => {
      const res = await fetch("/api/responsible", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch responsible list");
      return res.json() as Promise<ResponsibleWithCount[]>;
    },
  });
}

export interface EmployeeDocument {
  id: number;
  responsible: string | null;
  itemId: number | null;
  fileUrl: string;
  originalName: string;
  mimeType: string | null;
  documentType: string | null;
  expiresAt: string | null;
  createdAt: string;
  userId: number | null;
}

export function useItemDocuments(itemId: number | undefined, enabled = true) {
  return useQuery({
    queryKey: ["/api/inventory", itemId, "documents"],
    queryFn: async () => {
      const res = await fetch(`/api/inventory/${itemId}/documents`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch documents");
      return res.json() as Promise<EmployeeDocument[]>;
    },
    enabled: enabled && !!itemId,
  });
}

export function useEmployeeDocuments(responsible?: string, enabled = true, documentType?: string) {
  return useQuery({
    queryKey: ["/api/employees/documents", responsible, documentType],
    queryFn: async () => {
      const url = new URL("/api/employees/documents", window.location.origin);
      if (responsible) url.searchParams.set("responsible", responsible);
      if (documentType) url.searchParams.set("documentType", documentType);
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch documents");
      return res.json() as Promise<EmployeeDocument[]>;
    },
    enabled,
  });
}

export function useDocumentStatus(documentType = "Contract", expiresBefore?: string) {
  return useQuery({
    queryKey: ["/api/employees/document-status", documentType, expiresBefore],
    queryFn: async () => {
      const url = new URL("/api/employees/document-status", window.location.origin);
      url.searchParams.set("documentType", documentType);
      if (expiresBefore) url.searchParams.set("expiresBefore", expiresBefore);
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch document status");
      return res.json() as Promise<{ responsiblesWithout: string[]; responsiblesWithExpired: string[] }>;
    },
  });
}

export function useDocumentVersions(responsible: string | null, documentType: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["/api/employees/documents/versions", responsible, documentType],
    queryFn: async () => {
      const url = new URL("/api/employees/documents/versions", window.location.origin);
      url.searchParams.set("responsible", responsible!);
      url.searchParams.set("documentType", documentType!);
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch versions");
      return res.json() as Promise<EmployeeDocument[]>;
    },
    enabled: enabled && !!responsible && !!documentType,
  });
}

export function useUploadEmployeeDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, responsible, itemId, documentType, expiresAt }: { file: File; responsible?: string; itemId?: number; documentType?: string | null; expiresAt?: string | null }) => {
      const form = new FormData();
      form.append("file", file);
      if (responsible) form.append("responsible", responsible);
      if (itemId !== undefined) form.append("itemId", String(itemId));
      if (documentType !== undefined && documentType !== null) form.append("documentType", documentType);
      if (expiresAt !== undefined && expiresAt !== null) form.append("expiresAt", expiresAt);
      const res = await fetch("/api/employees/documents", {
        method: "POST",
        body: form,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message || "Upload failed");
      }
      return res.json() as Promise<EmployeeDocument>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees/documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/employees/document-status"] });
      if (data.itemId != null) {
        queryClient.invalidateQueries({ queryKey: ["/api/inventory", data.itemId, "documents"] });
      }
    },
  });
}

export function useLinkDocumentToItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ documentId, itemId }: { documentId: number; itemId: number }) => {
      const res = await fetch(`/api/employees/documents/${documentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId }),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message || "Link failed");
      }
      return res.json() as Promise<EmployeeDocument>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees/documents"] });
      if (data.itemId != null) {
        queryClient.invalidateQueries({ queryKey: ["/api/inventory", data.itemId, "documents"] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
    },
  });
}

export function useUpdateEmployeeDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, documentType, expiresAt }: { id: number; documentType?: string | null; expiresAt?: string | null }) => {
      const body: { documentType?: string | null; expiresAt?: string | null } = {};
      if (documentType !== undefined) body.documentType = documentType;
      if (expiresAt !== undefined) body.expiresAt = expiresAt;
      const res = await fetch(`/api/employees/documents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message || "Update failed");
      }
      return res.json() as Promise<EmployeeDocument>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees/documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/employees/document-status"] });
      if (data.itemId != null) {
        queryClient.invalidateQueries({ queryKey: ["/api/inventory", data.itemId, "documents"] });
      }
    },
  });
}

export function useUnlinkDocumentFromItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ documentId }: { documentId: number; itemId: number }) => {
      const res = await fetch(`/api/employees/documents/${documentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: null }),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message || "Unlink failed");
      }
      return res.json() as Promise<EmployeeDocument>;
    },
    onSuccess: (_data, { itemId }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees/documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      if (itemId != null) {
        queryClient.invalidateQueries({ queryKey: ["/api/inventory", itemId, "documents"] });
      }
    },
  });
}

export function useDeleteEmployeeDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/employees/documents/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Delete failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees/documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/employees/document-status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
    },
  });
}

export function useInventoryItem(id: number) {
  return useQuery({
    queryKey: [api.inventory.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.inventory.get.path, { id });
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch item");
      return api.inventory.get.responses[200].parse(await res.json());
    },
    enabled: !!id,
  });
}

export function useCreateInventoryItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: InsertInventoryItem) => {
      // Ensure correct types for numbers/dates before sending
      const res = await fetch(api.inventory.create.path, {
        method: api.inventory.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      
      if (!res.ok) {
        if (res.status === 400) {
          const error = api.inventory.create.responses[400].parse(await res.json());
          throw new Error(error.message);
        }
        throw new Error("Failed to create item");
      }
      return api.inventory.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.inventory.list.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/filters"] });
    },
  });
}

export function useUpdateInventoryItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: number } & Partial<InsertInventoryItem>) => {
      const url = buildUrl(api.inventory.update.path, { id });
      const res = await fetch(url, {
        method: api.inventory.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
        credentials: "include",
      });
      
      if (!res.ok) {
        if (res.status === 400) {
          const error = api.inventory.update.responses[400].parse(await res.json());
          throw new Error(error.message);
        }
        throw new Error("Failed to update item");
      }
      return api.inventory.update.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.inventory.list.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/filters"] });
    },
  });
}

export function useDeleteInventoryItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.inventory.delete.path, { id });
      const res = await fetch(url, {
        method: api.inventory.delete.method,
        credentials: "include"
      });
      
      if (!res.ok && res.status !== 404) {
        throw new Error("Failed to delete item");
      }
    },
    onMutate: () => {
      return toast({ title: "Eliminando...", description: "Eliminando artículo." });
    },
    onSuccess: (_data, _variables, context) => {
      context?.update({ title: "Éxito", description: "Artículo eliminado correctamente." });
      queryClient.invalidateQueries({ queryKey: [api.inventory.list.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/filters"] });
    },
    onError: (err, _variables, context) => {
      context?.update({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function useAttachments(itemId: number | undefined) {
  return useQuery({
    queryKey: ["/api/inventory", itemId, "attachments"],
    queryFn: async () => {
      if (!itemId) return [];
      const res = await fetch(`/api/inventory/${itemId}/attachments`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch attachments");
      return res.json() as Promise<{ id: number; imageUrl: string }[]>;
    },
    enabled: !!itemId,
  });
}

export function useUploadInventoryImage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, file }: { id: number; file: File }) => {
      const formData = new FormData();
      formData.append("image", file);
      const res = await fetch(`/api/inventory/${id}/image`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to upload image");
      }
      return res.json();
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: [api.inventory.list.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory", id, "attachments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/history"] });
    },
  });
}

export function useDeleteAttachment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId, attachmentId }: { itemId: number; attachmentId: number }) => {
      const res = await fetch(`/api/inventory/${itemId}/attachments/${attachmentId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok && res.status !== 204) throw new Error("Failed to delete attachment");
    },
    onSuccess: (_, { itemId }) => {
      queryClient.invalidateQueries({ queryKey: [api.inventory.list.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory", itemId, "attachments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/history"] });
    },
  });
}

export function useExportInventory() {
  return () => {
    window.location.href = "/api/inventory/export";
  };
}

export function useImportInventory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/inventory/import", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Import failed");
      }
      return res.json();
    },
    onMutate: () => {
      return toast({ title: "Importando...", description: "Procesando archivo." });
    },
    onSuccess: (_data, _variables, context) => {
      context?.dismiss();
      queryClient.invalidateQueries({ queryKey: [api.inventory.list.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/filters"] });
    },
    onError: (err, _variables, context) => {
      context?.update({ title: "Error de importación", description: err.message, variant: "destructive" });
    },
  });
}
