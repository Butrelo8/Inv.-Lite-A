import { useState } from "react";
import { useUsers, useUpdateUserRole, type AppUser } from "@/hooks/use-users";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserCog, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  editor: "Editor",
  viewer: "Visor",
};

export default function Users() {
  const { user: currentUser } = useAuth();
  const { data: users = [], isLoading } = useUsers();
  const updateRoleMutation = useUpdateUserRole();
  const { toast } = useToast();
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const handleRoleChange = (u: AppUser, newRole: string) => {
    if (newRole === u.role) return;
    setUpdatingId(u.id);
    updateRoleMutation.mutate(
      { id: u.id, role: newRole as "admin" | "editor" | "viewer" },
      {
        onSettled: () => setUpdatingId(null),
        onSuccess: () => toast({ title: "Rol actualizado", description: `${u.username}: ${ROLE_LABELS[newRole] ?? newRole}` }),
        onError: (err) => toast({ variant: "destructive", title: "Error", description: err.message }),
      }
    );
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
        <h2 className="text-2xl font-bold tracking-tight">Usuarios</h2>
        <p className="text-muted-foreground mt-1">
          Lista de usuarios del sistema. Solo los administradores pueden ver esta página y cambiar roles. Para crear usuarios usa el script <code className="text-xs bg-muted px-1 rounded">create-user</code>.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCog className="w-5 h-5" />
            Listado de usuarios
          </CardTitle>
          <CardDescription>
            {users.length} usuario(s). Cambia el rol con el desplegable (admin, editor, visor).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No hay usuarios en el sistema.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[120px]">Usuario</TableHead>
                    <TableHead className="min-w-[140px]">Rol</TableHead>
                    <TableHead className="min-w-[140px]">Fecha de alta</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">
                        {u.username}
                        {currentUser?.id === u.id && (
                          <span className="ml-2 text-xs text-muted-foreground">(tú)</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={u.role}
                          onValueChange={(v) => handleRoleChange(u, v)}
                          disabled={updatingId === u.id}
                        >
                          <SelectTrigger className="w-[140px] h-9">
                            <SelectValue />
                            {updatingId === u.id && (
                              <Loader2 className="w-4 h-4 animate-spin ml-2" />
                            )}
                          </SelectTrigger>
                          <SelectContent>
                            {(["admin", "editor", "viewer"] as const).map((r) => (
                              <SelectItem key={r} value={r}>
                                {ROLE_LABELS[r] ?? r}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {u.createdAt ? format(new Date(u.createdAt), "dd/MM/yyyy HH:mm") : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
