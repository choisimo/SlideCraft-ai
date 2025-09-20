// AI Gateway implementation with echo + OpenAI provider
import { ENV } from './env.js';
import { logger } from './logger.js';

const providers = [];

export function registerProvider(p){ providers.push(p); }
export function listProviders(){ return providers.map(p => p.name); }

// Initialize built-in providers (idempotent on first import)
function init(){
  if (!providers.find(p => p.name === 'echo')){
    registerProvider({
      name: 'echo',
      supports: { chat: true, stream: true },
      async chat({ messages, stream }){
        const last = messages[messages.length - 1];
        const content = (last?.content || '').split('').reverse().join('');
        if (stream){
          // Simulate token streaming by yielding characters
          return async function * () {
            for (const ch of content){
              await new Promise(r => setTimeout(r, 5));
              yield { delta: ch };
            }
            return { final: content };
          };
        }
        return { content };
      }
    });
  }
  if (ENV.OPENAI_API_KEY && !providers.find(p => p.name === 'openai')){
    registerProvider({
      name: 'openai',
      supports: { chat: true, stream: true },
      async chat({ model = ENV.OPENAI_MODEL, messages, stream }){
        // Use fetch to call OpenAI Chat Completions (gpt-4o-mini or similar)
        const url = 'https://api.openai.com/v1/chat/completions';
        const body = { model, messages, stream };
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${ENV.OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body)
        });
        if (!stream){
          const json = await res.json();
            if (json.error){
              throw new Error(json.error.message || 'openai_error');
            }
          const msg = json.choices?.[0]?.message?.content || '';
          return { content: msg, raw: json };
        }
        // Streaming mode: OpenAI returns an event-stream
        const reader = res.body.getReader();
        const decoder = new TextDecoder('utf-8');
        return async function * () {
          let accumulated = '';
          while (true){
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split(/\n/);
            for (const line of lines){
              const trimmed = line.trim();
              if (!trimmed) continue;
              if (trimmed === 'data: [DONE]'){
                return { final: accumulated };
              }
              if (trimmed.startsWith('data: ')){
                const payload = trimmed.slice(6);
                try {
                  const parsed = JSON.parse(payload);
                  const delta = parsed.choices?.[0]?.delta?.content;
                  if (delta){
                    accumulated += delta;
                    yield { delta };
                  }
                } catch(err){
                  logger.warn('openai_stream_parse_error', err.message);
                }
              }
            }
          }
          return { final: accumulated };
        };
      }
    });
  }
}

init();

export async function invokeChat({ model, messages = [], stream }){
  if (!providers.length) throw new Error('No AI providers configured');
  let provider = providers.find(p => p.name === model);
  if (!provider){
    // fallback: first provider
    provider = providers[0];
  }
  if (!provider.supports.chat) throw new Error('Provider does not support chat');
  const result = await provider.chat({ model, messages, stream });
  return { provider: provider.name, result };
}
