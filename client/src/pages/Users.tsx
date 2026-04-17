import { Fragment, useState } from "react";
import {
  useUsers,
  useUpdateUserRole,
  useRoleTemplates,
  useUserSiteRoles,
  useUpsertUserSiteRole,
  useDeleteUserSiteRole,
  type AppUser,
} from "@/hooks/use-users";
import { useAuth } from "@/hooks/use-auth";
import { useSites } from "@/hooks/use-sites";
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
import { Button } from "@/components/ui/button";
import { UserCog, Loader2, ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  editor: "Editor",
  viewer: "Visor",
};

function UserSiteGrantsPanel({ userId }: { userId: number }) {
  const { data: grantsRes, isLoading: loadingGrants } = useUserSiteRoles(userId, true);
  const { data: templates = [], isLoading: loadingTpl } = useRoleTemplates(true);
  const { data: sitesRes, isLoading: loadingSites } = useSites(true);
  const upsert = useUpsertUserSiteRole();
  const del = useDeleteUserSiteRole();
  const { toast } = useToast();
  const [siteId, setSiteId] = useState<string>("");
  const [templateId, setTemplateId] = useState<string>("");

  const sites = sitesRes?.sites ?? [];
  const grants = grantsRes?.grants ?? [];

  const handleAdd = () => {
    const sid = parseInt(siteId, 10);
    const tid = parseInt(templateId, 10);
    if (!Number.isFinite(sid) || !Number.isFinite(tid)) {
      toast({ variant: "destructive", title: "Completa sitio y plantilla" });
      return;
    }
    upsert.mutate(
      { userId, siteId: sid, templateId: tid },
      {
        onSuccess: () => {
          toast({ title: "Permiso por sitio guardado" });
          setSiteId("");
          setTemplateId("");
        },
        onError: (err) => toast({ variant: "destructive", title: "Error", description: err.message }),
      },
    );
  };

  if (loadingGrants || loadingTpl || loadingSites) {
    return (
      <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        Cargando permisos por sitio…
      </div>
    );
  }

  return (
    <div className="space-y-4 py-2 pl-4 border-l-2 border-muted">
      <p className="text-sm text-muted-foreground">
        Con <strong>scoping</strong> y <strong>RBAC por sitio</strong> activos, las filas aquí limitan a qué ubicaciones puede acceder el usuario y con qué plantilla. Sin filas, el usuario conserva el comportamiento heredado (rol global en todos los sitios).
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">Sitio</span>
          <Select value={siteId} onValueChange={setSiteId}>
            <SelectTrigger className="w-[200px] h-9">
              <SelectValue placeholder="Elegir sitio" />
            </SelectTrigger>
            <SelectContent>
              {sites.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">Plantilla</span>
          <Select value={templateId} onValueChange={setTemplateId}>
            <SelectTrigger className="w-[220px] h-9">
              <SelectValue placeholder="Elegir plantilla" />
            </SelectTrigger>
            <SelectContent>
              {templates.map((t) => (
                <SelectItem key={t.id} value={String(t.id)}>
                  {t.displayName} ({t.key})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="button" size="sm" onClick={handleAdd} disabled={upsert.isPending}>
          {upsert.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Añadir o actualizar"}
        </Button>
      </div>
      {grants.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin asignaciones por sitio (acceso según rol global).</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sitio</TableHead>
              <TableHead>Plantilla</TableHead>
              <TableHead className="w-[100px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {grants.map((g) => (
              <TableRow key={`${g.siteId}-${g.templateId}`}>
                <TableCell>{g.siteName}</TableCell>
                <TableCell className="text-muted-foreground text-sm">{g.templateDisplayName}</TableCell>
                <TableCell>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    disabled={del.isPending}
                    onClick={() =>
                      del.mutate(
                        { userId, siteId: g.siteId },
                        {
                          onSuccess: () => toast({ title: "Asignación eliminada" }),
                          onError: (err) =>
                            toast({ variant: "destructive", title: "Error", description: err.message }),
                        },
                      )
                    }
                    aria-label={`Quitar permiso en ${g.siteName}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

export default function Users() {
  const { user: currentUser } = useAuth();
  const { data: users = [], isLoading } = useUsers();
  const updateRoleMutation = useUpdateUserRole();
  const { toast } = useToast();
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [expandedSiteRbacUserId, setExpandedSiteRbacUserId] = useState<number | null>(null);

  const showSiteRbacColumn =
    (currentUser?.role ?? "viewer") === "admin" &&
    Boolean(currentUser?.siteScopingEnabled) &&
    Boolean(currentUser?.siteRbacEnabled);
  const userTableColSpan = showSiteRbacColumn ? 4 : 3;

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
          {showSiteRbacColumn && (
            <span className="block mt-2">
              <strong>RBAC por sitio</strong> está activo: usa la columna Sitios para asignar plantillas por ubicación.
            </span>
          )}
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
                    {showSiteRbacColumn && <TableHead className="min-w-[100px] w-[100px]">Sitios</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <Fragment key={u.id}>
                      <TableRow>
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
                        {showSiteRbacColumn && (
                          <TableCell>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="gap-1 h-8"
                              onClick={() =>
                                setExpandedSiteRbacUserId((cur) => (cur === u.id ? null : u.id))
                              }
                            >
                              {expandedSiteRbacUserId === u.id ? (
                                <ChevronDown className="w-4 h-4" />
                              ) : (
                                <ChevronRight className="w-4 h-4" />
                              )}
                              Editar
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                      {showSiteRbacColumn && expandedSiteRbacUserId === u.id && (
                        <TableRow>
                          <TableCell colSpan={userTableColSpan}>
                            <UserSiteGrantsPanel userId={u.id} />
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
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
