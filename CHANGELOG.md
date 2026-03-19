# CHANGELOG

All notable changes to this project will be documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Added
- Private uploads serving (auth-gated endpoints) for inventory images and employee documents.
- Role-based access for employee documents (`editor/admin`).
- Auth-gated thumbnail serving with on-demand generation.
- Shared notes section with role-based access (`viewer` read-only, `editor/admin` manage).

### Changed
- Uploads handling no longer uses a public `/uploads` static directory.
- Attachment deletion is now scoped to the parent item resource.
- Shared notes are now managed per inventory item from the create/edit article dialogs (viewer read-only; editor/admin can manage).

### Fixed
- Prevent cross-item attachment deletion by ensuring `attachmentId` belongs to `:id`.
- Removed silent swallowing of history/audit side-effect failures in the paths we touched (now logs with context).

---

## [1.3] - 2026-03-18

### Changed
- Privacy hardening: uploads are private and served only after authentication.
- Attachment integrity fix.

