import { useState } from "react";
import {
  useCompanies,
  useCreateCompany,
  useUpdateCompany,
  useDeleteCompany,
  type Company,
} from "@/hooks/use-companies";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, Loader2, Pencil, Trash2, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Companies() {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Company | null>(null);
  const [name, setName] = useState("");
  const [deleting, setDeleting] = useState<Company | null>(null);

  const { data: companies = [], isLoading } = useCompanies();
  const createMutation = useCreateCompany();
  const updateMutation = useUpdateCompany();
  const deleteMutation = useDeleteCompany();
  const { toast } = useToast();

  const openAdd = () => {
    setEditing(null);
    setName("");
    setFormOpen(true);
  };

  const openEdit = (c: Company) => {
    setEditing(c);
    setName(c.name);
    setFormOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    if (editing) {
      updateMutation.mutate(
        { id: editing.id, name: trimmed },
        {
          onSuccess: () => {
            toast({ title: "Empresa actualizada" });
            setFormOpen(false);
          },
          onError: (err) => toast({ variant: "destructive", title: "Error", description: err.message }),
        }
      );
    } else {
      createMutation.mutate(trimmed, {
        onSuccess: () => {
          toast({ title: "Empresa creada" });
          setFormOpen(false);
        },
        onError: (err) => toast({ variant: "destructive", title: "Error", description: err.message }),
      });
    }
  };

  const doDelete = () => {
    if (!deleting) return;
    deleteMutation.mutate(deleting.id, {
      onSettled: () => setDeleting(null),
      onSuccess: () => toast({ title: "Empresa eliminada" }),
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
        <h2 className="text-2xl font-bold tracking-tight">Empresas</h2>
        <p className="text-muted-foreground mt-1">
          Gestiona las empresas para asignar equipos (quién posee o usa el equipo). Las empresas aparecen en el inventario y en los filtros.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            Listado de empresas
          </CardTitle>
          <CardDescription>
            {companies.length} empresa(s). Puedes asignar una empresa a cada artículo en el formulario de inventario.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex justify-end mb-4">
            <Button onClick={openAdd} className="gap-2">
              <Plus className="w-4 h-4" />
              Nueva empresa
            </Button>
          </div>
          {companies.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              Aún no hay empresas. Crea una para asignar equipos por empresa en el inventario.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px]">ID</TableHead>
                    <TableHead className="min-w-[200px]">Nombre</TableHead>
                    <TableHead className="text-right min-w-[140px]">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {companies.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="tabular-nums text-muted-foreground">{c.id}</TableCell>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1.5">
                          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => openEdit(c)}>
                            <Pencil className="w-3.5 h-3.5" />
                            Editar
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5 text-destructive hover:text-destructive"
                            onClick={() => setDeleting(c)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Eliminar
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

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar empresa" : "Nueva empresa"}</DialogTitle>
            <DialogDescription>
              {editing ? "Cambia el nombre de la empresa." : "Añade una empresa para asignar a los artículos del inventario."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="company-name">Nombre</Label>
              <Input
                id="company-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. EcoOcéano"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={!name.trim() || createMutation.isPending || updateMutation.isPending} className="gap-2">
                {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-4 h-4 animate-spin" />}
                {editing ? "Guardar" : "Crear"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar empresa</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Seguro que quieres eliminar &quot;{deleting?.name}&quot;? Los artículos que la tenían asignada quedarán sin empresa. Esta acción no se puede deshacer.
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
    </div>
  );
}
