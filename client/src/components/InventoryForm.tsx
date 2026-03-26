import { useState, useMemo, useRef, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertInventoryItemSchema } from "@shared/schema";
import { z } from "zod";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { suggestCategory, SUGGESTED_CATEGORIES } from "@/lib/category-suggest";
import { categoryToDisplay, conditionToDisplay } from "@/lib/category-translate";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Trash2, Sparkles, Camera, ImagePlus, Pencil } from "lucide-react";
import { useAttachments, useDeleteAttachment, useSuggestCode, useFilterOptions } from "@/hooks/use-inventory";
import { useDebounce } from "@/hooks/use-debounce";
import { ImageViewer } from "@/components/ImageViewer";
import { CameraCaptureDialog } from "@/components/CameraCaptureDialog";
import { useAuth } from "@/hooks/use-auth";
import {
  useSharedNotes,
  useCreateSharedNote,
  useUpdateSharedNote,
  useDeleteSharedNote,
  type SharedNote,
} from "@/hooks/use-shared-notes";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

function thumbUrl(imageUrl: string | null | undefined): string | undefined {
  if (!imageUrl) return undefined;
  const base = imageUrl.replace(/\.[^.]+$/, "");
  const filename = base.split("/").pop();
  return `/uploads/thumbs/${filename}.webp`;
}

const FALLBACK_THUMB_PLACEHOLDER =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80">' +
      '<rect width="80" height="80" fill="#f1f5f9"/>' +
      '<path d="M16 56l14-14 10 10 10-12 14 16H16z" fill="#cbd5e1"/>' +
      '<circle cx="30" cy="28" r="6" fill="#cbd5e1"/>' +
      '<circle cx="64" cy="16" r="10" fill="#f59e0b"/>' +
      '<rect x="63" y="10" width="2" height="8" rx="1" fill="#ffffff"/>' +
      '<circle cx="64" cy="21" r="1.3" fill="#ffffff"/>' +
    "</svg>"
  );

function fallbackImageSrc(el: HTMLImageElement, originalUrl: string | null | undefined) {
  if (!el.dataset.fallbackTried) {
    el.dataset.fallbackTried = "original";
    if (originalUrl) {
      el.src = originalUrl;
      return;
    }
  }
  el.src = FALLBACK_THUMB_PLACEHOLDER;
}

// Extend schema to handle form string inputs that need coercion
const formSchema = insertInventoryItemSchema.extend({
  units: z.coerce.number().min(0),
  purchaseDate: z.string().optional().transform(val => val ? val : undefined), // Form input is string YYYY-MM-DD
});

type FormValues = z.infer<typeof formSchema>;

interface InventoryFormProps {
  defaultValues?: Partial<FormValues> & { id?: number; imageUrl?: string | null };
  onSubmit: (data: FormValues, imageFiles?: File[]) => Promise<void>;
  isSubmitting: boolean;
  onCancel: () => void;
}

const BASE_CATEGORIES = [...SUGGESTED_CATEGORIES, "Office Supplies"];

const CONDITIONS = [
  "New", "Excellent", "Good", "Fair", "Poor", "Damaged"
];

export function InventoryForm({ defaultValues, onSubmit, isSubmitting, onCancel }: InventoryFormProps) {
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const itemId = defaultValues?.id;

  const { user } = useAuth();
  const canEdit = (user?.role ?? "viewer") === "editor" || (user?.role ?? "viewer") === "admin";
  const { toast } = useToast();

  const { data: sharedNotes = [], isLoading: sharedNotesLoading } = useSharedNotes(itemId, { enabled: !!itemId });
  const createSharedNote = useCreateSharedNote(itemId);
  const updateSharedNote = useUpdateSharedNote();
  const deleteSharedNote = useDeleteSharedNote();

  const [newSharedTitle, setNewSharedTitle] = useState("");
  const [newSharedContent, setNewSharedContent] = useState("");
  const [editingSharedNote, setEditingSharedNote] = useState<SharedNote | null>(null);
  const [editingSharedTitle, setEditingSharedTitle] = useState("");
  const [editingSharedContent, setEditingSharedContent] = useState("");
  const [deletingSharedNote, setDeletingSharedNote] = useState<SharedNote | null>(null);

  const { data: attachments = [] } = useAttachments(itemId);
  const { data: filterOptions } = useFilterOptions();
  const deleteAttachment = useDeleteAttachment();
  const companies = filterOptions?.companies ?? [];
  const [viewingIndex, setViewingIndex] = useState<number | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      code: "",
      name: "",
      units: 0,
      condition: "New",
      category: "Other",
      responsible: "",
      companyId: defaultValues?.companyId ?? null,
      notes: defaultValues?.notes ?? "",
      serialNumber: "",
      size: "",
      usefulLife: "",
      ...defaultValues,
      // Ensure date is formatted for input type="date"
      purchaseDate: defaultValues?.purchaseDate ? String(defaultValues.purchaseDate).split('T')[0] : undefined,
    },
  });

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length) {
      setImageFiles((prev) => [...prev, ...files]);
      setPreviews((prev) => [...prev, ...files.map((f) => URL.createObjectURL(f))]);
    }
    e.target.value = "";
  };

  const handleCameraCapture = (file: File) => {
    setImageFiles((prev) => [...prev, file]);
    setPreviews((prev) => [...prev, URL.createObjectURL(file)]);
  };

  const removeNewFile = (idx: number) => {
    setImageFiles((prev) => prev.filter((_, i) => i !== idx));
    URL.revokeObjectURL(previews[idx]);
    setPreviews((prev) => prev.filter((_, i) => i !== idx));
  };

  const watchedName = form.watch("name") ?? "";
  const watchedCode = form.watch("code") ?? "";
  const watchedCategory = form.watch("category") ?? "Other";
  const debouncedName = useDebounce(watchedName, 500);
  const debouncedCategory = useDebounce(watchedCategory, 300);
  const isCreateMode = !itemId;
  const { data: suggestedCode } = useSuggestCode(debouncedCategory, debouncedName, isCreateMode);

  useEffect(() => {
    if (isCreateMode && suggestedCode) {
      form.setValue("code", suggestedCode);
    }
  }, [isCreateMode, suggestedCode, form]);

  const suggestedCategory = useMemo(
    () => suggestCategory(watchedName, watchedCode),
    [watchedName, watchedCode]
  );

  const handleSubmit = form.handleSubmit(async (data) => {
    await onSubmit(data, imageFiles.length ? imageFiles : undefined);
  });

  const submitNewSharedNote = () => {
    if (!itemId) return;
    const title = newSharedTitle.trim();
    const content = newSharedContent.trim();
    if (!title || !content) return;

    createSharedNote.mutate(
      { title, content },
      {
        onSuccess: () => {
          setNewSharedTitle("");
          setNewSharedContent("");
          toast({ title: "Nota compartida creada" });
        },
        onError: (err: any) => toast({ variant: "destructive", title: "Error", description: err?.message || "No se pudo crear" }),
      },
    );
  };

  const submitEditSharedNote = () => {
    if (!editingSharedNote) return;
    const title = editingSharedTitle.trim();
    const content = editingSharedContent.trim();
    if (!title || !content) return;

    updateSharedNote.mutate(
      { id: editingSharedNote.id, title, content },
      {
        onSuccess: () => {
          setEditingSharedNote(null);
          toast({ title: "Nota compartida actualizada" });
        },
        onError: (err: any) =>
          toast({ variant: "destructive", title: "Error", description: err?.message || "No se pudo actualizar" }),
      },
    );
  };

  const confirmDeleteSharedNote = () => {
    if (!deletingSharedNote) return;
    deleteSharedNote.mutate(deletingSharedNote.id, {
      onSuccess: () => {
        setDeletingSharedNote(null);
        toast({ title: "Nota compartida eliminada" });
      },
      onError: () => toast({ variant: "destructive", title: "Error al eliminar" }),
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="code"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Código</FormLabel>
                <FormControl>
                  <Input placeholder="Dejar vacío para asignar automáticamente (ej. MD00001)" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nombre / Descripción</FormLabel>
                <FormControl>
                  <Input placeholder="Silla de oficina" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="category"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Categoría</FormLabel>
                <div className="flex items-center gap-2">
                  <Select value={field.value || "Other"} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Seleccionar categoría" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Array.from(new Set([...(field.value && !BASE_CATEGORIES.includes(field.value) ? [field.value] : []), ...BASE_CATEGORIES])).map((c) => (
                        <SelectItem key={c} value={c}>{categoryToDisplay(c)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {suggestedCategory && suggestedCategory !== (field.value || "Other") && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0 text-xs gap-1"
                      onClick={() => field.onChange(suggestedCategory)}
                      title={`Usar sugerida: ${categoryToDisplay(suggestedCategory)}`}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      {categoryToDisplay(suggestedCategory)}
                    </Button>
                  )}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="units"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Unidades</FormLabel>
                <FormControl>
                  <Input type="number" min="0" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="condition"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Condición</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value || "New"}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar condición" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {CONDITIONS.map((c) => (
                      <SelectItem key={c} value={c}>{conditionToDisplay(c)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="serialNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Número de serie</FormLabel>
                <FormControl>
                  <Input placeholder="SN-123456" {...field} value={field.value || ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="size"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Talla / Tamaño</FormLabel>
                <FormControl>
                  <Input placeholder="Mediano / 15 pulgadas" {...field} value={field.value || ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="responsible"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Persona responsable</FormLabel>
                <FormControl>
                  <Input placeholder="Nombre del responsable" {...field} value={field.value || ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="companyId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Empresa</FormLabel>
                <Select
                  value={field.value == null || field.value === "" ? "none" : String(field.value)}
                  onValueChange={(v) => field.onChange(v === "none" ? null : Number(v))}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Sin asignar" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="none">Sin asignar</SelectItem>
                    {companies.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="purchaseDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Fecha de compra</FormLabel>
                <FormControl>
                  <Input type="date" {...field} value={field.value || ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="usefulLife"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Vida útil</FormLabel>
                <FormControl>
                  <Input placeholder="5 años" {...field} value={field.value || ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem className="md:col-span-2">
                <FormLabel>Observaciones / Notas</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Comentarios internos, mantenimiento, estado, etc."
                    className="min-h-[80px]"
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {canEdit && (
          <div className="md:col-span-2 border border-border rounded-lg p-4 bg-muted/20 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">Notas compartidas</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Solo visible para editor/admin. El viewer no la ve.
                </p>
              </div>
            </div>

            {!itemId ? (
              <p className="text-sm text-muted-foreground">
                Guarda el artículo primero para agregar notas compartidas.
              </p>
            ) : sharedNotesLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Cargando notas compartidas...
              </div>
            ) : sharedNotes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aún no hay notas compartidas para este artículo.</p>
            ) : (
              <div className="space-y-3">
                {sharedNotes.map((n) => {
                  const createdAt = n.createdAt ? new Date(n.createdAt) : null;
                  const updatedAt = n.updatedAt ? new Date(n.updatedAt) : null;
                  return (
                    <div key={n.id} className="border border-border/60 rounded-md p-3 bg-card">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold truncate">{n.title}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            por {n.authorUsername ?? "—"}
                            {createdAt && <> · {format(createdAt, "dd/MM/yyyy HH:mm")}</>}
                            {updatedAt && <> · actualizada {format(updatedAt, "dd/MM/yyyy HH:mm")}</>}
                          </p>
                        </div>

                        {canEdit && (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="gap-1.5"
                              onClick={() => {
                                setEditingSharedNote(n);
                                setEditingSharedTitle(n.title);
                                setEditingSharedContent(n.content);
                              }}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              Editar
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="gap-1.5 text-destructive hover:text-destructive"
                              onClick={() => setDeletingSharedNote(n)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Eliminar
                            </Button>
                          </div>
                        )}
                      </div>

                      <div className="mt-2">
                        <p className="whitespace-pre-wrap text-sm">{n.content}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {canEdit && itemId && (
              <div className="pt-3 border-t border-border/60 space-y-3">
                <p className="text-sm font-medium">Crear nota compartida</p>
                <div className="space-y-2">
                  <Label htmlFor="shared-note-title">Título</Label>
                  <Input
                    id="shared-note-title"
                    value={newSharedTitle}
                    onChange={(e) => setNewSharedTitle(e.target.value)}
                    placeholder="Ej. Mantenimiento"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="shared-note-content">Contenido</Label>
                  <Textarea
                    id="shared-note-content"
                    value={newSharedContent}
                    onChange={(e) => setNewSharedContent(e.target.value)}
                    placeholder="Escribe aquí..."
                    className="min-h-[90px]"
                  />
                </div>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    onClick={submitNewSharedNote}
                    disabled={createSharedNote.isPending || !newSharedTitle.trim() || !newSharedContent.trim()}
                    className="gap-2"
                  >
                    {createSharedNote.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                    Crear
                  </Button>
                </div>
              </div>
            )}
          </div>
          )}

          <Dialog
            open={editingSharedNote != null}
            onOpenChange={(open) => {
              if (!open) setEditingSharedNote(null);
            }}
          >
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Editar nota compartida</DialogTitle>
                <DialogDescription>Actualiza el contenido y/o título.</DialogDescription>
              </DialogHeader>

              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="edit-shared-note-title">Título</Label>
                  <Input
                    id="edit-shared-note-title"
                    value={editingSharedTitle}
                    onChange={(e) => setEditingSharedTitle(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-shared-note-content">Contenido</Label>
                  <Textarea
                    id="edit-shared-note-content"
                    value={editingSharedContent}
                    onChange={(e) => setEditingSharedContent(e.target.value)}
                    className="min-h-[100px]"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setEditingSharedNote(null)}>
                  Cancelar
                </Button>
                <Button
                  type="button"
                  onClick={submitEditSharedNote}
                  disabled={
                    updateSharedNote.isPending ||
                    !editingSharedTitle.trim() ||
                    !editingSharedContent.trim()
                  }
                  className="gap-2"
                >
                  {updateSharedNote.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  Guardar
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <AlertDialog
            open={deletingSharedNote != null}
            onOpenChange={(open) => {
              if (!open) setDeletingSharedNote(null);
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Eliminar nota compartida</AlertDialogTitle>
                <AlertDialogDescription>
                  ¿Seguro que quieres eliminar &quot;{deletingSharedNote?.title}&quot;? Esta acción no se puede deshacer.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={confirmDeleteSharedNote}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Eliminar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <FormItem className="md:col-span-2">
            <FormLabel>Imágenes / Fotos</FormLabel>
            <div className="space-y-3">
              <div className="flex flex-wrap gap-3">
                {attachments.map((a, idx) => (
                  <div key={a.id} className="relative group">
                    <button
                      type="button"
                      onClick={() => setViewingIndex(idx)}
                      className="w-20 h-20 rounded-lg border border-border overflow-hidden bg-muted shrink-0 cursor-pointer hover:ring-2 hover:ring-primary/50"
                    >
                      <img
                        src={thumbUrl(a.imageUrl) ?? a.imageUrl ?? ""}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover"
                        onError={(e) => fallbackImageSrc(e.currentTarget, a.imageUrl)}
                      />
                    </button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute -top-2 -right-2 h-6 w-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10"
                      onClick={(e) => {
                        e.stopPropagation();
                        itemId && deleteAttachment.mutate({ itemId, attachmentId: a.id });
                      }}
                      disabled={deleteAttachment.isPending}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                {previews.map((url, idx) => (
                  <div key={idx} className="relative group">
                    <button
                      type="button"
                      onClick={() => setViewingIndex(attachments.length + idx)}
                      className="w-20 h-20 rounded-lg border border-dashed border-primary overflow-hidden bg-muted shrink-0 cursor-pointer hover:ring-2 hover:ring-primary/50"
                    >
                      <img src={url} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                    </button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute -top-2 -right-2 h-6 w-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeNewFile(idx);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setCameraOpen(true)}
                    className="gap-2"
                  >
                    <Camera className="h-4 w-4" />
                    Tomar foto
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => galleryInputRef.current?.click()}
                    className="gap-2"
                  >
                    <ImagePlus className="h-4 w-4" />
                    Elegir de galería
                  </Button>
                </div>
                <CameraCaptureDialog
                  open={cameraOpen}
                  onOpenChange={setCameraOpen}
                  onCapture={handleCameraCapture}
                />
                <Input
                  ref={galleryInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="hidden"
                  multiple
                />
                <p className="text-xs text-muted-foreground">Puedes seleccionar varios archivos. JPG, PNG, GIF o WebP. Máx. 5MB cada uno. Haz clic en una imagen para previsualizar.</p>
              </div>
            </div>
            <ImageViewer
              images={[...attachments.map((a) => a.imageUrl), ...previews]}
              open={viewingIndex !== null}
              onOpenChange={(open) => !open && setViewingIndex(null)}
              initialIndex={viewingIndex ?? 0}
            />
          </FormItem>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-border/50">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isSubmitting} className="bg-primary hover:bg-primary/90">
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting ? "Guardando..." : "Guardar artículo"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
