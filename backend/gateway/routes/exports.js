import { Router } from 'express';
import { logger } from '../../lib/logger.js';
import { getStorage } from '../../lib/storage/index.js';

const storage = getStorage();

const activeExports = new Map();

export function registerExportRoutes(app, prefix) {
  const router = Router();

  router.post('/init', async (req, res) => {
    try {
      const { documentId, format, options = {} } = req.body;

      if (!documentId) {
        return res.status(400).json({ error: 'document_id_required' });
      }

      if (!['pptx', 'pdf'].includes(format)) {
        return res.status(400).json({ error: 'invalid_format', supported: ['pptx', 'pdf'] });
      }

      const exportId = `export_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      const exportJob = {
        exportId,
        documentId,
        format,
        options: {
          includeNotes: options.includeNotes ?? true,
          preserveAnimations: options.preserveAnimations ?? false,
          pageSize: options.pageSize ?? 'A4',
          orientation: options.orientation ?? 'landscape',
          quality: options.quality ?? 'high',
          includeSlideNumbers: options.includeSlideNumbers ?? true,
          startSlide: options.startSlide ?? 1,
          endSlide: options.endSlide ?? null,
        },
        status: 'pending',
        progress: 0,
        message: 'Export queued',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      activeExports.set(exportId, exportJob);

      logger.info('export_initiated', { exportId, documentId, format });

      res.status(202).json({
        exportId,
        status: 'pending',
        message: 'Export job created',
      });

      setTimeout(() => simulateExportProgress(exportId), 1000);

    } catch (error) {
      logger.error('export_init_failed', error);
      res.status(500).json({ error: 'export_init_failed' });
    }
  });

  router.get('/:exportId', (req, res) => {
    const { exportId } = req.params;

    const exportJob = activeExports.get(exportId);

    if (!exportJob) {
      return res.status(404).json({ error: 'export_not_found' });
    }

    const response = {
      exportId: exportJob.exportId,
      documentId: exportJob.documentId,
      format: exportJob.format,
      status: exportJob.status,
      progress: exportJob.progress,
      message: exportJob.message,
      createdAt: exportJob.createdAt,
      updatedAt: exportJob.updatedAt,
    };

    if (exportJob.status === 'completed') {
      response.downloadUrl = exportJob.downloadUrl;
      response.expiresAt = exportJob.expiresAt;
      response.fileSize = exportJob.fileSize;
    } else if (exportJob.status === 'failed') {
      response.error = exportJob.error;
    }

    res.json(response);
  });

  router.get('/:exportId/download', async (req, res) => {
    const { exportId } = req.params;

    const exportJob = activeExports.get(exportId);

    if (!exportJob) {
      return res.status(404).json({ error: 'export_not_found' });
    }

    if (exportJob.status !== 'completed') {
      return res.status(400).json({ error: 'export_not_ready', status: exportJob.status });
    }

    try {
      const fileBuffer = await storage.downloadFile(exportJob.filePath);
      const contentType = exportJob.format === 'pptx'
        ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
        : 'application/pdf';

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${exportJob.documentId}.${exportJob.format}"`);
      res.setHeader('Content-Length', fileBuffer.length);

      res.send(fileBuffer);

    } catch (error) {
      logger.error('export_download_failed', { exportId, error });
      res.status(500).json({ error: 'download_failed' });
    }
  });

  router.delete('/:exportId', (req, res) => {
    const { exportId } = req.params;

    const exportJob = activeExports.get(exportId);

    if (!exportJob) {
      return res.status(404).json({ error: 'export_not_found' });
    }

    if (exportJob.status === 'processing') {
      exportJob.status = 'cancelled';
      exportJob.message = 'Export cancelled by user';
      exportJob.updatedAt = new Date().toISOString();
    }

    activeExports.delete(exportId);

    logger.info('export_cancelled', { exportId });

    res.json({ exportId, status: 'cancelled' });
  });

  app.use(`${prefix}/exports`, router);
  logger.info('Export routes registered');
}

function simulateExportProgress(exportId) {
  const exportJob = activeExports.get(exportId);
  if (!exportJob || exportJob.status === 'cancelled') return;

  const stages = [
    { progress: 20, message: 'Loading document...', delay: 1000 },
    { progress: 40, message: 'Processing slides...', delay: 1500 },
    { progress: 60, message: 'Generating export...', delay: 2000 },
    { progress: 80, message: 'Uploading file...', delay: 1500 },
    { progress: 100, message: 'Export complete', delay: 500 },
  ];

  let currentStage = 0;

  async function processStage() {
    const job = activeExports.get(exportId);
    if (!job || job.status === 'cancelled') return;

    if (currentStage >= stages.length) {
      job.status = 'completed';
      job.progress = 100;
      job.message = 'Export ready for download';
      job.filePath = `exports/${job.documentId}/${exportId}.${job.format}`;
      job.downloadUrl = `/api/v1/exports/${exportId}/download`;
      job.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      
      const dummyContent = Buffer.from(`Dummy ${job.format.toUpperCase()} export for ${job.documentId}`);
      try {
        await storage.uploadFile(job.filePath, dummyContent, {
          contentType: job.format === 'pptx' 
            ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
            : 'application/pdf',
          documentId: job.documentId,
          exportId: exportId
        });
        job.fileSize = dummyContent.length;
      } catch (error) {
        logger.error('export_file_creation_failed', { exportId, error });
        job.status = 'failed';
        job.error = 'Failed to create export file';
        job.updatedAt = new Date().toISOString();
        return;
      }
      
      job.updatedAt = new Date().toISOString();
      logger.info('export_completed', { exportId, format: job.format });
      return;
    }

    const stage = stages[currentStage];
    job.status = 'processing';
    job.progress = stage.progress;
    job.message = stage.message;
    job.updatedAt = new Date().toISOString();

    currentStage++;
    setTimeout(processStage, stage.delay);
  }

  processStage();
}
