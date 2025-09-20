// Parser for PRD task markdown documents (frontend/backend)
// Enhanced to handle inline bullet sections like "- Capabilities:" etc.

import fs from 'fs';
import { validateTasks, parseEstimate } from './schema.js';

function splitLines(text){
  return text.split(/\r?\n/);
}

const SECTION_KEYS = ['Capabilities','Stories','Tasks','Tests','Acceptance','Dependencies','Risks','Estimate'];

export function parseDocuments({ project='SlideCraft AI', sources }) {
  const items = [];
  sources.forEach(src => {
    const raw = fs.readFileSync(src,'utf8');
    const lines = splitLines(raw);
    let currentPhase = 0;
    let epic = null;
    let storyIndex = 0;
    let taskIndex = 0;

    const flushEpic = () => { 
      if (epic) { 
        // If epic has tasks but no stories, synthesize a summary story (backend heuristics)
        if ((!epic.stories || epic.stories.length === 0) && epic.tasks && epic.tasks.length > 0) {
          const storyId = `${epic.id}-S1`;
            const firstTaskTitles = epic.tasks
              .map(tid => items.find(it => it.id === tid))
              .filter(Boolean)
              .slice(0,3)
              .map(t => t.title)
              .join('; ');
            const storyTitle = `As a developer, ${epic.title.toLowerCase()} foundation is in place.`;
            const storyDesc = `Auto-generated story summarizing initial tasks: ${firstTaskTitles}.`;
            items.push({ id: storyId, type:'story', domain:epic.domain, phase:epic.phase, epicId:epic.id, parentId:epic.id, index:1, title: storyTitle, description: storyDesc, status:'pending' });
            epic.stories = [storyId];
        }
        items.push(epic); 
        epic = null; 
      } 
    };

    for (let i=0;i<lines.length;i++) {
      const original = lines[i];
      const line = original.trim();
      if (!line) continue;

      // Phase header
      const phaseMatch = line.match(/^##\s+Phase\s+(\d+)/i);
      if (phaseMatch) { flushEpic(); currentPhase = Number(phaseMatch[1]); continue; }

      // Epic header
      const epicMatch = line.match(/^###\s+Epic\s+([FB])(\d+)\.(\d+):\s*(.+)$/);
      if (epicMatch) {
        flushEpic();
        const [, letter, phaseStr, epicNumStr, title] = epicMatch;
        currentPhase = Number(phaseStr);
        storyIndex = 0; taskIndex = 0;
        epic = { id: `${letter}${phaseStr}.${epicNumStr}`, type:'epic', domain: letter==='F'?'frontend':'backend', phase: currentPhase, index: Number(epicNumStr), title: title.trim(), stories:[], tasks:[], status:'pending' };
        continue;
      }

      if (!epic) continue;

      // Backend unlabeled bullet tasks heuristic: if we encounter a bullet line and have not yet
      // captured any explicit section content (no stories/tasks lists) and the bullet does NOT
      // start a known section, treat consecutive bullet lines until blank/next epic/phase as tasks.
      const unlabeledBullet = line.match(/^-(\s+.+)$/);
      if (unlabeledBullet) {
        const sectionStarter = line.match(/^-\s*(Capabilities|Stories|Tasks|Tests|Acceptance|Dependencies|Risks|Estimate):/i);
        if (!sectionStarter) {
          // Only apply if we haven't already parsed explicit tasks or stories for this epic
          const hasExplicit = (epic.stories && epic.stories.length) || (epic.tasks && epic.tasks.length) || epic.capabilities || epic.tests || epic.acceptance || epic.dependencies || epic.risks;
          if (!hasExplicit) {
            let collected = [unlabeledBullet[1].trim()];
            let j = i+1;
            for (; j<lines.length; j++) {
              const nxt = lines[j].trim();
              if (!nxt) break;
              if (/^(###\s+Epic|##\s+Phase)/.test(nxt)) break;
              const secStart = nxt.match(/^-\s*(Capabilities|Stories|Tasks|Tests|Acceptance|Dependencies|Risks|Estimate):/i);
              if (secStart) break;
              const li = nxt.match(/^-\s+(.+)/);
              if (li) collected.push(li[1].trim()); else break;
            }
            i = j-1;
            // Convert each bullet to a task
            collected.forEach(txt => { if (!epic.tasks) epic.tasks = []; const idx = (++taskIndex); const id = `${epic.id}-T${idx}`; items.push({ id, type:'task', domain:epic.domain, phase:epic.phase, epicId:epic.id, parentId:epic.id, index:idx, title: deriveTaskTitle(txt), description: txt.trim(), status:'pending' }); epic.tasks.push(id); });
            continue;
          }
        }
      }

      // Detect bullet style section starters: - Capabilities: ...
      const bulletSection = line.match(/^-\s*(Capabilities|Stories|Tasks|Tests|Acceptance|Dependencies|Risks|Estimate):\s*(.*)$/i);
      if (bulletSection) {
        const section = bulletSection[1];
        let firstContent = bulletSection[2];
        let collected = [];
        if (section.toLowerCase()==='estimate') {
          const est = parseEstimate(`Estimate: ${firstContent}`);
          if (est) epic.estimateDays = est;
          continue;
        }
        if (firstContent) collected.push(firstContent.trim());
        // consume following bullet lines that are NOT a new section or epic/phase
        let j = i+1;
        for (; j<lines.length; j++) {
          const nxt = lines[j].trim();
          if (!nxt) break;
          if (/^(###\s+Epic|##\s+Phase)/.test(nxt)) break;
          const secStart = nxt.match(/^-\s*([A-Za-z]+):/);
          if (secStart && SECTION_KEYS.includes(secStart[1])) break;
          const li = nxt.match(/^-\s+(.+)/);
          if (li) collected.push(li[1].trim()); else break; // stop if non-bullet content (avoid consuming next narrative)
        }
        i = j-1;
        applySection(epic, section, collected, items, () => { storyIndex+=1; return storyIndex; }, () => { taskIndex+=1; return taskIndex; });
        continue;
      }

      // Standalone section headers (non-bullet) e.g. "Stories:" on its own line
      const sectionLine = line.match(/^(Capabilities|Stories|Tasks|Tests|Acceptance|Dependencies|Risks|Estimate):\s*(.*)$/);
      if (sectionLine) {
        const section = sectionLine[1];
        const inline = sectionLine[2];
        if (section.toLowerCase()==='estimate') { const est = parseEstimate(line); if (est) epic.estimateDays = est; continue; }
        let collected = [];
        if (inline) collected.push(inline.trim());
        let j = i+1;
        for (; j<lines.length; j++) {
          const nxt = lines[j].trim();
          if (!nxt) break;
          if (/^(###\s+Epic|##\s+Phase)/.test(nxt)) break;
          if (/^[A-Za-z]+:/.test(nxt)) break;
          const li = nxt.match(/^-\s+(.+)/); if (li) collected.push(li[1].trim()); else break;
        }
        i = j-1;
        applySection(epic, section, collected, items, () => { storyIndex+=1; return storyIndex; }, () => { taskIndex+=1; return taskIndex; });
        continue;
      }

      // Inline estimate embedded in any bullet
      if (/Estimate:\s*\d+d\.?/i.test(line)) {
        const est = parseEstimate(line); if (est) epic.estimateDays = est;
      }
    }
    flushEpic();
  });

  // Post-pass normalization: strip trailing punctuation for list fields
  items.forEach(it => {
    ['capabilities','tests','acceptance','dependencies','risks'].forEach(f => {
      if (it[f]) it[f] = normalizeList(it[f]);
    });
  });
  const data = { meta:{ project, generatedAt: new Date().toISOString(), sources }, items };
  return validateTasks(data);
}

function normalizeList(arr){
  return arr.map(s => s.replace(/[.;]\s*$/,'').trim());
}

function applySection(epic, section, collected, items, nextStoryIndex, nextTaskIndex) {
  const key = section.toLowerCase();
  switch(key) {
    case 'capabilities': epic.capabilities = collected; break;
    case 'stories': collected.forEach(txt => { const idx = nextStoryIndex(); const id = `${epic.id}-S${idx}`; items.push({ id, type:'story', domain:epic.domain, phase:epic.phase, epicId:epic.id, parentId:epic.id, index:idx, title: txt.replace(/^As .*?,\s*/,'').trim(), description: txt.trim(), status:'pending' }); epic.stories.push(id); }); break;
    case 'tasks': collected.forEach(txt => { const idx = nextTaskIndex(); const id = `${epic.id}-T${idx}`; items.push({ id, type:'task', domain:epic.domain, phase:epic.phase, epicId:epic.id, parentId:epic.id, index:idx, title: deriveTaskTitle(txt), description: txt.trim(), status:'pending' }); epic.tasks.push(id); }); break;
    case 'tests': epic.tests = collected; break;
    case 'acceptance': epic.acceptance = collected; break;
    case 'dependencies': epic.dependencies = collected; break;
    case 'risks': epic.risks = collected; break;
  }
}

function deriveTaskTitle(txt) {
  const first = txt.split(/[:.]/)[0];
  return first.trim();
}
