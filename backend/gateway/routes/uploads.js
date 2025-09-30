import { randomUUID } from 'crypto';
import multer from 'multer';
import { getStorage } from '../../lib/storage/index.js';

const upload = multer({ storage: multer.memoryStorage() });

const multipartUploads = new Map();

export function registerUploadRoutes(app, prefix) {
  const storage = getStorage();

  app.post(`${prefix}/uploads/init`, async (req, res) => {
    try {
      const { filename, size, contentType } = req.body || {};
      if (!filename || !size || !contentType) {
        return res.status(400).json({ error: 'Missing fields: filename, size, contentType' });
      }

      const uploadId = randomUUID();
      const objectKey = `original/${uploadId}/${filename}`;

      const result = await storage.initMultipartUpload(objectKey, {
        filename,
        size: String(size),
        contentType
      });

      multipartUploads.set(uploadId, {
        uploadId: result.uploadId,
        objectKey,
        filename,
        size,
        contentType,
        parts: []
      });

      res.json({
        uploadId,
        objectKey,
        completeUrl: `${prefix}/uploads/${uploadId}/complete`
      });
    } catch (err) {
      console.error('Upload init error:', err);
      res.status(500).json({ error: 'Failed to initialize upload' });
    }
  });

  app.post(`${prefix}/uploads/:uploadId/parts/:partNumber`, upload.single('file'), async (req, res) => {
    try {
      const { uploadId, partNumber } = req.params;
      const uploadData = multipartUploads.get(uploadId);

      if (!uploadData) {
        return res.status(404).json({ error: 'Upload not found' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'No file provided' });
      }

      const result = await storage.uploadPart(
        uploadData.uploadId,
        parseInt(partNumber),
        req.file.buffer
      );

      uploadData.parts.push({
        partNumber: result.partNumber,
        etag: result.etag,
        size: req.file.buffer.length
      });

      res.json(result);
    } catch (err) {
      console.error('Upload part error:', err);
      res.status(500).json({ error: 'Failed to upload part' });
    }
  });

  app.post(`${prefix}/uploads/:uploadId/complete`, async (req, res) => {
    try {
      const { uploadId } = req.params;
      const uploadData = multipartUploads.get(uploadId);

      if (!uploadData) {
        return res.status(404).json({ error: 'Upload not found' });
      }

      const result = await storage.completeMultipartUpload(
        uploadData.uploadId,
        uploadData.parts
      );

      multipartUploads.delete(uploadId);

      res.json({
        uploadId,
        objectKey: uploadData.objectKey,
        size: result.size,
        status: 'completed'
      });
    } catch (err) {
      console.error('Upload complete error:', err);
      res.status(500).json({ error: 'Failed to complete upload' });
    }
  });

  app.delete(`${prefix}/uploads/:uploadId`, async (req, res) => {
    try {
      const { uploadId } = req.params;
      const uploadData = multipartUploads.get(uploadId);

      if (!uploadData) {
        return res.status(404).json({ error: 'Upload not found' });
      }

      await storage.abortMultipartUpload(uploadData.uploadId);
      multipartUploads.delete(uploadId);

      res.json({ status: 'aborted' });
    } catch (err) {
      console.error('Upload abort error:', err);
      res.status(500).json({ error: 'Failed to abort upload' });
    }
  });

  app.post(`${prefix}/uploads/direct`, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file provided' });
      }

      const uploadId = randomUUID();
      const objectKey = `original/${uploadId}/${req.file.originalname}`;

      const result = await storage.uploadFile(objectKey, req.file.buffer, {
        filename: req.file.originalname,
        contentType: req.file.mimetype,
        size: String(req.file.size)
      });

      res.json({
        uploadId,
        objectKey: result.path,
        size: result.size,
        status: 'completed'
      });
    } catch (err) {
      console.error('Direct upload error:', err);
      res.status(500).json({ error: 'Failed to upload file' });
    }
  });
}
