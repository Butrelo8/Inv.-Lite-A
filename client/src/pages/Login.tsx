import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";

const loginSchema = z.object({
  username: z.string().min(1, "Usuario es requerido"),
  password: z.string().min(1, "Contraseña es requerida"),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function Login() {
  const [, setLocation] = useLocation();
  const { login, isLoggingIn } = useAuth();
  const [error, setError] = useState<string>("");
  const sessionExpired = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("expired") === "1";

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });

  const onSubmit = form.handleSubmit(async (data) => {
    setError("");
    try {
      await login({ username: data.username, password: data.password });
      setLocation("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al iniciar sesión");
    }
  });

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6 flex flex-col items-center">
        <div className="flex flex-col items-center text-center">
          <img src="/logo.jpg" alt="EcoOceano" className="h-20 w-auto object-contain mb-4" />
          <h1 className="text-2xl font-bold tracking-tight">EcoOceano</h1>
          <p className="text-muted-foreground mt-1">
            {sessionExpired ? "Sesión expirada. Inicia sesión de nuevo." : "Inicia sesión para continuar"}
          </p>
        </div>
        <Form {...form}>
          <form onSubmit={onSubmit} className="space-y-4">
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Usuario</FormLabel>
                  <FormControl>
                    <Input placeholder="admin" autoComplete="username" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contraseña</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="••••••••" autoComplete="current-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <Button type="submit" className="w-full" disabled={isLoggingIn}>
              {isLoggingIn ? <Loader2 className="h-4 w-4 animate-spin" /> : "Iniciar sesión"}
            </Button>
          </form>
        </Form>
      </div>
    </div>
  );
}
