import type { Express } from "express";
import passport from "passport";
import type { UserRole } from "@shared/schema";
import { consumeLoginRateLimit, clearLoginRateLimitForUser } from "../rate-limiter";
import { emitOpsEvent } from "../ops-events";
import { loadSiteAccess } from "../site-rbac-access";
import { authEnvFlags, getClientIp, siteAccessJson } from "../route-middleware";

export function registerAuthRoutes(app: Express): void {
  app.post("/api/auth/login", async (req, res, next) => {
    const username = typeof (req.body as { username?: unknown })?.username === "string"
      ? ((req.body as { username?: string }).username || "")
      : "";
    const ip = getClientIp(req);

    try {
      const limit = await consumeLoginRateLimit(ip, username);
      if (!limit.allowed) {
        res.setHeader("Retry-After", String(limit.retryAfterSeconds));
        void emitOpsEvent({
          eventType: "auth.rate_limit_hit",
          severity: "warning",
          endpoint: req.path,
          method: req.method,
          ip,
          payload: { username, retryAfterSec: limit.retryAfterSeconds },
        });
        return res.status(429).json({ message: "Too many login attempts. Please try again later." });
      }
    } catch (err) {
      console.error("Login rate limiter failure", { ip, username }, err);
    }

    passport.authenticate("local", async (err: unknown, user: Express.User | false, info?: { message?: string }) => {
      if (err) return next(err);
      if (!user) {
        void emitOpsEvent({
          eventType: "auth.login_failure",
          severity: "warning",
          endpoint: req.path,
          method: req.method,
          ip,
          payload: { username, reason: info?.message || "invalid_credentials" },
        });
        return res.status(401).json({ message: info?.message || "Invalid username or password" });
      }
      try {
        await clearLoginRateLimitForUser(ip, username);
      } catch (clearErr) {
        console.error("Failed to clear login rate limiter entry", { ip, username }, clearErr);
      }
      req.login(user, (loginErr) => {
        if (loginErr) return next(loginErr);
        void emitOpsEvent({
          eventType: "auth.login_success",
          severity: "info",
          endpoint: req.path,
          method: req.method,
          ip,
          userId: user.id,
          payload: { username: user.username },
        });
        void loadSiteAccess(user.id, user.role as UserRole)
          .then((access) => {
            res.json({
              user: { id: user.id, username: user.username, role: user.role },
              ...authEnvFlags(),
              capabilities: access.enforcing ? Array.from(access.capabilities).sort() : [],
              allowedSites: access.enforcing ? access.visibleSites : undefined,
              siteGrants: access.enforcing ? access.grants : undefined,
            });
          })
          .catch(next);
      });
    })(req, res, next);
  });

  app.post("/api/auth/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.json({ ok: true });
    });
  });

  app.get("/api/auth/me", async (req, res) => {
    const flags = authEnvFlags();
    if (req.isAuthenticated?.() && req.user) {
      const extra = await siteAccessJson(req);
      res.json({
        user: { id: req.user.id, username: req.user.username, role: req.user.role },
        ...extra,
      });
    } else {
      res.status(401).json({ message: "Not authenticated", ...flags });
    }
  });
}
