import { useEffect } from "react";
import { Switch, Route, useLocation, Redirect } from "wouter";
import { ThemeProvider } from "next-themes";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/AppLayout";
import Overview from "@/pages/Overview";
import Dashboard from "@/pages/Dashboard";
import History from "@/pages/History";
import Employees from "@/pages/Employees";
import Companies from "@/pages/Companies";
import SharedNotes from "@/pages/SharedNotes";
import Users from "@/pages/Users";
import Login from "@/pages/Login";
import NotFound from "@/pages/not-found";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";

/** On 401 "Sesión expirada", clear auth and redirect to login so the user sees the message. */
function useSessionExpiredRedirect() {
  useEffect(() => {
    const origFetch = window.fetch;
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const res = await origFetch(input, init);
      if (res.status === 401) {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (url.includes("/api")) {
          const cloned = res.clone();
          const data = await cloned.json().catch(() => ({}));
          if (data?.message === "Sesión expirada") {
            queryClient.setQueryData(["/api/auth/me"], null);
            window.location.href = "/login?expired=1";
            return res;
          }
        }
      }
      return res;
    };
    return () => {
      window.fetch = origFetch;
    };
  }, []);
}

function Router() {
  const { user, isLoading } = useAuth();
  const [location] = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (location === "/login") {
    if (user) return <Redirect to="/" />;
    return <Login />;
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  return (
    <Switch>
      <Route path="/">
        <AppLayout>
          <Overview />
        </AppLayout>
      </Route>
      <Route path="/inventory">
        <AppLayout>
          <Dashboard />
        </AppLayout>
      </Route>
      <Route path="/shared-notes">
        <AppLayout>
          <SharedNotes />
        </AppLayout>
      </Route>
      <Route path="/employees">
        {((user?.role ?? "viewer") === "viewer") ? (
          <Redirect to="/" />
        ) : (
          <AppLayout>
            <Employees />
          </AppLayout>
        )}
      </Route>
      <Route path="/companies">
        {((user?.role ?? "viewer") === "viewer") ? (
          <Redirect to="/" />
        ) : (
          <AppLayout>
            <Companies />
          </AppLayout>
        )}
      </Route>
      <Route path="/users">
        {(user?.role ?? "") !== "admin" ? (
          <Redirect to="/" />
        ) : (
          <AppLayout>
            <Users />
          </AppLayout>
        )}
      </Route>
      <Route path="/activity">
        <Redirect to="/history" />
      </Route>
      <Route path="/history">
        {((user?.role ?? "viewer") === "viewer") ? (
          <Redirect to="/" />
        ) : (
          <AppLayout>
            <History />
          </AppLayout>
        )}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  useSessionExpiredRedirect();
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" storageKey="ecooceano-theme">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
