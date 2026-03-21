import { useState } from "react";
import { format } from "date-fns";
import { FileText, Loader2, Pencil, Trash2 } from "lucide-react";
import { Redirect } from "wouter";

import { useAuth } from "@/hooks/use-auth";
import {
  useSharedNotes,
  useUpdateSharedNote,
  useDeleteSharedNote,
  type SharedNote,
} from "@/hooks/use-shared-notes";
import { useToast } from "@/hooks/use-toast";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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

export default function SharedNotes() {
  const { user, isLoading: authLoading } = useAuth();
  const canEdit = (user?.role ?? "viewer") === "editor" || (user?.role ?? "viewer") === "admin";
  const { data: notes = [], isLoading } = useSharedNotes(undefined, { enabled: !authLoading && canEdit });
  const updateMutation = useUpdateSharedNote();
  const deleteMutation = useDeleteSharedNote();
  const { toast } = useToast();

  // Avoid redirecting before auth finishes loading.
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Viewer should never see this feature surface.
  if (!canEdit) return <Redirect to="/" />;

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SharedNote | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [deleting, setDeleting] = useState<SharedNote | null>(null);

  const openEdit = (n: SharedNote) => {
    if (!canEdit) return;
    setEditing(n);
    setTitle(n.title ?? "");
    setContent(n.content ?? "");
    setFormOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();
    if (!trimmedTitle || !trimmedContent) return;

    if (!editing) return;
    updateMutation.mutate(
      { id: editing.id, title: trimmedTitle, content: trimmedContent },
      {
        onSuccess: () => {
          toast({ title: "Nota compartida actualizada" });
          setFormOpen(false);
        },
        onError: (err: any) =>
          toast({ variant: "destructive", title: "Error", description: err?.message || "No se pudo actualizar" }),
      },
    );
  };

  const doDelete = () => {
    if (!deleting) return;
    deleteMutation.mutate(deleting.id, {
      onSettled: () => setDeleting(null),
      onSuccess: () => toast({ title: "Nota compartida eliminada" }),
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
        <h2 className="text-2xl font-bold tracking-tight">Notas compartidas</h2>
        <p className="text-muted-foreground mt-1">Información compartida para el equipo. Edita solo si tienes permisos.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Sección de notas compartidas
          </CardTitle>
          <CardDescription>
            {notes.length} nota(s) compartida(s). {canEdit ? "Puedes editar y eliminar." : "Solo puedes leer."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* La creación de notas se gestiona desde el formulario de artículos (por item). */}

          {notes.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              "Aún no hay notas compartidas."
            </p>
          ) : (
            <div className="grid gap-3">
              {notes.map((n) => {
                const createdAt = n.createdAt ? new Date(n.createdAt) : null;
                const updatedAt = n.updatedAt ? new Date(n.updatedAt) : null;
                return (
                  <div key={n.id} className="border rounded-lg p-4 bg-card">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <h3 className="font-semibold truncate">{n.title}</h3>
                        <div className="text-xs text-muted-foreground mt-1">
                          por {n.authorUsername ?? "—"}
                          {createdAt && (
                            <>
                              {" "}
                              · {format(createdAt, "dd/MM/yyyy HH:mm")}
                            </>
                          )}
                          {updatedAt && (
                            <>
                              {" "}
                              · actualizada {format(updatedAt, "dd/MM/yyyy HH:mm")}
                            </>
                          )}
                        </div>
                      </div>

                      {canEdit && (
                        <div className="flex items-center gap-2 shrink-0">
                          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => openEdit(n)}>
                            <Pencil className="w-3.5 h-3.5" />
                            Editar
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5 text-destructive hover:text-destructive"
                            onClick={() => setDeleting(n)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Eliminar
                          </Button>
                        </div>
                      )}
                    </div>

                    <div className="mt-3">
                      <p className="whitespace-pre-wrap text-sm">{n.content}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {canEdit && (
        <Dialog
          open={formOpen}
          onOpenChange={(open) => {
            setFormOpen(open);
            if (!open) setEditing(null);
          }}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Editar nota compartida</DialogTitle>
              <DialogDescription>Actualiza el contenido y/o título.</DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="shared-note-title">Título</Label>
                <Input
                  id="shared-note-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ej. Mantenimiento"
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="shared-note-content">Contenido</Label>
                <Textarea
                  id="shared-note-content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Escribe aquí..."
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={
                    updateMutation.isPending ||
                    !title.trim() ||
                    !content.trim()
                  }
                  className="gap-2"
                >
                  {updateMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  Guardar
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {canEdit && (
        <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminar nota compartida</AlertDialogTitle>
              <AlertDialogDescription>
                ¿Seguro que quieres eliminar &quot;{deleting?.title}&quot;? Esta acción no se puede deshacer.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={doDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

