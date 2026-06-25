# ADR-001: Local Whiteboard Modular Monolith

**Status**: Decided
**Date**: 2026-05-25

## Context

The demo must run locally with no auth and no external services. It needs deterministic tests, SQLite persistence, and real-time collaboration across browser tabs. The repo already contains a CMS demo with media endpoints that can provide image metadata and files.

## Decision

Build an isolated .NET 8 modular monolith for whiteboard behavior:

- `Whiteboard.Api` hosts Minimal APIs and SignalR.
- `Whiteboard.Domain` owns whiteboard entities and shape contracts.
- `Whiteboard.Infrastructure` owns EF Core SQLite persistence and seed data.
- `canvas-frontend` is a React 18 + TypeScript strict + Webpack 5 app using Canvas 2D and Zustand.

CMS pictures are consumed as a read-only integration from existing media endpoints. Whiteboard stores image references, not image files.

## Consequences

- The canvas app can satisfy the requested stack without changing the existing CMS backend model.
- Local setup stays small: one whiteboard SQLite file plus optional CMS API for picture lookup.
- Presence is in-memory, so multi-instance scaling is out of scope by design.
- Last-write-wins is accepted for demo simplicity.

## Rejected Options

- **Merge into existing DemoCms API**: rejected because current projects target a different runtime and use MVC controllers rather than the requested Minimal API shape.
- **Add Redis or CRDT collaboration**: rejected as out of scope.
- **Copy CMS image bytes into canvas storage**: rejected because CMS remains the media source.
