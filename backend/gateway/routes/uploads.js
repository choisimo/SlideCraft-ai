import { randomUUID } from 'crypto';
export function registerUploadRoutes(app, prefix){
  app.post(`${prefix}/uploads/init`, (req,res) => {
    const { filename, size, contentType } = req.body || {};
    if (!filename || !size || !contentType) return res.status(400).json({ error:'Missing fields'});
    const uploadId = randomUUID();
    const objectKey = `original/${uploadId}/${filename}`;
    res.json({ uploadId, objectKey, parts:[], completeUrl: `${prefix}/uploads/${uploadId}/complete` });
  });
}
