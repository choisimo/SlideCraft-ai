// Task Master Schema & ID strategy
// Focus: deterministic parsing from PRD docs (frontend/backend) without AI calls.
// We keep schema lightweight to avoid heavy runtime deps (zod already installed though).

import { z } from 'zod';

// ID Strategy:
//  - Domain prefix: F (frontend) / B (backend)
//  - Phase: numeric extracted from heading (e.g., Phase 2 -> 2) or 0 for foundations
//  - Epic: sequential within phase (e.g., F2.1)
//  - Task levels:
//      Epic base id: F2.1
//      Story index -> F2.1-S1
//      Task index -> F2.1-T1 (flat tasks list under epic Tasks: section)
//      Generated subtask (future) -> append .1, .2 etc (e.g., F2.1-T1.1)
//  - Tests / Acceptance / Risks / Dependencies are attributes of the epic or task rather than separate IDs.
//  - Backend epics already encoded as "Epic B1.2"; we parse B + phase + . + epicIndex.

export const taskStatusEnum = z.enum(['pending','in-progress','done','deferred']);
export const priorityEnum = z.enum(['low','medium','high']);

export const subtaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: taskStatusEnum.default('pending'),
  description: z.string().optional(),
  dependencies: z.array(z.string()).optional()
});

export const taskSchema = z.object({
  id: z.string(),
  type: z.enum(['epic','story','task']),
  domain: z.enum(['frontend','backend']),
  phase: z.number(),
  epicId: z.string().optional(), // for stories & tasks
  parentId: z.string().optional(), // direct parent (epic for stories, story/epic for tasks)
  index: z.number(), // ordering within its section
  title: z.string(),
  storyRef: z.string().optional(),
  status: taskStatusEnum.default('pending'),
  priority: priorityEnum.optional(),
  description: z.string().optional(),
  capabilities: z.array(z.string()).optional(),
  stories: z.array(z.string()).optional(), // only on epics (list of story IDs)
  tasks: z.array(z.string()).optional(), // only on epics OR stories (list of task IDs)
  subtasks: z.array(subtaskSchema).optional(),
  tests: z.array(z.string()).optional(),
  acceptance: z.array(z.string()).optional(),
  dependencies: z.array(z.string()).optional(),
  risks: z.array(z.string()).optional(),
  estimateDays: z.number().optional(),
});

export const tasksFileSchema = z.object({
  meta: z.object({
    project: z.string(),
    generatedAt: z.string(),
    sources: z.array(z.string()),
    version: z.string().default('1.0.0')
  }),
  items: z.array(taskSchema)
});

export function validateTasks(data) {
  return tasksFileSchema.parse(data);
}

export function makeId(parts) {
  return parts.filter(Boolean).join('-');
}

export function parseEstimate(line) {
  // Extract number before 'd.' e.g., 'Estimate: 5d.'
  const m = line.match(/Estimate:\s*(\d+)d/i);
  return m ? Number(m[1]) : undefined;
}
