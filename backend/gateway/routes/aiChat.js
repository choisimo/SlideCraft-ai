import { listProviders, invokeChat } from '../../lib/aiGateway.js';

export function registerAiChatRoutes(app, prefix){
  // List providers
  app.get(`${prefix}/ai/chat`, (_req,res) => {
    res.json({ providers: listProviders() });
  });

  app.post(`${prefix}/ai/chat`, async (req,res) => {
    try {
      const { model, messages = [], stream } = req.body || {};
      if (stream){
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders?.();
        const { provider, result } = await invokeChat({ model, messages, stream: true });
        if (typeof result === 'function'){
          const gen = await result();
          for await (const chunk of gen){
            if (chunk.delta){
              res.write(`data: ${JSON.stringify({ delta: chunk.delta, provider })}\n\n`);
            }
          }
          const final = (await gen.next?.())?.value?.final || undefined; // in case generator returns final
          res.write(`data: ${JSON.stringify({ final, provider })}\n\n`);
          res.write('data: [DONE]\n\n');
          res.end();
        } else {
          res.write(`data: ${JSON.stringify({ final: result.content, provider })}\n\n`);
          res.write('data: [DONE]\n\n');
          res.end();
        }
        return;
      }
      const { provider, result } = await invokeChat({ model, messages, stream: false });
      if (typeof result === 'function'){
        // Should not happen for non stream, but guard
        const gen = await result();
        let content = '';
        for await (const chunk of gen){ if (chunk.delta) content += chunk.delta; }
        res.json({ provider, content });
        return;
      }
      res.json({ provider, content: result.content });
    } catch (err){
      res.status(500).json({ error: err.message, providers: listProviders() });
    }
  });
}
