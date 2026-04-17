import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import path from "path";
import fs from "fs";
import { configureAuth } from "./auth";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { ensureThumbsDir } from "./thumbnails";
import { emitOpsEvent, ensureOpsEventsTable } from "./ops-events";
import { startWebhookPoller } from "./webhooks";
import { shutdownPdfService } from "./doc-gen/pdf/pdf.service";

const app = express();
const SLOW_REQUEST_MS = parseInt(process.env.OPS_SLOW_REQUEST_MS || "1000", 10);

// Ensure uploads and thumbnails directories exist and serve static files
const uploadsPath = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}
ensureThumbsDir();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

if (process.env.TRUST_PROXY === "true") {
  app.set("trust proxy", 1);
}

configureAuth(app);

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      const shouldLogBody = res.statusCode >= 400 && res.statusCode <= 599;
      if (shouldLogBody && capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);

      const userId = Number.isFinite((req as any).user?.id) ? (req as any).user.id : null;
      const ip = (req.ip || "unknown").toString();
      if (res.statusCode >= 400 && res.statusCode < 500) {
        void emitOpsEvent({
          eventType: "api.error_4xx",
          severity: "warning",
          endpoint: path,
          method: req.method,
          userId,
          ip,
          payload: { status: res.statusCode, durationMs: duration },
        });
      } else if (res.statusCode >= 500) {
        void emitOpsEvent({
          eventType: "api.error_5xx",
          severity: "critical",
          endpoint: path,
          method: req.method,
          userId,
          ip,
          payload: { status: res.statusCode, durationMs: duration },
        });
      }
      if (duration > SLOW_REQUEST_MS) {
        void emitOpsEvent({
          eventType: "api.slow_request",
          severity: "warning",
          endpoint: path,
          method: req.method,
          userId,
          ip,
          payload: { durationMs: duration, thresholdMs: SLOW_REQUEST_MS, status: res.statusCode },
        });
      }
    }
  });

  next();
});

(async () => {
  try {
    await ensureOpsEventsTable();
  } catch (err) {
    console.error("Failed to ensure ops_events table exists", err);
  }

  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);
    void emitOpsEvent({
      eventType: "api.error_5xx",
      severity: "critical",
      endpoint: _req.path,
      method: _req.method,
      userId: Number.isFinite((_req as any).user?.id) ? (_req as any).user.id : null,
      ip: (_req.ip || "unknown").toString(),
      payload: { status, message },
    });

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // Start the background webhook delivery poller
  startWebhookPoller();

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  const bindHost = process.env.BIND_HOST?.trim() || "127.0.0.1";
  httpServer.listen(
    {
      port,
      host: bindHost,
    },
    () => {
      log(`serving on ${bindHost}:${port}`);
      void emitOpsEvent({
        eventType: "system.startup",
        severity: "info",
        source: "server",
        payload: { bindHost, port, nodeEnv: process.env.NODE_ENV || "development" },
      });
    },
  );
})();

process.on("SIGINT", () => {
  void shutdownPdfService();
  void emitOpsEvent({
    eventType: "system.shutdown",
    severity: "info",
    source: "server",
    payload: { reason: "SIGINT" },
  }).finally(() => process.exit(0));
});

process.on("SIGTERM", () => {
  void shutdownPdfService();
  void emitOpsEvent({
    eventType: "system.shutdown",
    severity: "info",
    source: "server",
    payload: { reason: "SIGTERM" },
  }).finally(() => process.exit(0));
});
