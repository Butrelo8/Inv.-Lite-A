/**
 * Authentication: session + Passport (username/password).
 * Session stores logged-in user. Passport LocalStrategy verifies credentials.
 */
import session from "express-session";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import bcrypt from "bcryptjs";
import MemoryStore from "memorystore";
import connectPgSimple from "connect-pg-simple";
import { storage } from "./storage";
import { pool } from "./db";
import type { Express } from "express";
import { emitOpsEvent } from "./ops-events";

declare global {
  namespace Express {
    interface User {
      id: number;
      username: string;
      role: string;
    }
  }
}

export function configureAuth(app: Express) {
  const MemorySessionStore = MemoryStore(session);
  const PgSessionStore = connectPgSimple(session);
  const INACTIVITY_MS = 5 * 60 * 60 * 1000; // 5 hours
  const rawSessionSecret = process.env.SESSION_SECRET;
  const isProd = process.env.NODE_ENV === "production";

  // Allowed only for local/dev runs. In production we must not fall back to any placeholder.
  const LOCAL_PLACEHOLDER_SESSION_SECRET = "inventario-lite-secret-change-in-production";
  const DOCKER_COMPOSE_PLACEHOLDER_SESSION_SECRET = "inventario-docker-secret-change-me";

  if (isProd) {
    const secret = rawSessionSecret?.trim();
    if (!secret || secret === LOCAL_PLACEHOLDER_SESSION_SECRET || secret === DOCKER_COMPOSE_PLACEHOLDER_SESSION_SECRET) {
      console.error(
        [
          "Configuration error: SESSION_SECRET must be set to a strong random value in production.",
          "Refusing to start to avoid insecure session cookies.",
          "Please set the environment variable `SESSION_SECRET` (e.g. via .env or your process manager).",
        ].join(" ")
      );
      process.exit(1);
    }
  }

  const sessionSecret =
    rawSessionSecret?.trim() && rawSessionSecret.trim().length > 0
      ? rawSessionSecret.trim()
      : LOCAL_PLACEHOLDER_SESSION_SECRET;

  if (isProd) {
    pool
      .query(
        `
        CREATE TABLE IF NOT EXISTS user_sessions (
          sid varchar NOT NULL COLLATE "default",
          sess json NOT NULL,
          expire timestamp(6) NOT NULL
        )
        `,
      )
      .then(() =>
        pool.query(
          `
          ALTER TABLE user_sessions
          ADD CONSTRAINT user_sessions_pkey PRIMARY KEY (sid)
          `,
        ).catch(() => undefined),
      )
      .then(() =>
        pool.query(
          `
          CREATE INDEX IF NOT EXISTS IDX_user_sessions_expire
          ON user_sessions (expire)
          `,
        ),
      )
      .catch((err) => {
        console.error("Failed to ensure user_sessions table exists", err);
        void emitOpsEvent({
          eventType: "system.db_connection_error",
          severity: "critical",
          source: "auth",
          payload: { stage: "ensure_user_sessions_table", error: err instanceof Error ? err.message : String(err) },
        });
      });
  }

  app.use(
    session({
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        // Use secure only when actually using HTTPS (e.g. behind a reverse proxy).
        // On http://localhost (Docker or local dev) secure must be false or the browser won't send the cookie.
        secure: process.env.COOKIE_SECURE === "true",
        httpOnly: true,
        // CSRF mitigation: only send the session cookie on same-site navigations by default.
        sameSite: "lax",
        maxAge: INACTIVITY_MS, // align with inactivity (5h)
      },
      store: isProd
        ? new PgSessionStore({
            pool,
            tableName: "user_sessions",
            createTableIfMissing: false,
          })
        : new MemorySessionStore({ checkPeriod: 86400000 }),
    })
  );

  app.use(passport.initialize());
  app.use(passport.session());

  // Auto-logout after 5 hours of inactivity (updates lastActivity on each request)
  app.use((req, res, next) => {
    if (!req.isAuthenticated?.()) return next();
    const now = Date.now();
    const last = (req.session as { lastActivity?: number }).lastActivity;
    if (last != null && now - last > INACTIVITY_MS) {
      void emitOpsEvent({
        eventType: "auth.session_expired",
        severity: "info",
        source: "auth",
        userId: Number.isFinite((req.user as any)?.id) ? (req.user as any).id : null,
        ip: (req.ip || "unknown").toString(),
        endpoint: req.path,
        method: req.method,
        payload: { inactivityMs: now - last },
      });
      req.session.destroy((err) => {
        if (err) return next(err);
        if (req.path.startsWith("/api")) {
          return res.status(401).json({ message: "Sesión expirada" });
        }
        res.redirect("/login?expired=1");
      });
      return;
    }
    (req.session as { lastActivity?: number }).lastActivity = now;
    req.session.save((err) => (err ? next(err) : next()));
  });

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.getUserByUsername(username);
        if (!user) return done(null, false, { message: "Invalid username or password" });
        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return done(null, false, { message: "Invalid username or password" });
        return done(null, { id: user.id, username: user.username, role: user.role });
      } catch (err) {
        return done(err);
      }
    })
  );

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUserById(id);
      done(null, user ? { id: user.id, username: user.username, role: user.role } : null);
    } catch (err) {
      done(err);
    }
  });
}
