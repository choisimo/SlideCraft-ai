import fs from 'fs';
import path from 'path';
import { validateTasks } from './schema.js';

export function readFileIfExists(p) {
  return fs.existsSync(p) ? fs.readFileSync(p,'utf8') : undefined;
}

export function writeJsonAtomic(filePath, data) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, filePath);
}

export function loadTasks(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, 'utf8');
  const json = JSON.parse(raw);
  return validateTasks(json);
}

export function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function listMarkdownFiles(paths) {
  return paths.filter(p => p.endsWith('.md'));
}

export function saveTasks(filePath, data) {
  const valid = validateTasks(data); // throws if invalid
  writeJsonAtomic(filePath, valid);
  return valid;
}
