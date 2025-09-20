import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import { logger } from './logger.js';

export const jobEvents = new EventEmitter();
const jobs = new Map();

export function createJob(type, payload = {}) {
  const job = {
    id: randomUUID(),
    type,
    status: 'pending',
    progress: 0,
    payload,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  jobs.set(job.id, job);
  jobEvents.emit('update', job);
  jobEvents.emit(`update:${job.id}`, job);
  return job;
}

export function updateJob(id, partial) {
  const job = jobs.get(id);
  if (!job) return;
  Object.assign(job, partial, { updatedAt: new Date().toISOString() });
  jobEvents.emit('update', job);
  jobEvents.emit(`update:${job.id}`, job);
  return job;
}

export function getJob(id){ return jobs.get(id); }
export function listJobs(){ return Array.from(jobs.values()); }

// Simulated conversion pipeline (mock)
export function simulateConvert(job){
  updateJob(job.id, { status:'running', progress:5 });
  setTimeout(()=>updateJob(job.id, { progress:25 }), 300);
  setTimeout(()=>updateJob(job.id, { progress:60 }), 700);
  setTimeout(()=>updateJob(job.id, { progress:90 }), 1100);
  setTimeout(()=>{
    updateJob(job.id, { progress:100, status:'succeeded', result:{ documentId: 'doc_'+job.id.slice(0,8) } });
    logger.info('Job completed', job.id);
  }, 1500);
}
