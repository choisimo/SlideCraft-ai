#!/usr/bin/env node
import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { parseDocuments } from './parsePrd.js';
import { saveTasks, ensureDir, loadTasks } from './fileIO.js';

const program = new Command();
program
  .name('task-master')
  .description('Task Master CLI (subset)')
  .version('0.1.0');

const DEFAULT_OUT = 'tasks/tasks.json';

program.command('parse-prd')
  .description('Parse PRD markdown docs into structured tasks')
  .option('-s, --sources <files>', 'Comma separated markdown paths', 'docs/frontend/PRD-tasks.md,docs/backend/PRD-tasks.md')
  .option('-o, --out <file>', 'Output JSON file', DEFAULT_OUT)
  .action((opts) => {
    const sources = opts.sources.split(',').map(s=>s.trim()).filter(Boolean);
    sources.forEach(src => { if (!fs.existsSync(src)) { console.error('Missing source', src); process.exit(1);} });
    const data = parseDocuments({ sources });
    const outFile = opts.out;
    ensureDir(path.dirname(outFile));
    saveTasks(outFile, data);
    console.log(`Parsed ${data.items.length} items -> ${outFile}`);
  });

program.command('list')
  .description('List tasks from tasks file')
  .option('-f, --file <file>', 'Tasks file', DEFAULT_OUT)
  .action((opts) => {
    const file = opts.file;
    if (!fs.existsSync(file)) { console.error('Tasks file not found:', file); process.exit(1);} 
    const data = loadTasks(file);
    const rows = data.items.map(t => `${t.id}\t${t.type}\t${t.title}`);
    console.log(rows.join('\n'));
    console.log(`Total: ${rows.length}`);
  });

program.command('show')
  .description('Show a task/epic/story by ID')
  .argument('<id>')
  .option('-f, --file <file>', 'Tasks file', DEFAULT_OUT)
  .action((id, opts) => {
    const data = loadTasks(opts.file);
    const found = data.items.find(t => t.id.toLowerCase() === id.toLowerCase());
    if (!found) { console.error('Not found:', id); process.exit(1);} 
    console.log(JSON.stringify(found, null, 2));
  });

program.command('set-status')
  .description('Set status of an item (pending|in-progress|done|deferred)')
  .argument('<id>')
  .argument('<status>')
  .option('-f, --file <file>', 'Tasks file', DEFAULT_OUT)
  .action((id, status, opts) => {
    const valid = ['pending','in-progress','done','deferred'];
    if (!valid.includes(status)) { console.error('Invalid status', status); process.exit(1);} 
    const data = loadTasks(opts.file);
    const item = data.items.find(t => t.id.toLowerCase() === id.toLowerCase());
    if (!item) { console.error('Not found:', id); process.exit(1);} 
    item.status = status;
    // persist
    const outFile = opts.file;
    ensureDir(path.dirname(outFile));
    // write back
    fs.writeFileSync(outFile, JSON.stringify(data, null, 2));
    console.log('Updated', id, '->', status);
  });

program.command('next')
  .description('Suggest next pending item (frontend/backend optional)')
  .option('-d, --domain <domain>', 'frontend|backend')
  .option('-f, --file <file>', 'Tasks file', DEFAULT_OUT)
  .action((opts) => {
    const data = loadTasks(opts.file);
    let list = data.items.filter(t => t.type === 'task' && t.status === 'pending');
    if (opts.domain) list = list.filter(t => t.domain === opts.domain);
    // simple heuristic: lowest phase then epic order then index
    list.sort((a,b) => a.phase - b.phase || a.epicId.localeCompare(b.epicId) || a.index - b.index);
    const next = list[0];
    if (!next) { console.log('No pending tasks'); return; }
    console.log(`${next.id}\t${next.title}`);
  });

export function runCLI(argv) {
  program.parse(argv);
}
