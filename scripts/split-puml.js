#!/usr/bin/env node
//
// Splits a large PlantUML sequence diagram into section-based parts and
// optionally renders each part to PNG via Kroki.
//
// Usage:
//   node scripts/split-puml.js <input.puml> [options]
//
// Options:
//   --output-dir <dir>   Output directory (default: <input>_split/)
//   --kroki-url <url>    Kroki base URL (default: http://localhost:8000)
//   --png                Also generate PNG files via Kroki
//   --group <spec>       Section grouping spec, e.g. "1-3,4-5,6-8,9-10,11-12"
//   --max-lines <n>      Max content lines per group for auto-grouping (default: 60)
//                        Lower = shorter images, more parts. Ignored when --group is used.
//
// Examples:
//   node scripts/split-puml.js diagram.puml --png
//   node scripts/split-puml.js diagram.puml --max-lines 80 --png
//   node scripts/split-puml.js diagram.puml --group "1-3,4-5,6-8,9-10,11-12" --png
//   node scripts/split-puml.js diagram.puml --output-dir ./out --kroki-url http://myhost:8000 --png

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { png: false, maxLines: 60 };
  const positional = [];
  for (let i = 2; i < argv.length; i++) {
    switch (argv[i]) {
      case '--output-dir': args.outputDir = argv[++i]; break;
      case '--kroki-url':  args.krokiUrl  = argv[++i]; break;
      case '--group':      args.group     = argv[++i]; break;
      case '--max-lines':  args.maxLines  = parseInt(argv[++i], 10) || 60; break;
      case '--png':        args.png       = true;      break;
      default:             positional.push(argv[i]);
    }
  }
  args.inputFile = positional[0];
  return args;
}

// ---------------------------------------------------------------------------
// PUML parsing helpers
// ---------------------------------------------------------------------------

const SECTION_RE = /^==\s*Section\s+/i;

function parsePuml(source) {
  const lines = source.split(/\r?\n/);

  let headerEnd = -1;
  for (let i = 0; i < lines.length; i++) {
    if (SECTION_RE.test(lines[i].trim())) { headerEnd = i; break; }
  }
  if (headerEnd === -1) {
    console.error('No "== Section ..." markers found in the file.');
    process.exit(1);
  }

  // Header = everything before the first section (minus trailing blank/spacer lines)
  let h = headerEnd;
  while (h > 0 && /^\s*(\|\|\|)?\s*$/.test(lines[h - 1])) h--;
  const header = lines.slice(0, h);

  // Collect sections
  const sections = [];
  let current = null;
  for (let i = headerEnd; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (SECTION_RE.test(trimmed)) {
      if (current) sections.push(current);
      const m = trimmed.match(/^==\s*Section\s+([\w]+)[:\s]*(.*?)\s*==$/i);
      current = {
        id: m ? m[1] : String(sections.length + 1),
        title: m ? m[2].trim() : '',
        lines: [lines[i]],
      };
    } else if (trimmed === '@enduml') {
      // skip; we'll append it ourselves
    } else if (current) {
      current.lines.push(lines[i]);
    }
  }
  if (current) sections.push(current);

  // Trim trailing blank/spacer lines from each section
  for (const s of sections) {
    while (s.lines.length && /^\s*(\|\|\|)?\s*$/.test(s.lines[s.lines.length - 1])) {
      s.lines.pop();
    }
  }

  return { header, sections };
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

function normalizeId(id) {
  return id.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function buildGroups(sections, groupSpec, maxLines) {
  if (groupSpec) return parseGroupSpec(sections, groupSpec);
  return autoGroupByLines(sections, maxLines);
}

function parseGroupSpec(sections, spec) {
  const groups = [];
  for (const part of spec.split(',')) {
    const [startRaw, endRaw] = part.trim().split('-');
    const startNorm = normalizeId(startRaw);
    const endNorm = normalizeId(endRaw || startRaw);

    const startIdx = sections.findIndex(s => normalizeId(s.id) === startNorm);
    const endIdx   = sections.findIndex(s => normalizeId(s.id) === endNorm);

    if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
      console.error(`Invalid group range: ${part}  (available: ${sections.map(s => s.id).join(', ')})`);
      process.exit(1);
    }
    groups.push(sections.slice(startIdx, endIdx + 1));
  }
  return groups;
}

function autoGroupByLines(sections, maxLines = 60) {
  const groups = [];
  let current = [];
  let currentLines = 0;

  for (const sec of sections) {
    const secLines = sec.lines.length;
    if (current.length > 0 && currentLines + secLines > maxLines) {
      groups.push(current);
      current = [sec];
      currentLines = secLines;
    } else {
      current.push(sec);
      currentLines += secLines;
    }
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

// ---------------------------------------------------------------------------
// Participant filtering
// ---------------------------------------------------------------------------

const PARTICIPANT_RE = /^(participant|actor|database)\s+(?:"[^"]*"\s+as\s+)?(\S+)/i;

function parseHeader(header) {
  const preamble = [];
  const participants = [];
  for (const line of header) {
    const m = line.trim().match(PARTICIPANT_RE);
    if (m) {
      participants.push({ alias: m[2], line });
    } else {
      preamble.push(line);
    }
  }
  return { preamble, participants };
}

function findUsedParticipants(participants, sectionGroup) {
  const content = sectionGroup.map(s => s.lines.join('\n')).join('\n');
  return participants.filter(p => {
    const re = new RegExp('\\b' + p.alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
    return re.test(content);
  });
}

// ---------------------------------------------------------------------------
// PUML assembly
// ---------------------------------------------------------------------------

function assemblePuml(header, sectionGroup, partNum, totalParts) {
  const ids = sectionGroup.map(s => s.id);
  const label = ids.length === 1 ? `Section ${ids[0]}` : `Sections ${ids[0]}-${ids[ids.length - 1]}`;
  const titles = sectionGroup.map(s => s.title).filter(Boolean).join(', ');

  const { preamble, participants } = parseHeader(header);
  const used = findUsedParticipants(participants, sectionGroup);

  const out = [];
  out.push(...preamble);
  for (const p of used) out.push(p.line);
  out.push('');

  const firstAlias = used.length > 0 ? used[0].alias : 'CSR';
  const lastAlias = used.length > 1 ? used[used.length - 1].alias : firstAlias;
  out.push(`note over ${firstAlias}, ${lastAlias}`);
  out.push(`    **Part ${partNum} of ${totalParts}** — ${label}: ${titles}`);
  out.push(`end note`);
  out.push('');

  for (let i = 0; i < sectionGroup.length; i++) {
    out.push(...sectionGroup[i].lines);
    if (i < sectionGroup.length - 1) out.push('');
  }

  out.push('');
  out.push('@enduml');
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// Kroki PNG rendering
// ---------------------------------------------------------------------------

function fetchPng(krokiBaseUrl, pumlSource) {
  const pngUrl = krokiBaseUrl.replace(/\/+$/, '') + '/plantuml/png';
  const parsed = new URL(pngUrl);
  const transport = parsed.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const req = transport.request(pngUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
    }, (res) => {
      if (res.statusCode !== 200) {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => reject(new Error(`Kroki returned ${res.statusCode}: ${body}`)));
        return;
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
    req.write(pumlSource);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv);

  if (!args.inputFile) {
    console.error('Usage: node split-puml.js <input.puml> [--output-dir dir] [--kroki-url url] [--group spec] [--max-lines N] [--png]');
    process.exit(1);
  }

  const inputPath = path.resolve(args.inputFile);
  if (!fs.existsSync(inputPath)) {
    console.error(`File not found: ${inputPath}`);
    process.exit(1);
  }

  const source = fs.readFileSync(inputPath, 'utf-8');
  const { header, sections } = parsePuml(source);

  console.log(`Parsed ${sections.length} sections: ${sections.map(s => s.id).join(', ')}`);
  for (const s of sections) {
    console.log(`  Section ${s.id.padEnd(4)} ${String(s.lines.length).padStart(4)} lines  ${s.title}`);
  }

  const groups = buildGroups(sections, args.group, args.maxLines);
  const baseName = path.basename(inputPath, path.extname(inputPath));
  const outputDir = path.resolve(args.outputDir || `${path.dirname(inputPath)}/${baseName}_split`);

  fs.mkdirSync(outputDir, { recursive: true });

  const krokiUrl = args.krokiUrl || 'http://localhost:8000';
  const manifest = [];

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    const partNum = i + 1;
    const ids = group.map(s => s.id);
    const fileName = `${baseName}_part${partNum}_sec${ids.join('-')}`;

    const puml = assemblePuml(header, group, partNum, groups.length);
    const pumlPath = path.join(outputDir, `${fileName}.puml`);
    fs.writeFileSync(pumlPath, puml, 'utf-8');
    console.log(`  [${partNum}/${groups.length}] Wrote ${pumlPath}`);

    if (args.png) {
      try {
        const png = await fetchPng(krokiUrl, puml);
        const pngPath = path.join(outputDir, `${fileName}.png`);
        fs.writeFileSync(pngPath, png);
        console.log(`  [${partNum}/${groups.length}] Rendered ${pngPath} (${(png.length / 1024).toFixed(0)} KB)`);
        manifest.push({ part: partNum, sections: ids, puml: pumlPath, png: pngPath });
      } catch (err) {
        console.error(`  [${partNum}/${groups.length}] PNG render failed: ${err.message}`);
        manifest.push({ part: partNum, sections: ids, puml: pumlPath, png: null, error: err.message });
      }
    } else {
      manifest.push({ part: partNum, sections: ids, puml: pumlPath });
    }
  }

  const manifestPath = path.join(outputDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  console.log(`\nDone. ${groups.length} parts written to ${outputDir}`);
  console.log(`Manifest: ${manifestPath}`);
}

main().catch(err => { console.error(err); process.exit(1); });
