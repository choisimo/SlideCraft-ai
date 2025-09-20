// Simple logger (can be swapped with pino later)
function ts(){ return new Date().toISOString(); }
export const logger = {
  info: (...a) => console.log(ts(), '[INFO]', ...a),
  error: (...a) => console.error(ts(), '[ERROR]', ...a),
  warn:  (...a) => console.warn(ts(), '[WARN]', ...a),
  debug: (...a) => { if (process.env.DEBUG) console.log(ts(), '[DEBUG]', ...a); }
};
