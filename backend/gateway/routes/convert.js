import { createJob, simulateConvert } from '../../lib/jobs.js';
export function registerConvertRoutes(app, prefix){
  app.post(`${prefix}/convert`, (req,res) => {
    const { objectKey, sourceType } = req.body || {};
    if (!objectKey || !sourceType) return res.status(400).json({ error:'Missing objectKey or sourceType' });
    const job = createJob('convert', { objectKey, sourceType });
    simulateConvert(job);
    res.status(202).json({ jobId: job.id });
  });
}
