# Data Versioning & Schema Migrations

**Version:** 1.0  
**Status:** Draft  
**Last Updated:** 2025-09-30

---

## Overview

This document defines the versioning strategy for document schemas, database migrations, backwards compatibility guarantees, and migration execution procedures for SlideCraft-ai. The system supports multiple concurrent schema versions (N and N-1) to enable zero-downtime deployments and gradual rollouts.

---

## Document Schema Versioning

### Schema Version Model

#### Version Format
- **Pattern:** `v<major>.<minor>` (e.g., `v1.0`, `v1.1`, `v2.0`)
- **Semantic Versioning:**
  - **Major (`v2.0`):** Breaking changes (remove fields, change types, rename properties)
  - **Minor (`v1.1`):** Additive changes (new optional fields, new element types)
  - **Patch:** Not used for schema (migrations are discrete versions)

#### Version Storage
```json
{
  "id": "doc_01H9ABC...",
  "schemaVersion": "v1.2",
  "title": "Q4 Roadmap",
  "ownerId": "user_01H8XYZ...",
  "deck": {
    "slides": [...]
  },
  "createdAt": "2025-09-01T10:00:00Z",
  "updatedAt": "2025-09-30T14:32:10Z"
}
```

### Current Schema Versions

#### v1.0 (Initial Release)
**Release Date:** 2025-Q1 (MVP)  
**Support Status:** Active (until v3.0 released)

**Structure:**
```typescript
interface DocumentV1 {
  id: string;
  schemaVersion: "v1.0";
  title: string;
  ownerId: string;
  deck: {
    slides: SlideV1[];
    theme?: {
      colors: { primary: string; secondary: string; };
      fonts: { heading: string; body: string; };
    };
  };
  createdAt: string; // ISO 8601
  updatedAt: string;
}

interface SlideV1 {
  id: string;
  order: number;
  layout: "title" | "content" | "blank";
  elements: ElementV1[];
  background?: { color: string; } | { image: string; };
  notes?: string;
}

interface ElementV1 {
  id: string;
  type: "text" | "image" | "shape";
  position: { x: number; y: number; w: number; h: number; }; // pixels
  zIndex: number;
  
  // Type-specific properties
  text?: { content: string; fontSize: number; color: string; };
  image?: { src: string; alt?: string; };
  shape?: { shapeType: "rectangle" | "ellipse"; fill: string; };
}
```

**Limitations:**
- No table/chart support
- No animations/transitions
- No collaboration metadata (comments, cursors)

#### v1.1 (First Iteration - Planned 2025-Q2)
**Release Date:** 2025-Q2  
**Support Status:** Active

**Changes (Additive):**
- ✅ Add `ElementV1.table` property (optional)
  ```typescript
  table?: {
    rows: number;
    cols: number;
    cells: string[][]; // Markdown content per cell
    headerRow?: boolean;
  };
  ```
- ✅ Add `ElementV1.chart` property (optional)
  ```typescript
  chart?: {
    chartType: "bar" | "line" | "pie";
    data: { labels: string[]; datasets: { label: string; values: number[]; }[]; };
  };
  ```
- ✅ Add `SlideV1.transition` (optional)
  ```typescript
  transition?: { type: "fade" | "slide" | "none"; duration: number; };
  ```
- ✅ Add `deck.metadata` (optional)
  ```typescript
  metadata?: {
    collaborators?: string[]; // User IDs with access
    comments?: Comment[];
  };
  ```

**Migration:** None required (v1.0 documents auto-upgrade on read by adding empty optional fields)

#### v2.0 (Major Refactor - Planned 2025-Q4)
**Release Date:** 2025-Q4  
**Support Status:** Beta (parallel support with v1.1)

**Breaking Changes:**
- 🔄 **Position Units:** Change from pixels to percentages (responsive design)
  ```typescript
  // v1.x: { x: 100, y: 50, w: 300, h: 200 } (pixels)
  // v2.0: { x: 10, y: 5, w: 30, h: 20 } (percent of slide dimensions)
  ```
- 🔄 **Element Type Hierarchy:** Flatten `text`, `image`, `shape` into discriminated union
  ```typescript
  type ElementV2 = 
    | { type: "text"; content: string; style: TextStyle; }
    | { type: "image"; src: string; alt?: string; }
    | { type: "shape"; shape: ShapeType; fill: string; }
    | { type: "table"; rows: TableRow[]; }
    | { type: "chart"; config: ChartConfig; };
  ```
- 🔄 **Theme Inheritance:** Move `deck.theme` to `deck.masterSlides` (support slide masters)
  ```typescript
  deck: {
    masterSlides: MasterSlide[];
    slides: SlideV2[]; // Reference masterSlideId
  }
  ```

**Migration:** Auto-migration script (see Migration Procedures)

---

## Database Schema Versioning

### Migration Framework

#### Tooling
- **Primary:** Drizzle ORM migrations (`drizzle-kit generate`, `drizzle-kit push`)
- **Language:** SQL (PostgreSQL dialect)
- **Storage:** `migrations/` directory (timestamped files)

#### Migration File Naming
```
migrations/
  20250101_120000_initial_schema.sql
  20250215_093000_add_collaboration_tables.sql
  20250330_140000_document_schema_v1_1.sql
  20250915_160000_document_schema_v2_0.sql
```

**Format:** `YYYYMMDD_HHMMSS_<description>.sql`

### Database Schema Evolution

#### Current Schema (v1.0)

**Core Tables:**
```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,              -- user_01H8XYZ...
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,               -- Argon2id (if self-hosted auth)
  tier TEXT DEFAULT 'free',         -- free | pro | enterprise
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE documents (
  id TEXT PRIMARY KEY,              -- doc_01H9ABC...
  owner_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  schema_version TEXT NOT NULL DEFAULT 'v1.0',
  title TEXT NOT NULL,
  deck JSONB NOT NULL,              -- Full deck JSON
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_documents_owner ON documents(owner_id);
CREATE INDEX idx_documents_schema_version ON documents(schema_version);

CREATE TABLE jobs (
  id TEXT PRIMARY KEY,              -- job_01H9DEF...
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  type TEXT NOT NULL,               -- convert | export
  status TEXT NOT NULL DEFAULT 'pending',
  progress INT DEFAULT 0,
  error JSONB,
  result JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_jobs_user ON jobs(user_id);
CREATE INDEX idx_jobs_status ON jobs(status) WHERE status IN ('pending', 'running');
```

#### v1.1 Migration (2025-Q2)

**Changes:**
- Add collaboration tables
- Add document comments

**Migration:**
```sql
-- File: 20250330_140000_add_collaboration.sql

CREATE TABLE document_collaborators (
  document_id TEXT REFERENCES documents(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'viewer', -- owner | editor | viewer
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (document_id, user_id)
);

CREATE INDEX idx_collaborators_user ON document_collaborators(user_id);

CREATE TABLE document_comments (
  id TEXT PRIMARY KEY,              -- cmt_01H9GHI...
  document_id TEXT REFERENCES documents(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  slide_id TEXT,                    -- Reference to slide in JSONB
  element_id TEXT,                  -- Reference to element in JSONB
  content TEXT NOT NULL,
  resolved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_comments_document ON document_comments(document_id);
CREATE INDEX idx_comments_unresolved ON document_comments(document_id) 
  WHERE resolved = FALSE;
```

**Rollback:**
```sql
-- File: 20250330_140000_add_collaboration.down.sql

DROP TABLE document_comments;
DROP TABLE document_collaborators;
```

#### v2.0 Migration (2025-Q4)

**Changes:**
- Add `documents.schema_version_target` for gradual migration
- Add audit log for schema migrations

**Migration:**
```sql
-- File: 20250915_160000_schema_v2_migration.sql

-- Add target version column for gradual migration
ALTER TABLE documents 
  ADD COLUMN schema_version_target TEXT;

-- Track migration status
CREATE TABLE schema_migrations (
  document_id TEXT REFERENCES documents(id) ON DELETE CASCADE,
  from_version TEXT NOT NULL,
  to_version TEXT NOT NULL,
  status TEXT NOT NULL,            -- pending | running | succeeded | failed
  error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (document_id, from_version, to_version)
);

CREATE INDEX idx_migrations_status ON schema_migrations(status)
  WHERE status IN ('pending', 'running');
```

**Rollback:**
```sql
-- File: 20250915_160000_schema_v2_migration.down.sql

DROP TABLE schema_migrations;
ALTER TABLE documents DROP COLUMN schema_version_target;
```

---

## Backwards Compatibility

### Compatibility Matrix

| Client Version | Schema v1.0 | Schema v1.1 | Schema v2.0 |
|----------------|-------------|-------------|-------------|
| Frontend v1.0  | ✅ Full      | ⚠️ Degrades  | ❌ Breaks    |
| Frontend v1.1  | ✅ Full      | ✅ Full      | ⚠️ Degrades  |
| Frontend v2.0  | ✅ Upgraded  | ✅ Upgraded  | ✅ Full      |

**Legend:**
- ✅ **Full:** Complete support for all features
- ⚠️ **Degrades:** Newer features ignored (e.g., v1.0 client ignores tables from v1.1)
- ❌ **Breaks:** Cannot render (e.g., v1.0 client cannot parse percentage positions from v2.0)
- ✅ **Upgraded:** Client auto-upgrades document to newer schema on save

### N-1 Version Support Policy

#### Read Compatibility
- **Gateway:** Always supports reading N and N-1 schemas (e.g., v2.0 gateway reads v1.1 and v2.0)
- **Frontend:** Reads N-1 with graceful degradation (unknown fields ignored)
- **Export Workers:** Converts N-1 to N before exporting (auto-migration on export)

#### Write Compatibility
- **Gateway:** Writes in client-requested schema version (via `Accept-Schema: v1.1` header)
- **Frontend:** Defaults to latest schema but can request older via header
- **Conversion Workers:** Always outputs latest schema (v2.0 after Q4 2025)

#### Example: Frontend v1.0 Reads v1.1 Document
```typescript
// v1.1 document with table
const docV11 = {
  schemaVersion: "v1.1",
  deck: {
    slides: [{
      elements: [
        { id: "el1", type: "text", text: {...} },
        { id: "el2", type: "table", table: { rows: 3, cols: 2, ... } }
      ]
    }]
  }
};

// v1.0 frontend parser
function parseElement(el) {
  if (el.type === "text") return <TextElement {...el.text} />;
  if (el.type === "image") return <ImageElement {...el.image} />;
  if (el.type === "shape") return <ShapeElement {...el.shape} />;
  
  // Unknown type → skip (graceful degradation)
  console.warn(`Unknown element type: ${el.type}`);
  return null;
}

// Result: Text renders, table is skipped (user sees 1 element instead of 2)
```

### Deprecation Timeline

#### Phase 1: Deprecation Notice (3 months before sunset)
- **Communication:** Email to users with v1.0 documents, in-app banner
- **Action:** Prompt users to upgrade documents via "Migrate to v2.0" button

#### Phase 2: Read-Only (1 month before sunset)
- **Restriction:** v1.0 documents become read-only (cannot edit, can export)
- **Migration Offer:** Auto-migrate on next save

#### Phase 3: Sunset (End of support)
- **Auto-Migration:** All remaining v1.0 documents migrated to v2.0 in background job
- **Removal:** v1.0 parser code removed from codebase (v2.1 release)

**Example Timeline:**
- **2025-09-01:** v2.0 released (v1.1 and v2.0 supported)
- **2025-12-01:** Deprecation notice for v1.0 (v1.0 still supported)
- **2026-02-01:** v1.0 becomes read-only
- **2026-03-01:** v1.0 sunset (auto-migrate all documents)

---

## Migration Procedures

### Document Schema Migration

#### Auto-Migration on Read (Minor Versions)

**Trigger:** Client requests document with older minor version  
**Example:** Frontend v1.1 reads v1.0 document

**Process:**
```typescript
// Gateway: GET /documents/{id}
async function getDocument(id: string, userId: string) {
  const doc = await db.query.documents.findFirst({ where: { id } });
  
  // Auto-upgrade minor version
  if (doc.schemaVersion === "v1.0") {
    doc.deck.metadata = { collaborators: [], comments: [] }; // Add v1.1 fields
    doc.schemaVersion = "v1.1";
    
    // Save upgraded version
    await db.update(documents)
      .set({ deck: doc.deck, schemaVersion: "v1.1", updatedAt: new Date() })
      .where({ id });
    
    logger.info(`Auto-upgraded document ${id} from v1.0 → v1.1`);
  }
  
  return doc;
}
```

**Guarantees:**
- Idempotent (safe to run multiple times)
- No data loss (only adds fields)
- Instant (no async job)

#### Manual Migration (Major Versions)

**Trigger:** User clicks "Upgrade to v2.0" button or API call  
**Example:** v1.1 → v2.0 (pixel to percentage conversion)

**API Endpoint:**
```typescript
POST /api/v1/documents/{id}/migrate
Content-Type: application/json

{
  "targetVersion": "v2.0"
}
```

**Process:**
```typescript
async function migrateDocument(id: string, targetVersion: string) {
  const doc = await db.query.documents.findFirst({ where: { id } });
  
  // Create migration record
  await db.insert(schemaMigrations).values({
    documentId: id,
    fromVersion: doc.schemaVersion,
    toVersion: targetVersion,
    status: "running",
    startedAt: new Date()
  });
  
  try {
    // Run migration transform
    const migrated = await runMigration(doc, targetVersion);
    
    // Atomic update
    await db.update(documents)
      .set({ 
        deck: migrated.deck, 
        schemaVersion: targetVersion,
        updatedAt: new Date() 
      })
      .where({ id });
    
    await db.update(schemaMigrations)
      .set({ status: "succeeded", completedAt: new Date() })
      .where({ documentId: id, toVersion: targetVersion });
    
    return { success: true };
  } catch (err) {
    await db.update(schemaMigrations)
      .set({ status: "failed", error: err.message, completedAt: new Date() })
      .where({ documentId: id, toVersion: targetVersion });
    
    throw err;
  }
}
```

**Migration Transform (v1.1 → v2.0):**
```typescript
function migrateV1ToV2(docV1: DocumentV1): DocumentV2 {
  const SLIDE_WIDTH = 1920; // Standard slide width in pixels
  const SLIDE_HEIGHT = 1080;
  
  return {
    ...docV1,
    schemaVersion: "v2.0",
    deck: {
      masterSlides: [
        { id: "master1", theme: docV1.deck.theme || defaultTheme }
      ],
      slides: docV1.deck.slides.map(slide => ({
        ...slide,
        masterSlideId: "master1",
        elements: slide.elements.map(el => {
          // Convert pixels → percentages
          const position = {
            x: (el.position.x / SLIDE_WIDTH) * 100,
            y: (el.position.y / SLIDE_HEIGHT) * 100,
            w: (el.position.w / SLIDE_WIDTH) * 100,
            h: (el.position.h / SLIDE_HEIGHT) * 100
          };
          
          // Flatten element structure
          if (el.type === "text") {
            return { 
              type: "text", 
              id: el.id, 
              position, 
              zIndex: el.zIndex,
              content: el.text.content, 
              style: { fontSize: el.text.fontSize, color: el.text.color } 
            };
          }
          // ... similar for image, shape, table, chart
        })
      }))
    }
  };
}
```

**Rollback (If Migration Fails):**
- Original document is **never** deleted (copy-on-write)
- Migration status stored in `schema_migrations` table
- User can retry migration or revert to old version

#### Batch Migration (Background Jobs)

**Use Case:** Migrate all v1.0 documents to v2.0 before sunset

**Script:**
```typescript
// scripts/batch-migrate.ts
async function batchMigrate(fromVersion: string, toVersion: string) {
  const docs = await db.query.documents.findMany({
    where: { schemaVersion: fromVersion },
    limit: 1000 // Process in chunks
  });
  
  logger.info(`Migrating ${docs.length} documents from ${fromVersion} → ${toVersion}`);
  
  for (const doc of docs) {
    try {
      await migrateDocument(doc.id, toVersion);
      logger.info(`✅ Migrated ${doc.id}`);
    } catch (err) {
      logger.error(`❌ Failed to migrate ${doc.id}: ${err.message}`);
      // Continue with next document (don't fail entire batch)
    }
  }
}

// Run via cron or admin dashboard
batchMigrate("v1.0", "v2.0");
```

**Safety Measures:**
- Rate limited (10 migrations/sec to avoid DB overload)
- Retries (3 attempts with exponential backoff)
- Alerting (Slack notification if >10% failure rate)

### Database Migration Execution

#### Development Environment
```bash
# Generate migration from schema changes
npm run db:generate

# Review generated SQL
cat migrations/20250915_160000_new_migration.sql

# Apply migration
npm run db:migrate

# Rollback (if needed)
npm run db:rollback
```

#### Production Deployment

**Pre-Deployment:**
1. **Test Migration:** Run on staging DB (copy of production)
2. **Performance Test:** Measure migration time on 10K row sample
3. **Estimate Downtime:** Calculate total time for full dataset

**Deployment (Zero-Downtime):**
```bash
# Step 1: Deploy schema-compatible backend (supports both old + new schema)
git checkout release/v1.1
npm run deploy:gateway

# Step 2: Run migration (while old backend still running)
npm run db:migrate -- --env production

# Step 3: Verify migration
npm run db:verify

# Step 4: Deploy new backend (uses new schema)
git checkout release/v1.1
npm run deploy:workers

# Step 5: Remove old backend (after 24hr monitoring)
npm run deploy:cleanup
```

**Rollback Procedure:**
```bash
# If migration fails
npm run db:rollback -- --env production

# Redeploy old backend
git checkout release/v1.0
npm run deploy:gateway
```

---

## Schema Validation

### Runtime Validation

#### JSON Schema Definition
```typescript
// schemas/document-v1.1.json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "id": { "type": "string", "pattern": "^doc_[a-zA-Z0-9]{10,}$" },
    "schemaVersion": { "type": "string", "enum": ["v1.1"] },
    "title": { "type": "string", "minLength": 1, "maxLength": 200 },
    "ownerId": { "type": "string", "pattern": "^user_[a-zA-Z0-9]{10,}$" },
    "deck": {
      "type": "object",
      "properties": {
        "slides": {
          "type": "array",
          "items": { "$ref": "#/definitions/Slide" }
        }
      },
      "required": ["slides"]
    }
  },
  "required": ["id", "schemaVersion", "title", "ownerId", "deck"],
  "definitions": {
    "Slide": { ... }
  }
}
```

#### Validation at Gateway
```typescript
import Ajv from "ajv";
import schemaV11 from "./schemas/document-v1.1.json";

const ajv = new Ajv();
const validateV11 = ajv.compile(schemaV11);

async function saveDocument(doc: unknown) {
  // Validate against schema
  const valid = validateV11(doc);
  if (!valid) {
    throw new Error(`Schema validation failed: ${ajv.errorsText(validateV11.errors)}`);
  }
  
  // Save to DB
  await db.insert(documents).values(doc);
}
```

### Build-Time Validation

#### TypeScript Type Generation
```bash
# Generate TypeScript types from JSON schema
npm run schema:generate

# Output: src/types/document-v1.1.ts
```

**Generated Types:**
```typescript
// Auto-generated from document-v1.1.json
export interface DocumentV1_1 {
  id: string;
  schemaVersion: "v1.1";
  title: string;
  ownerId: string;
  deck: {
    slides: SlideV1_1[];
    metadata?: {
      collaborators?: string[];
      comments?: Comment[];
    };
  };
  createdAt: string;
  updatedAt: string;
}
```

---

## Testing Strategy

### Migration Tests

#### Unit Tests (Per-Migration)
```typescript
// tests/migrations/v1-to-v2.test.ts
import { migrateV1ToV2 } from "../lib/migrations";
import { fixtureV1 } from "./fixtures";

describe("Document v1 → v2 Migration", () => {
  it("converts pixel positions to percentages", () => {
    const docV1 = fixtureV1({
      slides: [{
        elements: [{
          type: "text",
          position: { x: 100, y: 50, w: 300, h: 200 }
        }]
      }]
    });
    
    const docV2 = migrateV1ToV2(docV1);
    
    expect(docV2.deck.slides[0].elements[0].position).toEqual({
      x: 5.21,   // 100 / 1920 * 100
      y: 4.63,   // 50 / 1080 * 100
      w: 15.63,  // 300 / 1920 * 100
      h: 18.52   // 200 / 1080 * 100
    });
  });
  
  it("preserves all element properties", () => {
    const docV1 = fixtureV1({ slides: [{ elements: [{ type: "image", image: { src: "http://..." } }] }] });
    const docV2 = migrateV1ToV2(docV1);
    
    expect(docV2.deck.slides[0].elements[0].type).toBe("image");
    expect(docV2.deck.slides[0].elements[0].src).toBe("http://...");
  });
  
  it("is idempotent (migrating twice = migrating once)", () => {
    const docV1 = fixtureV1();
    const docV2a = migrateV1ToV2(docV1);
    const docV2b = migrateV1ToV2(migrateV1ToV2(docV1)); // Double migration
    
    expect(docV2a).toEqual(docV2b);
  });
});
```

#### Integration Tests (End-to-End)
```typescript
// tests/integration/migration.test.ts
describe("Document Migration API", () => {
  it("migrates document and updates DB", async () => {
    const user = await createTestUser();
    const doc = await createTestDocument(user.id, { schemaVersion: "v1.0" });
    
    const res = await fetch(`/api/v1/documents/${doc.id}/migrate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${user.token}` },
      body: JSON.stringify({ targetVersion: "v2.0" })
    });
    
    expect(res.status).toBe(200);
    
    const migrated = await db.query.documents.findFirst({ where: { id: doc.id } });
    expect(migrated.schemaVersion).toBe("v2.0");
  });
  
  it("handles migration failures gracefully", async () => {
    const user = await createTestUser();
    const doc = await createTestDocument(user.id, { 
      schemaVersion: "v1.0",
      deck: { slides: [{ elements: [{ type: "invalid" }] }] } // Invalid element
    });
    
    const res = await fetch(`/api/v1/documents/${doc.id}/migrate`, {
      method: "POST",
      body: JSON.stringify({ targetVersion: "v2.0" })
    });
    
    expect(res.status).toBe(500);
    
    const migration = await db.query.schemaMigrations.findFirst({
      where: { documentId: doc.id }
    });
    expect(migration.status).toBe("failed");
    
    // Original document unchanged
    const original = await db.query.documents.findFirst({ where: { id: doc.id } });
    expect(original.schemaVersion).toBe("v1.0");
  });
});
```

### Database Migration Tests

#### Migration Smoke Tests
```typescript
// tests/db/migrations.test.ts
import { migrate, rollback } from "drizzle-orm";

describe("Database Migrations", () => {
  it("applies all migrations without errors", async () => {
    await migrate(db, { migrationsFolder: "./migrations" });
    
    // Verify tables exist
    const tables = await db.query.raw(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    
    expect(tables).toContainEqual({ table_name: "users" });
    expect(tables).toContainEqual({ table_name: "documents" });
    expect(tables).toContainEqual({ table_name: "schema_migrations" });
  });
  
  it("rolls back migrations correctly", async () => {
    await migrate(db, { migrationsFolder: "./migrations" });
    await rollback(db);
    
    const tables = await db.query.raw(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    
    expect(tables).not.toContainEqual({ table_name: "schema_migrations" });
  });
});
```

---

## Monitoring & Observability

### Migration Metrics

#### Tracked Metrics
- **Schema Version Distribution:** Gauge of documents by `schemaVersion` (v1.0: 100, v1.1: 500, v2.0: 200)
- **Migration Success Rate:** Counter of succeeded/failed migrations (target: >99%)
- **Migration Duration:** Histogram of migration time (P50, P95, P99)
- **Auto-Upgrade Rate:** Counter of auto-upgrades on read (v1.0 → v1.1)

#### Grafana Dashboard
```yaml
panels:
  - title: "Schema Version Distribution"
    query: "count(documents) by (schema_version)"
    type: pie
  
  - title: "Migration Success Rate (Last 7d)"
    query: "sum(rate(schema_migration_succeeded[7d])) / sum(rate(schema_migration_total[7d]))"
    type: stat
  
  - title: "Migration Duration"
    query: "histogram_quantile(0.95, schema_migration_duration_seconds)"
    type: graph
```

### Alerts

#### Critical Alerts
- **Migration Failure Spike:** >10% failure rate in 1hr → Page on-call engineer
- **Stuck Migrations:** Migration in `running` state for >10min → Investigate

#### Warning Alerts
- **Deprecated Schema Usage:** >50% of documents still on v1.0 30 days before sunset → Email users
- **Slow Migration:** P95 duration >30s → Optimize migration logic

---

## Open Questions & Decisions

1. **Schema Version Header:** Should clients send `Accept-Schema: v1.1` header or rely on auto-upgrade? (Explicit vs implicit)
2. **Migration Rollback:** Allow users to downgrade v2.0 → v1.1 or one-way only? (Data loss risk if downgrading)
3. **Large Document Migration:** For 1000+ slide decks, run migration async (job queue) or block API call? (UX vs complexity)
4. **Version Sunset Frequency:** Sunset every 12 months (predictable) or on-demand (flexible)? (Balance stability vs agility)
5. **Schema Registry:** Centralize schemas in separate repo/service or embed in monorepo? (Governance vs convenience)

---

## References

- **Drizzle ORM Migrations:** https://orm.drizzle.team/docs/migrations
- **JSON Schema Spec:** https://json-schema.org/
- **PostgreSQL Versioning Best Practices:** https://wiki.postgresql.org/wiki/Versioning
- **Stripe API Versioning:** https://stripe.com/docs/api/versioning (inspiration for date-based versions)
- **Semantic Versioning:** https://semver.org/
