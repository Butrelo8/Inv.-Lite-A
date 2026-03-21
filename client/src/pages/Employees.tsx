import { useRef, useState } from "react";
import { Link } from "wouter";
import {
  useResponsibleWithCounts,
  useEmployeeDocuments,
  useUploadEmployeeDocument,
  useUpdateEmployeeDocument,
  useDeleteEmployeeDocument,
  useLinkDocumentToItem,
  useInventory,
  useDocumentStatus,
  useDocumentVersions,
  type EmployeeDocument,
} from "@/hooks/use-inventory";
import { EmployeeQuickViewDialog } from "@/components/EmployeeQuickViewDialog";
import { DocumentPreviewModal } from "@/components/DocumentPreviewModal";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { Users, Loader2, List, FileText, Upload, Trash2, Link2, User, Eye, History, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

const ACCEPT_DOCS = ".pdf,.doc,.docx,.xls,.xlsx,.txt,.odt";

const DOCUMENT_TYPES = ["Contract", "Identification", "Certifications", "Other"] as const;
const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  Contract: "Contrato",
  Identification: "Identificación",
  Certifications: "Certificaciones",
  Other: "Otro",
};
const canPreview = (mime: string | null) => mime === "application/pdf" || (mime != null && mime.startsWith("image/"));

export default function Employees() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [documentsOpen, setDocumentsOpen] = useState(false);
  const [documentsResponsible, setDocumentsResponsible] = useState<string | null>(null);
  const [documentTypeFilter, setDocumentTypeFilter] = useState<string>("");
  const [deletingDocId, setDeletingDocId] = useState<number | null>(null);
  const [linkingDocId, setLinkingDocId] = useState<number | null>(null);
  const [linkItemId, setLinkItemId] = useState<string>("");
  const [quickViewResponsible, setQuickViewResponsible] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<{ fileUrl: string; mimeType: string | null; originalName: string } | null>(null);
  const [uploadDocumentType, setUploadDocumentType] = useState<string>("Other");
  const [uploadExpiresAt, setUploadExpiresAt] = useState<string>("");
  const [historialOpen, setHistorialOpen] = useState<{ responsible: string; documentType: string } | null>(null);
  const [editingDoc, setEditingDoc] = useState<EmployeeDocument | null>(null);
  const [editDocType, setEditDocType] = useState<string>("Other");
  const [editDocExpiresAt, setEditDocExpiresAt] = useState<string>("");

  const { data: list = [], isLoading } = useResponsibleWithCounts();
  const { data: linkData } = useInventory(
    documentsResponsible ? { responsible: documentsResponsible, limit: 500 } : undefined,
    { enabled: (linkingDocId != null || documentsOpen) && !!documentsResponsible }
  );
  const itemsForLink = linkData?.items ?? [];
  const { data: documents = [], isLoading: docsLoading } = useEmployeeDocuments(
    documentsResponsible ?? undefined,
    documentsOpen,
    documentTypeFilter || undefined
  );
  const today = new Date().toISOString().slice(0, 10);
  const { data: documentStatus } = useDocumentStatus("Contract", today);
  const { data: versionList = [] } = useDocumentVersions(
    historialOpen?.responsible ?? null,
    historialOpen?.documentType ?? null,
    !!historialOpen
  );
  const uploadMutation = useUploadEmployeeDocument();
  const updateDocMutation = useUpdateEmployeeDocument();
  const deleteMutation = useDeleteEmployeeDocument();
  const linkMutation = useLinkDocumentToItem();
  const { toast } = useToast();

  const openEditDoc = (doc: EmployeeDocument) => {
    setEditingDoc(doc);
    setEditDocType(doc.documentType ?? "Other");
    setEditDocExpiresAt(doc.expiresAt ? String(doc.expiresAt).slice(0, 10) : "");
  };

  const saveEditDoc = () => {
    if (!editingDoc) return;
    updateDocMutation.mutate(
      {
        id: editingDoc.id,
        documentType: editDocType || null,
        expiresAt: editDocExpiresAt || null,
      },
      {
        onSuccess: () => {
          toast({ title: "Documento actualizado" });
          setEditingDoc(null);
        },
        onError: (err) => toast({ variant: "destructive", title: "Error", description: err.message }),
      }
    );
  };

  const handleLinkToItem = () => {
    const itemId = linkItemId ? Number(linkItemId) : null;
    if (linkingDocId == null || !itemId) return;
    linkMutation.mutate(
      { documentId: linkingDocId, itemId },
      {
        onSuccess: () => {
          toast({ title: "Documento vinculado al artículo" });
          setLinkingDocId(null);
          setLinkItemId("");
        },
        onError: (err) => toast({ variant: "destructive", title: "Error", description: err.message }),
      }
    );
  };

  const openDocumentsFor = (responsible: string) => {
    setDocumentsResponsible(responsible);
    setDocumentsOpen(true);
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadMutation.mutate(
      {
        file,
        responsible: documentsResponsible ?? undefined,
        documentType: uploadDocumentType || null,
        expiresAt: uploadExpiresAt || null,
      },
      {
        onSuccess: () => {
          toast({ title: "Documento subido", description: file.name });
          e.target.value = "";
        },
        onError: (err) => {
          toast({ variant: "destructive", title: "Error", description: err.message });
        },
      }
    );
  };

  const confirmDelete = (id: number) => {
    setDeletingDocId(id);
  };

  const doDelete = () => {
    if (deletingDocId == null) return;
    deleteMutation.mutate(deletingDocId, {
      onSettled: () => setDeletingDocId(null),
      onSuccess: () => toast({ title: "Documento eliminado" }),
      onError: () => toast({ variant: "destructive", title: "Error al eliminar" }),
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Personal / Personas responsables</h2>
        <p className="text-muted-foreground mt-1">
          Personas con artículos asignados en el inventario (misma información que el gráfico en Resumen)
        </p>
      </div>

      {documentStatus && (documentStatus.responsiblesWithout.length > 0 || documentStatus.responsiblesWithExpired.length > 0) && (
        <Card className="border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Personas sin contrato actualizado</CardTitle>
            <CardDescription>
              {documentStatus.responsiblesWithout.length > 0 && `${documentStatus.responsiblesWithout.length} sin ningún contrato. `}
              {documentStatus.responsiblesWithExpired.length > 0 && `${documentStatus.responsiblesWithExpired.length} con contrato vencido. `}
              Haz clic para abrir documentos o resumen.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {documentStatus.responsiblesWithout.map((name) => (
                <Button
                  key={name}
                  variant="outline"
                  size="sm"
                  onClick={() => { setQuickViewResponsible(name); setDocumentsResponsible(name); setDocumentsOpen(true); }}
                  className="text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-800"
                >
                  {name}
                </Button>
              ))}
              {documentStatus.responsiblesWithExpired.map((name) => (
                <Button
                  key={`exp-${name}`}
                  variant="outline"
                  size="sm"
                  onClick={() => { setQuickViewResponsible(name); setDocumentsResponsible(name); setDocumentsOpen(true); }}
                  className="text-amber-700 dark:text-amber-300 border-amber-400 dark:border-amber-700"
                >
                  {name} (vencido)
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Listado por persona responsable
          </CardTitle>
          <CardDescription>
            {list.length} persona(s) con al menos un artículo asignado. Haz clic en un nombre para ver el resumen (documentos e ítems). Usa &quot;Ver artículos&quot; o &quot;Documentos&quot; para más acciones.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {list.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              Aún no hay personas responsables con artículos. Asigna un responsable al crear o editar artículos en el inventario.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[200px]">Persona responsable</TableHead>
                    <TableHead className="w-[120px] text-right">Artículos</TableHead>
                    <TableHead className="text-right min-w-[200px]">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((row) => (
                    <TableRow key={row.name}>
                      <TableCell className="font-medium">
                        <button
                          type="button"
                          onClick={() => setQuickViewResponsible(row.name)}
                          className="text-left hover:underline hover:text-primary focus:outline-none focus:underline focus:text-primary cursor-pointer"
                        >
                          {row.name}
                        </button>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5"
                            onClick={() => setQuickViewResponsible(row.name)}
                          >
                            <User className="w-3.5 h-3.5" />
                            Resumen
                          </Button>
                          <Link href={`/inventory?responsible=${encodeURIComponent(row.name)}`}>
                            <Button variant="outline" size="sm" className="gap-1.5">
                              <List className="w-3.5 h-3.5" />
                              Ver artículos
                            </Button>
                          </Link>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5"
                            onClick={() => openDocumentsFor(row.name)}
                          >
                            <FileText className="w-3.5 h-3.5" />
                            Documentos
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={documentsOpen}
        onOpenChange={(open) => {
          setDocumentsOpen(open);
          if (!open) setDocumentsResponsible(null);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Documentos{documentsResponsible ? ` — ${documentsResponsible}` : ""}
            </DialogTitle>
            <DialogDescription>
              {documentsResponsible
                ? `Sube PDF, Word, Excel y archivos de texto para ${documentsResponsible}.`
                : "Sube PDF, Word, Excel y archivos de texto."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="flex flex-wrap items-end gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPT_DOCS}
                className="hidden"
                onChange={handleUpload}
              />
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Tipo de documento</label>
                <Select value={uploadDocumentType} onValueChange={setUploadDocumentType}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DOCUMENT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{DOCUMENT_TYPE_LABELS[t] ?? t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Vencimiento (opcional)</label>
                <input
                  type="date"
                  value={uploadExpiresAt}
                  onChange={(e) => setUploadExpiresAt(e.target.value)}
                  className="flex h-9 w-[140px] rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                />
              </div>
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadMutation.isPending}
                className="gap-2"
              >
                {uploadMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                Subir documento
              </Button>
            </div>
            {documents.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Filtrar por tipo:</span>
                <Select value={documentTypeFilter || "all"} onValueChange={(v) => setDocumentTypeFilter(v === "all" ? "" : v)}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {DOCUMENT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{DOCUMENT_TYPE_LABELS[t] ?? t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {docsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : documents.length === 0 ? (
              <p className="text-muted-foreground text-center py-6">
                Aún no hay documentos para esta persona. Usa el botón para subir PDF, Word, Excel, etc.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[200px]">Nombre</TableHead>
                    <TableHead className="min-w-[100px]">Tipo</TableHead>
                    <TableHead className="min-w-[90px]">Vencimiento</TableHead>
                    <TableHead className="min-w-[140px]">Vinculado a</TableHead>
                    <TableHead className="min-w-[100px]">Fecha</TableHead>
                    <TableHead className="min-w-[300px] text-right">Acciones</TableHead>
                  </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documents.map((doc) => {
                      const linkedItem = doc.itemId != null ? itemsForLink.find((i) => i.id === doc.itemId) : null;
                      const versionsCount = doc.documentType ? documents.filter((d) => d.documentType === doc.documentType).length : 0;
                      return (
                      <TableRow key={doc.id}>
                        <TableCell className="font-medium">{doc.originalName}</TableCell>
                        <TableCell>
                          {doc.documentType ? (
                            <Badge variant="secondary" className="font-normal">{DOCUMENT_TYPE_LABELS[doc.documentType] ?? doc.documentType}</Badge>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {doc.expiresAt ? format(new Date(doc.expiresAt), "dd/MM/yyyy") : "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {doc.itemId == null ? (
                            "—"
                          ) : linkedItem ? (
                            <Link href={`/inventory?responsible=${encodeURIComponent(documentsResponsible ?? "")}`} className="text-primary hover:underline">
                              {linkedItem.code} — {linkedItem.name}
                            </Link>
                          ) : (
                            <span title={`ID ${doc.itemId}`}>Artículo #{doc.itemId}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {format(new Date(doc.createdAt), "dd/MM/yyyy HH:mm")}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-wrap justify-end gap-1">
                            {canPreview(doc.mimeType) && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="gap-1.5"
                                onClick={() => setPreviewDoc({ fileUrl: doc.fileUrl, mimeType: doc.mimeType, originalName: doc.originalName })}
                                title="Vista previa"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                Vista previa
                              </Button>
                            )}
                            <a
                              href={doc.fileUrl.startsWith("http") ? doc.fileUrl : `${window.location.origin}${doc.fileUrl}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center"
                            >
                              <Button variant="ghost" size="sm" className="gap-1.5">
                                Descargar
                              </Button>
                            </a>
                            {doc.documentType && versionsCount > 1 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="gap-1.5"
                                onClick={() => setHistorialOpen({ responsible: documentsResponsible ?? "", documentType: doc.documentType! })}
                                title="Ver historial de versiones"
                              >
                                <History className="w-3.5 h-3.5" />
                                Historial
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-1.5"
                              onClick={() => openEditDoc(doc)}
                              title="Editar tipo y vencimiento"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              Editar
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-1.5"
                              onClick={() => setLinkingDocId(doc.id)}
                              title="Vincular a un artículo del inventario"
                            >
                              <Link2 className="w-3.5 h-3.5" />
                              Vincular
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-1.5 text-destructive hover:text-destructive"
                              onClick={() => confirmDelete(doc.id)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Eliminar
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!editingDoc}
        onOpenChange={(open) => !open && setEditingDoc(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar tipo y vencimiento</DialogTitle>
            <DialogDescription>
              {editingDoc && editingDoc.originalName}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Tipo de documento</label>
              <Select value={editDocType} onValueChange={setEditDocType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{DOCUMENT_TYPE_LABELS[t] ?? t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Vencimiento (opcional)</label>
              <input
                type="date"
                value={editDocExpiresAt}
                onChange={(e) => setEditDocExpiresAt(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditingDoc(null)}>
                Cancelar
              </Button>
              <Button onClick={saveEditDoc} disabled={updateDocMutation.isPending} className="gap-2">
                {updateDocMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Guardar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={linkingDocId != null} onOpenChange={(open) => !open && (setLinkingDocId(null), setLinkItemId(""))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Vincular documento a artículo</DialogTitle>
            <DialogDescription>
              Elige un artículo del inventario de {documentsResponsible ?? ""}. El documento aparecerá en la ficha de ese artículo en Inventario.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Artículo</label>
              <Select value={linkItemId} onValueChange={setLinkItemId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar artículo..." />
                </SelectTrigger>
                <SelectContent>
                  {itemsForLink.map((item) => (
                    <SelectItem key={item.id} value={String(item.id)}>
                      {item.code} — {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => (setLinkingDocId(null), setLinkItemId(""))}>
                Cancelar
              </Button>
              <Button onClick={handleLinkToItem} disabled={!linkItemId || linkMutation.isPending} className="gap-2">
                {linkMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Vincular
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deletingDocId !== null} onOpenChange={(open) => !open && setDeletingDocId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar documento</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Seguro que quieres eliminar este documento? Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DocumentPreviewModal
        open={!!previewDoc}
        onOpenChange={(o) => !o && setPreviewDoc(null)}
        fileUrl={previewDoc?.fileUrl ?? ""}
        mimeType={previewDoc?.mimeType ?? null}
        originalName={previewDoc?.originalName ?? ""}
      />

      <Dialog open={!!historialOpen} onOpenChange={(o) => !o && setHistorialOpen(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5" />
              Historial — {historialOpen && (DOCUMENT_TYPE_LABELS[historialOpen.documentType] ?? historialOpen.documentType)}
            </DialogTitle>
            <DialogDescription>
              Versiones del documento para {historialOpen?.responsible}. La más reciente aparece primero.
            </DialogDescription>
          </DialogHeader>
          <ul className="border rounded-md divide-y max-h-[50vh] overflow-y-auto">
            {versionList.map((v: EmployeeDocument) => (
              <li key={v.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="font-medium truncate">{v.originalName}</span>
                <span className="text-muted-foreground shrink-0">{format(new Date(v.createdAt), "dd/MM/yyyy HH:mm")}</span>
                <a href={v.fileUrl.startsWith("http") ? v.fileUrl : `${window.location.origin}${v.fileUrl}`} target="_blank" rel="noopener noreferrer">
                  <Button variant="ghost" size="sm">Descargar</Button>
                </a>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>

      <EmployeeQuickViewDialog
        open={!!quickViewResponsible}
        onOpenChange={(o) => !o && setQuickViewResponsible(null)}
        responsible={quickViewResponsible}
        onManageDocuments={(name) => {
          setDocumentsResponsible(name);
          setDocumentsOpen(true);
        }}
      />
    </div>
  );
}
