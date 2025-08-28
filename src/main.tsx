import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Validate env & config on startup
import { env } from "./lib/env";
import { config } from "./lib/config";

if (import.meta.env.DEV) {
  // eslint-disable-next-line no-console
  console.info("Env loaded:", { env, config });
}

createRoot(document.getElementById("root")!).render(<App />);
