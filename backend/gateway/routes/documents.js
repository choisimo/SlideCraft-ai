import { randomUUID } from 'crypto';

const documents = new Map();

export function registerDocumentsRoutes(app, prefix) {
  app.post(`${prefix}/documents`, async (req, res) => {
    try {
      const { jobId, title, description, tags } = req.body;
      
      if (!jobId) {
        return res.status(400).json({ error: 'jobId is required' });
      }

      const documentId = randomUUID();
      const document = {
        id: documentId,
        jobId,
        title: title || 'Untitled Document',
        description: description || '',
        tags: tags || [],
        slideCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'active'
      };

      documents.set(documentId, document);

      res.status(201).json({
        documentId: document.id,
        title: document.title,
        slideCount: document.slideCount,
        createdAt: document.createdAt
      });
    } catch (err) {
      console.error('Document creation error:', err);
      res.status(500).json({ error: 'Failed to create document' });
    }
  });

  app.get(`${prefix}/documents`, async (req, res) => {
    try {
      const { search, tags, limit = 20, offset = 0 } = req.query;
      
      let docs = Array.from(documents.values());

      if (search) {
        const searchLower = search.toLowerCase();
        docs = docs.filter(d => 
          d.title.toLowerCase().includes(searchLower) ||
          d.description?.toLowerCase().includes(searchLower)
        );
      }

      if (tags) {
        const tagArray = Array.isArray(tags) ? tags : [tags];
        docs = docs.filter(d => 
          tagArray.some(tag => d.tags.includes(tag))
        );
      }

      docs = docs.sort((a, b) => 
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );

      const start = parseInt(offset);
      const end = start + parseInt(limit);
      const paginatedDocs = docs.slice(start, end);

      res.json({
        documents: paginatedDocs,
        total: docs.length,
        limit: parseInt(limit),
        offset: start,
        hasMore: end < docs.length
      });
    } catch (err) {
      console.error('Document list error:', err);
      res.status(500).json({ error: 'Failed to list documents' });
    }
  });

  app.get(`${prefix}/documents/:id`, async (req, res) => {
    try {
      const { id } = req.params;
      const { includeContent = 'false' } = req.query;

      const document = documents.get(id);
      if (!document) {
        return res.status(404).json({ error: 'Document not found' });
      }

      const response = { ...document };

      if (includeContent === 'true') {
        response.deck = {
          version: '1.0',
          slides: [],
          metadata: {}
        };
      }

      res.json(response);
    } catch (err) {
      console.error('Document retrieval error:', err);
      res.status(500).json({ error: 'Failed to retrieve document' });
    }
  });

  app.patch(`${prefix}/documents/:id`, async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      const document = documents.get(id);
      if (!document) {
        return res.status(404).json({ error: 'Document not found' });
      }

      const allowedFields = ['title', 'description', 'tags', 'category'];
      const filteredUpdates = {};
      
      for (const key of Object.keys(updates)) {
        if (allowedFields.includes(key)) {
          filteredUpdates[key] = updates[key];
        }
      }

      if (Object.keys(filteredUpdates).length === 0) {
        return res.status(400).json({ error: 'No valid fields to update' });
      }

      Object.assign(document, filteredUpdates, {
        updatedAt: new Date().toISOString()
      });

      documents.set(id, document);

      res.json({
        id: document.id,
        title: document.title,
        description: document.description,
        updatedAt: document.updatedAt
      });
    } catch (err) {
      console.error('Document update error:', err);
      res.status(500).json({ error: 'Failed to update document' });
    }
  });

  app.delete(`${prefix}/documents/:id`, async (req, res) => {
    try {
      const { id } = req.params;

      const document = documents.get(id);
      if (!document) {
        return res.status(404).json({ error: 'Document not found' });
      }

      document.status = 'deleted';
      document.deletedAt = new Date().toISOString();
      documents.set(id, document);

      res.json({ status: 'deleted', id });
    } catch (err) {
      console.error('Document deletion error:', err);
      res.status(500).json({ error: 'Failed to delete document' });
    }
  });
}
