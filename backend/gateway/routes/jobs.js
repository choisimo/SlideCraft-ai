import { getJob, jobEvents } from '../../lib/jobs.js';
export function registerJobRoutes(app, prefix){
  app.get(`${prefix}/jobs/:id`, (req,res) => {
    const job = getJob(req.params.id);
    if (!job) return res.status(404).json({ error:'Not found' });
    res.json(job);
  });
  app.get(`${prefix}/jobs/:id/events`, (req,res) => {
    const { id } = req.params;
    const job = getJob(id);
    if (!job) return res.status(404).end();
    res.set({ 'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive' });
    res.write(':ok\n\n');
    const handler = (j) => { if (j.id === id) { res.write(`data: ${JSON.stringify(j)}\n\n`); }};
    jobEvents.on(`update:${id}`, handler);
    req.on('close', () => jobEvents.off(`update:${id}`, handler));
  });
}
