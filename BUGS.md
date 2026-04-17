# BUGS

Known bugs and workarounds.

---

<!-- Add bugs below as they are found -->

<!-- Format:
## [BUG] Title
**Description:** What happens and when
**Workaround:** How to work around it in the meantime
**Status:** pending / in progress / blocked
**Reported:** YYYY-MM-DD
-->

## [RISK] Session secret fallback when `SESSION_SECRET` is missing
**Description:** If `SESSION_SECRET` is not set, the server uses a literal default value. This reduces the security strength of session cookies and signatures.  
**Workaround:** Always set `SESSION_SECRET` in `.env` before starting the server.  
**Status:** pending (config hardening in TODOs)  
**Reported:** 2026-03-18

