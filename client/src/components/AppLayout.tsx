import { Link, useLocation } from "wouter";
import { useTheme } from "next-themes";
import { History, Users, Building2, UserCog, Sun, Moon, LogOut, LayoutDashboard, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [location] = useLocation();
  const { resolvedTheme, setTheme } = useTheme();
  const { user, logout, isLoggingOut } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      {/* Header with tabs */}
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-4 md:gap-4 md:p-8">
          <div className="flex items-center gap-3 md:gap-4">
            <img src="/logo.jpg" alt="EcoOcéano" className="h-10 w-auto object-contain md:h-16 shrink-0" />
            <div className="min-w-0">
              <h1 className="text-xl md:text-4xl font-bold text-foreground tracking-tight truncate">
                Inventario de Equipos
              </h1>
              <p className="text-muted-foreground mt-0.5 text-sm md:text-lg">
                EcoOcéano: Ecología y Monitoreo Marino
              </p>
            </div>
          </div>

          {/* Tabs + Theme toggle */}
          <div className="flex items-center gap-2 md:gap-3 shrink-0">
            <nav className="flex gap-0.5 md:gap-1 p-1 rounded-lg bg-muted/50 overflow-x-auto max-w-full">
            <Link
              href="/"
              className={cn(
                "px-3 py-1.5 md:px-4 md:py-2 rounded-md text-xs md:text-sm font-medium transition-colors flex items-center gap-1.5 md:gap-2",
                location === "/" || location === ""
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/50"
              )}
            >
              <LayoutDashboard className="w-3.5 h-3.5 md:w-4 md:h-4" />
              Resumen
            </Link>
            <Link
              href="/inventory"
              className={cn(
                "px-3 py-1.5 md:px-4 md:py-2 rounded-md text-xs md:text-sm font-medium transition-colors flex items-center gap-1.5 md:gap-2",
                location === "/inventory"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/50"
              )}
            >
              <Package className="w-3.5 h-3.5 md:w-4 md:h-4" />
              Inventario
            </Link>
            {(user?.role ?? "viewer") !== "viewer" && (
            <Link
              href="/employees"
              className={cn(
                "px-3 py-1.5 md:px-4 md:py-2 rounded-md text-xs md:text-sm font-medium transition-colors flex items-center gap-1.5 md:gap-2",
                location === "/employees"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/50"
              )}
            >
              <Users className="w-3.5 h-3.5 md:w-4 md:h-4" />
              Responsables
            </Link>
            )}
            {(user?.role ?? "viewer") !== "viewer" && (
            <Link
              href="/companies"
              className={cn(
                "px-3 py-1.5 md:px-4 md:py-2 rounded-md text-xs md:text-sm font-medium transition-colors flex items-center gap-1.5 md:gap-2",
                location === "/companies"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/50"
              )}
            >
              <Building2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
              Empresas
            </Link>
            )}
            {(user?.role ?? "viewer") !== "viewer" && (
            <Link
              href="/history"
              className={cn(
                "px-3 py-1.5 md:px-4 md:py-2 rounded-md text-xs md:text-sm font-medium transition-colors flex items-center gap-1.5 md:gap-2",
                location === "/history" || location === "/activity"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/50"
              )}
            >
              <History className="w-3.5 h-3.5 md:w-4 md:h-4" />
              Historial
            </Link>
            )}
            {user?.role === "admin" && (
            <Link
              href="/users"
              className={cn(
                "px-3 py-1.5 md:px-4 md:py-2 rounded-md text-xs md:text-sm font-medium transition-colors flex items-center gap-1.5 md:gap-2",
                location === "/users"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/50"
              )}
            >
              <UserCog className="w-3.5 h-3.5 md:w-4 md:h-4" />
              Usuarios
            </Link>
            )}
          </nav>
            <span className="text-xs text-muted-foreground hidden sm:inline">{user?.username}</span>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 h-9 w-9"
              onClick={() => logout().then(() => window.location.assign("/login"))}
              disabled={isLoggingOut}
              title="Cerrar sesión"
            >
              <LogOut className="h-4 w-4" />
              <span className="sr-only">Cerrar sesión</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 h-9 w-9"
              onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
              title={resolvedTheme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
            >
              {(resolvedTheme ?? "light") === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
              <span className="sr-only">Alternar tema</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="p-4 md:p-8">{children}</main>
    </div>
  );
}
