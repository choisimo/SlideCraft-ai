# Release & Rollback Runbook

**Version:** 1.0  
**Status:** Draft  
**Last Updated:** 2025-09-30

---

## Overview

This runbook defines deployment procedures, release strategies, rollback mechanisms, and operational safeguards for SlideCraft-ai production environments. All releases must follow this process to ensure zero-downtime deployments and rapid recovery from incidents.

**Target Platforms:**
- **Gateway/API:** Cloudflare Workers (serverless)
- **Workers:** Cloudflare Queues + Workers (convert, export, AI)
- **Database:** Cloudflare D1 (SQLite edge)
- **Storage:** Cloudflare R2 (object storage)
- **Realtime:** Cloudflare Durable Objects

---

## Deployment Strategy

### Blue/Green Deployment Model

**Infrastructure:**
- **Blue Environment:** Current production (100% traffic)
- **Green Environment:** New release candidate (0% traffic initially)
- **Traffic Routing:** Cloudflare Workers Routes with weighted traffic distribution

**Deployment Phases:**

1. **Canary Phase (10% traffic, 30min)**
   - Route 10% of traffic to green environment
   - Monitor error rates, latency, resource usage
   - Auto-rollback if error rate >0.5% or P99 latency >5s

2. **Ramp Phase (50% traffic, 1hr)**
   - Increase to 50% traffic split
   - Validate database migration compatibility (N and N-1 schema support)
   - Monitor queue depth, worker saturation

3. **Full Rollout (100% traffic)**
   - Complete traffic cutover to green
   - Blue environment remains hot standby for 24hrs
   - Decommission blue after monitoring window

**Rollback Window:**
- **Instant:** 0-30min (canary failures → automatic)
- **Fast:** 30min-24hrs (manual decision → 5min cutover)
- **Complex:** 24hrs+ (requires database rollback → see Migration Rollback)

---

## Pre-Deployment Checklist

### 1. Code & Dependencies (T-48hrs)

- [ ] **Dependency Audit:** `npm audit --production` (no HIGH/CRITICAL vulnerabilities)
- [ ] **OpenAPI Validation:** `npx spectral lint docs/backend/openapi.yaml` (no errors)
- [ ] **TypeScript Build:** `npm run build` (no type errors)
- [ ] **Linting:** `npm run lint` (no violations)
- [ ] **Unit Tests:** `npm test` (100% pass, >80% coverage)
- [ ] **Integration Tests:** `npm run test:integration` (all workflows pass)
- [ ] **Security Scan:** `npm run security:scan` (Snyk/SonarQube checks)

### 2. Database Migrations (T-24hrs)

- [ ] **Migration Dry-Run:** Execute migrations against staging copy of production DB
- [ ] **Schema Compatibility:** Verify N-1 version support (e.g., v1.1 + v2.0 coexist)
- [ ] **Rollback Scripts:** Generate reverse migration SQL (stored in `migrations/rollback/`)
- [ ] **Data Backup:** Full D1 snapshot + export to R2 (`backups/db-{timestamp}.sql`)
- [ ] **Migration Performance:** Test on dataset matching production scale (10k+ documents)
- [ ] **Index Validation:** Confirm indexes exist for new columns (query plan analysis)

### 3. Feature Flags & Configuration (T-12hrs)

- [ ] **Feature Flags:** Set new features to `disabled` (gradual rollout post-deploy)
- [ ] **Environment Variables:** Validate all secrets in Workers environment (no plaintext)
- [ ] **Rate Limits:** Verify tier-based quotas configured correctly
- [ ] **AI Gateway Config:** Confirm model versions, fallback chains, timeout settings
- [ ] **Observability:** Enable tracing for new endpoints (Honeycomb/Datadog sampling)

### 4. Runbook & Communication (T-6hrs)

- [ ] **Incident Contacts:** Update on-call rotation (PagerDuty/Opsgenie)
- [ ] **Rollback Plan:** Document rollback steps in `#incidents` Slack channel (pinned message)
- [ ] **Customer Notice:** Publish maintenance window (if downtime expected, API status page)
- [ ] **Team Briefing:** Sync deployment window, roles (deployer, observer, DBA, SRE)

### 5. Deployment Approval (T-1hr)

- [ ] **Change Advisory Board (CAB):** Approval from eng lead + product owner (high-risk changes)
- [ ] **Deployment Freeze Check:** No active incidents, no conflicting deployments
- [ ] **Final Smoke Test:** Execute critical path tests in staging (login → upload → convert → export)

---

## Deployment Procedure

### Phase 1: Pre-Flight (T-0 to T+5min)

**1.1 Enable Maintenance Mode (Optional - Breaking Changes Only)**
```bash
# Set global read-only flag (allows reads, blocks writes)
wrangler kv:key put --binding=CONFIG "maintenance_mode" "true"
```

**1.2 Deploy Green Environment**
```bash
# Deploy to green environment (not yet receiving traffic)
wrangler deploy --env=green --route="*.slidecraft.ai/api/v1/*"
```

**1.3 Execute Database Migrations**
```bash
# Run migrations against production D1
npm run migrate:prod -- --dry-run=false

# Verify migration status
npm run migrate:status
# Expected: All migrations in 'succeeded' state
```

**1.4 Warm Up Green Environment**
```bash
# Send synthetic traffic to populate caches
npm run warmup:green -- --requests=1000 --rps=50
```

### Phase 2: Canary Rollout (T+5min to T+35min)

**2.1 Start Canary (10% Traffic)**
```bash
# Update Workers route to split traffic
wrangler routes update --weight blue=90 green=10
```

**2.2 Monitor Canary Metrics (30min window)**

**Key Metrics:**
- **Error Rate:** <0.5% (vs baseline <0.1%)
- **P50 Latency:** <200ms (vs baseline <150ms)
- **P99 Latency:** <5s (vs baseline <2s)
- **Queue Depth:** <100 messages (convert, export queues)
- **Worker CPU Time:** <50ms average per request
- **Database Connections:** <80% pool utilization

**Dashboards:**
- Grafana: `https://grafana.slidecraft.ai/d/release-canary`
- Cloudflare Analytics: Workers → Metrics

**Automated Canary Analysis:**
```bash
# Run canary validation script (auto-rollback if thresholds exceeded)
npm run canary:validate -- --duration=30m --auto-rollback=true
```

**2.3 Canary Decision Point**

**IF canary passes:**
```bash
# Proceed to Phase 3 (ramp to 50%)
wrangler routes update --weight blue=50 green=50
```

**IF canary fails (see Rollback section):**
```bash
# Auto-rollback triggered by monitoring
# Manual rollback if needed:
npm run rollback:canary
```

### Phase 3: Ramp to 50% (T+35min to T+95min)

**3.1 Increase Traffic to 50%**
- Monitor same metrics as canary (1hr window)
- Validate database query performance (no N+1 queries, index usage)
- Check worker memory usage (no leaks, <128MB per invocation)

**3.2 Schema Compatibility Validation**
```bash
# Verify mixed-version handling (blue=v1.1, green=v2.0)
npm run test:schema-compat -- --blue-version=v1.1 --green-version=v2.0

# Expected: No validation errors, auto-upgrade working
```

**3.3 Feature Flag Gradual Rollout (Optional)**
```bash
# Enable new features for 10% of users (LaunchDarkly/Split.io)
npm run feature:enable -- --flag=ai_suggestions --rollout=10
```

### Phase 4: Full Rollout (T+95min to T+100min)

**4.1 Complete Cutover**
```bash
# Route 100% traffic to green
wrangler routes update --weight blue=0 green=100

# Disable maintenance mode (if enabled)
wrangler kv:key put --binding=CONFIG "maintenance_mode" "false"
```

**4.2 Post-Deployment Verification**

**Smoke Tests (Automated):**
```bash
npm run smoke:prod -- --critical-paths-only

# Critical paths tested:
# 1. User login (JWT issuance)
# 2. Upload init → convert → document creation
# 3. AI chat request → response
# 4. Export PPTX generation
# 5. Realtime collaboration (presence updates)
```

**Manual Verification:**
- [ ] Admin dashboard loads (`/admin/metrics`)
- [ ] Stripe webhook processing (check logs for recent payments)
- [ ] Email delivery (test password reset flow)
- [ ] External integrations (OAuth, AI Gateway, Stripe)

**4.3 Mark Blue Environment as Standby**
```bash
# Keep blue environment hot for 24hrs (quick rollback if needed)
# After 24hrs, tear down:
wrangler delete --env=blue
```

---

## Rollback Procedures

### Automatic Rollback Triggers

**Monitoring alerts configured to auto-rollback:**

1. **Error Rate Spike:** >0.5% error rate sustained for 5min
   ```javascript
   // Cloudflare Worker: Auto-rollback logic
   if (errorRate > 0.005 && duration > 300) {
     await rollback({ reason: 'error_rate_threshold', env: 'green' })
   }
   ```

2. **Latency Degradation:** P99 >5s sustained for 10min
3. **Database Errors:** >10 connection errors/min
4. **Worker Crashes:** >5 unhandled exceptions/min
5. **Queue Backlog:** >1000 messages pending for 15min

### Manual Rollback: Application Layer (Fast - 5min)

**Use Case:** Bug in application code, no database schema changes

**Steps:**
```bash
# 1. Immediate traffic cutover to blue (old version)
wrangler routes update --weight blue=100 green=0

# 2. Verify rollback success
npm run smoke:prod -- --env=blue

# 3. Disable new feature flags
npm run feature:disable -- --all-new-flags

# 4. Incident notification
npm run notify:rollback -- --severity=high --reason="Production bug in green deployment"

# 5. Preserve logs for postmortem
wrangler tail --env=green > logs/rollback-{timestamp}.log
```

**Validation:**
- [ ] Error rate returns to baseline (<0.1%)
- [ ] User-reported incidents stop
- [ ] All critical paths functional

**Rollback Time:** ~5 minutes

### Manual Rollback: Database Migration (Complex - 30min)

**Use Case:** Schema migration caused data corruption or incompatibility

**Prerequisites:**
- Reverse migration script exists (`migrations/rollback/20250930_v2.0_downgrade.sql`)
- Database backup available (`backups/db-{timestamp}.sql`)

**Steps:**

**1. Stop All Workers (Prevent Further Data Corruption)**
```bash
# Scale workers to 0 (queue consumers)
wrangler queues consumer remove --queue=convert --consumer=convert-worker
wrangler queues consumer remove --queue=export --consumer=export-worker

# Enable maintenance mode (block API writes)
wrangler kv:key put --binding=CONFIG "maintenance_mode" "true"
```

**2. Execute Reverse Migration**
```bash
# Run rollback migration (auto-generated during deployment)
npm run migrate:rollback -- --target-version=v1.1

# Example: Downgrade v2.0 → v1.1
# - Drop new columns: master_slide_id, percentage_layout
# - Restore pixel-based positioning from backup columns
```

**3. Validate Data Integrity**
```bash
# Run data integrity checks
npm run db:validate -- --version=v1.1

# Expected:
# - All documents have valid schema_version='v1.1'
# - No orphaned records (foreign key integrity)
# - Indexes rebuilt successfully
```

**4. Restore Application Traffic (Blue Environment)**
```bash
# Route traffic to blue (v1.1 compatible)
wrangler routes update --weight blue=100 green=0

# Re-enable workers
wrangler queues consumer add --queue=convert --consumer=convert-worker
wrangler queues consumer add --queue=export --consumer=export-worker

# Disable maintenance mode
wrangler kv:key put --binding=CONFIG "maintenance_mode" "false"
```

**5. Data Recovery (If Corruption Occurred)**
```bash
# Restore from backup (last resort)
npm run db:restore -- --backup=backups/db-{timestamp}.sql --target=production

# Re-run critical jobs (if data lost)
npm run jobs:requeue -- --queue=convert --time-range="last-30min"
```

**Rollback Time:** 30-60 minutes (depending on data volume)

### Point-in-Time Recovery (Disaster Scenario)

**Use Case:** Complete data loss, irrecoverable migration failure

**Recovery Steps:**

1. **Restore Database from Snapshot**
   ```bash
   # Cloudflare D1: Restore from automatic daily snapshot
   wrangler d1 restore --database=slidecraft-prod --snapshot=2025-09-29-23:59:00
   ```

2. **Replay Transaction Logs (If Available)**
   ```bash
   # Apply WAL (Write-Ahead Log) changes since snapshot
   npm run db:replay-wal -- --from=2025-09-29-23:59:00 --to=2025-09-30-10:00:00
   ```

3. **Rebuild Search Indexes**
   ```bash
   npm run search:reindex -- --full
   ```

4. **Verify Data Completeness**
   ```bash
   # Compare document counts, checksums
   npm run db:audit -- --compare-with-backup
   ```

**Recovery Time Objective (RTO):** 2 hours  
**Recovery Point Objective (RPO):** 1 hour (transaction log replay)

---

## Post-Deployment Monitoring

### 24-Hour Monitoring Window

**Metrics to Watch:**

| Metric | Baseline | Alert Threshold | Action |
|--------|----------|-----------------|--------|
| Error Rate | <0.1% | >0.3% sustained 15min | Investigate, prepare rollback |
| P99 Latency | <2s | >5s sustained 10min | Check DB query performance |
| Database CPU | <40% | >70% sustained 30min | Optimize queries, scale D1 |
| Queue Depth | <50 msgs | >500 msgs sustained 15min | Scale workers, investigate bottleneck |
| Worker Memory | <64MB avg | >100MB avg | Check for memory leaks |
| Auth Failures | <0.01% | >0.1% | Verify JWT keys, OAuth config |

**Automated Alerts:**
- PagerDuty: Critical thresholds (error rate, downtime)
- Slack: Warning thresholds (latency, queue depth)
- Email: Daily deployment summary

### Health Checks

**Endpoint:** `GET /health`

**Response (Healthy):**
```json
{
  "status": "healthy",
  "version": "v2.0.1",
  "checks": {
    "database": { "status": "up", "latency_ms": 12 },
    "storage": { "status": "up", "latency_ms": 45 },
    "ai_gateway": { "status": "up", "latency_ms": 320 },
    "queue_convert": { "depth": 23, "consumers": 5 },
    "queue_export": { "depth": 8, "consumers": 3 }
  },
  "deployment": {
    "environment": "production",
    "deployed_at": "2025-09-30T10:00:00Z",
    "deployed_by": "github-actions"
  }
}
```

**Monitoring Script:**
```bash
# Continuously monitor health endpoint
npm run health:watch -- --interval=30s --alert-on-failure
```

### Log Analysis

**Key Log Patterns to Monitor:**

1. **Error Patterns:**
   ```bash
   # Search for new error types (not present in blue environment)
   npm run logs:diff -- --blue-env --green-env --filter=ERROR
   ```

2. **Slow Query Detection:**
   ```sql
   -- D1 query log analysis
   SELECT query, AVG(duration_ms), COUNT(*)
   FROM query_logs
   WHERE timestamp > NOW() - INTERVAL '1 hour'
   GROUP BY query
   HAVING AVG(duration_ms) > 1000
   ORDER BY AVG(duration_ms) DESC;
   ```

3. **Authentication Anomalies:**
   ```bash
   # Detect unusual auth patterns
   npm run logs:auth -- --filter="failed_login|token_expired" --threshold=100
   ```

### Gradual Feature Rollout (Post-Deploy)

**After successful deployment, enable new features incrementally:**

```bash
# Day 1: Enable for internal team (10 users)
npm run feature:enable -- --flag=ai_suggestions --users=@slidecraft.ai

# Day 2: Enable for 10% of pro users
npm run feature:enable -- --flag=ai_suggestions --tier=pro --rollout=10

# Day 7: Enable for all users
npm run feature:enable -- --flag=ai_suggestions --rollout=100
```

**Rollback Feature Flags (if issues detected):**
```bash
npm run feature:disable -- --flag=ai_suggestions
```

---

## Incident Response Integration

### When to Rollback vs. Hotfix

**Rollback Decision Matrix:**

| Scenario | Severity | Impact | Action | Timeline |
|----------|----------|--------|--------|----------|
| UI bug (no data loss) | Low | <5% users | Hotfix in next release | 24-48hrs |
| API error (specific endpoint) | Medium | 10-30% users | Hotfix + canary deploy | 2-4hrs |
| Data corruption | High | Any users | **Immediate rollback** | <30min |
| Auth failure (all users) | Critical | 100% users | **Immediate rollback** | <5min |
| Performance degradation | Medium | >50% users | Rollback if >2hrs to fix | 2hrs |

**Hotfix Procedure (Skip Canary for Critical Fixes):**
```bash
# Emergency hotfix deployment (bypasses canary)
npm run deploy:hotfix -- --skip-canary --reason="Auth service outage"

# Still requires:
# 1. Code review (2 approvers for production)
# 2. Smoke tests
# 3. Incident ticket created
```

### Incident Runbook

**Triggered by:** Auto-rollback, manual rollback, or deployment failure

**Steps:**

1. **Declare Incident (T+0)**
   ```bash
   npm run incident:create -- --severity=high --title="Production rollback - v2.0.1"
   ```
   - Slack: Post in `#incidents` channel
   - Status page: Update `https://status.slidecraft.ai` (degraded performance)
   - Page on-call engineer (PagerDuty)

2. **Execute Rollback (T+5min)** - See Rollback Procedures

3. **Preserve Evidence (T+10min)**
   ```bash
   # Capture logs, metrics, traces
   npm run incident:capture -- --id={incident_id} --retention=90days
   ```

4. **Root Cause Analysis (T+2hrs)**
   - Blameless postmortem template: `docs/incidents/postmortem-{id}.md`
   - Required sections: Timeline, root cause, action items, prevention

5. **Corrective Actions (T+24hrs)**
   - File bug tickets for fixes
   - Update runbook with lessons learned
   - Improve monitoring/alerting if blind spots found

---

## Deployment Runbook Quick Reference

### Pre-Deploy Commands
```bash
npm run checklist:pre-deploy     # Run all pre-flight checks
npm run migrate:dry-run           # Test migrations on staging
npm run backup:db                 # Snapshot database to R2
npm run security:scan             # Vulnerability check
```

### Deploy Commands
```bash
wrangler deploy --env=green                      # Deploy to green
npm run warmup:green                             # Warm up caches
wrangler routes update --weight blue=90 green=10 # Start canary
npm run canary:validate --auto-rollback=true     # Monitor canary
wrangler routes update --weight blue=0 green=100 # Full rollout
npm run smoke:prod                               # Post-deploy tests
```

### Rollback Commands
```bash
npm run rollback:instant                    # Fast rollback (app only)
npm run rollback:with-migration             # Rollback with DB restore
wrangler routes update --weight blue=100    # Traffic cutover to old
npm run incident:create -- --severity=high  # Start incident process
```

### Monitoring Commands
```bash
npm run health:watch              # Continuous health monitoring
npm run logs:tail -- --env=green  # Real-time log streaming
npm run metrics:dashboard         # Open Grafana dashboard
npm run alerts:list               # Show active alerts
```

---

## Disaster Recovery

### Backup Strategy

**Automated Backups:**
- **Database:** Daily snapshots at 02:00 UTC (Cloudflare D1 auto-backup)
- **Storage:** R2 versioning enabled (30-day version retention)
- **Configuration:** Workers secrets backed up to secure vault (1Password/HashiCorp Vault)
- **Code:** Git tags for every production release (`v2.0.1`, `v2.0.2`)

**Backup Validation:**
```bash
# Monthly backup restoration test
npm run backup:test-restore -- --snapshot=latest --target=staging
```

### Business Continuity

**Maximum Tolerable Downtime (MTD):** 4 hours  
**Recovery Time Objective (RTO):** 2 hours  
**Recovery Point Objective (RPO):** 1 hour

**Disaster Scenarios:**

| Scenario | Recovery Procedure | RTO |
|----------|-------------------|-----|
| Worker outage | Cloudflare auto-failover to edge | 0min (HA) |
| D1 database corruption | Restore from snapshot + WAL replay | 2hrs |
| R2 region failure | Cloudflare replicates to alternate region | 15min |
| Complete Cloudflare outage | Failover to AWS backup environment | 4hrs |

**AWS Failover (Catastrophic Only):**
```bash
# Switch DNS to AWS backup stack
npm run failover:aws -- --confirm=true

# Services:
# - API Gateway → AWS Lambda
# - D1 → Amazon Aurora Serverless
# - R2 → Amazon S3
# - Queues → Amazon SQS
```

---

## Compliance & Audit

### Change Management Records

**Every deployment must log:**
- Deployer identity (GitHub user)
- Deployment timestamp
- Code commit SHA
- Migration scripts executed
- Rollback performed (if any)
- Approvers (CAB sign-off)

**Audit Trail Storage:**
```bash
# Append to immutable audit log (R2 WORM storage)
npm run audit:log-deployment -- --release=v2.0.1 --approver=eng-lead
```

**Retention:** 7 years (SOC2/GDPR compliance)

### SOC2 Controls Mapping

| Control | Runbook Section | Evidence |
|---------|-----------------|----------|
| CC7.2 (Change Management) | Pre-Deployment Checklist | CAB approval records |
| CC7.3 (Quality Assurance) | Deployment Procedure | Test results, smoke tests |
| CC7.4 (Rollback Procedures) | Rollback section | Incident logs, RTO metrics |
| A1.2 (Availability SLA) | Monitoring, Health Checks | Uptime dashboard (>99.9%) |

---

## Appendix

### Deployment Frequency

**Target Cadence:**
- **Minor releases:** Weekly (Tuesdays, 10am PT)
- **Patch releases:** As needed (hotfixes within 4hrs)
- **Major releases:** Monthly (first Tuesday of month)

**Deployment Windows:**
- **Allowed:** Tue-Thu, 10am-4pm PT (business hours, team available)
- **Restricted:** Fri-Mon, holidays, during incidents

### Team Roles

| Role | Responsibilities | Contact |
|------|-----------------|---------|
| **Release Manager** | Coordinates deployment, monitors canary | @release-team |
| **Database Admin** | Executes migrations, handles rollbacks | @dba-team |
| **SRE** | Monitors metrics, triggers rollbacks | @sre-oncall |
| **Product Owner** | Approves feature flags, signs off on CAB | @product |
| **Incident Commander** | Leads response if rollback triggered | @oncall-lead |

### Tools & Dashboards

- **Deployment Pipeline:** GitHub Actions (`/.github/workflows/deploy.yml`)
- **Monitoring:** Grafana (`https://grafana.slidecraft.ai`)
- **Logging:** Cloudflare Workers Logs + Honeycomb
- **Alerting:** PagerDuty + Slack (`#alerts`, `#incidents`)
- **Feature Flags:** LaunchDarkly (`https://app.launchdarkly.com`)
- **Status Page:** `https://status.slidecraft.ai` (StatusPage.io)

---

**Document Owner:** SRE Team  
**Review Cycle:** Quarterly (after each major release)  
**Last Reviewed:** 2025-09-30  
**Next Review:** 2025-12-30
