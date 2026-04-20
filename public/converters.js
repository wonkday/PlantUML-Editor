// Shared diagram format conversion functions
// Used by PlantUML, Mermaid, and Gliffy editors
window.DiagramConverters = (function () {

  // =========================================================================
  // PlantUML -> Mermaid
  // =========================================================================
  function plantumlToMermaid(puml) {
    const lines = puml.split('\n');
    const out = ['sequenceDiagram'];

    let inNote = false;
    let noteHeader = null;
    let noteBody = [];
    let lastTo = null;
    const activeSet = new Set();
    const participantAliases = [];

    function flushNote() {
      if (noteHeader && noteBody.length > 0) {
        out.push(`    ${noteHeader}: ${noteBody.join('<br/>')}`);
      } else if (noteBody.length > 0) {
        for (const nl of noteBody) out.push(`    %% ${nl}`);
      }
      inNote = false;
      noteHeader = null;
      noteBody = [];
    }

    for (let line of lines) {
      let l = line.trim();
      if (!l || /^@start|^@end/i.test(l)) continue;
      if (/^title\b/i.test(l)) continue;
      if (/^skinparam\b/i.test(l)) continue;
      if (/^\|\|\|$/.test(l)) continue;

      const sectionMatch = l.match(/^==\s*(.+?)\s*==\s*$/);
      if (sectionMatch) {
        out.push(`    %% == ${sectionMatch[1]} ==`);
        if (participantAliases.length >= 2) {
          out.push(`    Note over ${participantAliases[0]},${participantAliases[participantAliases.length - 1]}: == ${sectionMatch[1]} ==`);
        }
        continue;
      }

      if (/^end\s*note/i.test(l)) { flushNote(); continue; }
      if (inNote) { if (l) noteBody.push(l); continue; }

      const aliasMatch = l.match(/^(participant|actor|database)\s+"([^"]+)"\s+as\s+(\S+)(\s+#[0-9A-Fa-f]+)?/i);
      if (aliasMatch) {
        const type = aliasMatch[1].toLowerCase() === 'database' ? 'participant' : aliasMatch[1];
        participantAliases.push(aliasMatch[3]);
        out.push(`    ${type} ${aliasMatch[3]} as ${aliasMatch[2]}`);
        continue;
      }

      if (/^(participant|actor|database)\s+/i.test(l)) {
        const m = l.match(/^(participant|actor|database)\s+(.+?)(\s+#[0-9A-Fa-f]+)?$/i);
        if (m) {
          const type = m[1].toLowerCase() === 'database' ? 'participant' : m[1];
          const name = m[2].trim();
          const alias = name.includes(' as ') ? name.split(' as ')[0].trim() : name;
          participantAliases.push(alias);
          out.push(`    ${type} ${name}`);
        }
        continue;
      }

      const noteInline = l.match(/^note\s+(right\s+of|left\s+of|over)\s+(.+?)\s*:\s*(.+)/i);
      if (noteInline) {
        out.push(`    Note ${noteInline[1]} ${noteInline[2]}: ${noteInline[3]}`);
        continue;
      }

      const noteMultiOf = l.match(/^note\s+(right\s+of|left\s+of|over)\s+(.+)/i);
      if (noteMultiOf) {
        inNote = true;
        noteHeader = `Note ${noteMultiOf[1]} ${noteMultiOf[2]}`;
        noteBody = [];
        continue;
      }

      if (/^note\s+(right|left)\s*$/i.test(l)) {
        const dir = l.match(/^note\s+(right|left)/i)[1].toLowerCase();
        inNote = true;
        noteHeader = lastTo ? `Note ${dir} of ${lastTo}` : null;
        noteBody = [];
        continue;
      }

      if (/^group\b/i.test(l)) {
        out.push('    ' + l.replace(/^group\b/i, 'critical'));
        continue;
      }

      if (/^(alt|else|opt|loop|par|critical|break|end)\b/i.test(l)) {
        out.push('    ' + l);
        continue;
      }

      const actMatch = l.match(/^(activate|deactivate)\s+(\S+)/i);
      if (actMatch) {
        const action = actMatch[1].toLowerCase();
        const who = actMatch[2];
        if (action === 'activate' && !activeSet.has(who)) {
          activeSet.add(who);
          out.push('    ' + l);
        } else if (action === 'deactivate' && activeSet.has(who)) {
          activeSet.delete(who);
          out.push('    ' + l);
        }
        continue;
      }

      const arrowMatch = l.match(/^(\S+)\s*(--?>?>?|<--?<?|\.\.>|-\\\\>|-\/>|->>)\s*(\S+)\s*:\s*(.*)$/);
      if (arrowMatch) {
        const [, from, arrow, to, msg] = arrowMatch;
        lastTo = to;
        let mermaidArrow;
        if (arrow === '-->') mermaidArrow = '-->>';
        else if (arrow === '->>') mermaidArrow = '-)';
        else mermaidArrow = '->>';
        out.push(`    ${from}${mermaidArrow}${to}: ${msg}`);
        continue;
      }

      if (l) out.push('    %% ' + l);
    }

    return out.join('\n');
  }

  // =========================================================================
  // Mermaid -> PlantUML
  // =========================================================================
  function mermaidToPlantUml(src) {
    const lines = src.split('\n');
    const out = ['@startuml'];

    for (let line of lines) {
      let l = line.trim();
      if (!l || /^sequenceDiagram$/i.test(l)) continue;
      const sectionComment = l.match(/^%%\s*==\s*(.+?)\s*==\s*$/);
      if (sectionComment) {
        out.push(`== ${sectionComment[1]} ==`);
        continue;
      }
      if (/^%%/.test(l)) continue;

      const aliasMatch = l.match(/^(participant|actor)\s+(\S+)\s+as\s+(.+)/i);
      if (aliasMatch) {
        out.push(`${aliasMatch[1]} "${aliasMatch[3].trim()}" as ${aliasMatch[2]}`);
        continue;
      }
      if (/^(participant|actor)\s+/i.test(l)) { out.push(l); continue; }

      const noteMatch = l.match(/^Note\s+(right\s+of|left\s+of|over)\s+(.+)/i);
      if (noteMatch) {
        if (/:\s*==\s*.+\s*==\s*$/.test(l)) continue;
        out.push(`note ${noteMatch[1]} ${noteMatch[2]}`);
        continue;
      }
      if (/^end\s*note/i.test(l)) { out.push('end note'); continue; }
      if (/^(alt|else|opt|loop|par|critical|break|group|end)\b/i.test(l)) { out.push(l); continue; }
      if (/^(activate|deactivate)\s+/i.test(l)) { out.push(l); continue; }

      const arrowMatch = l.match(/^(\S+?)(--?>>|--?>|-)([)>])(\S+?):\s*(.*)$/);
      if (arrowMatch) {
        const [, from, arrowStart, arrowEnd, to, msg] = arrowMatch;
        const full = arrowStart + arrowEnd;
        const puml = full === '-->>' ? '-->' : full === '-)' ? '->>' : '->';
        out.push(`${from} ${puml} ${to} : ${msg}`);
        continue;
      }
      const s = l.match(/^(\S+?)->>(\S+?):\s*(.*)$/);
      if (s) { out.push(`${s[1]} -> ${s[2]} : ${s[3]}`); continue; }
      const d = l.match(/^(\S+?)-->>(\S+?):\s*(.*)$/);
      if (d) { out.push(`${d[1]} --> ${d[2]} : ${d[3]}`); continue; }
      const a = l.match(/^(\S+?)-\)(\S+?):\s*(.*)$/);
      if (a) { out.push(`${a[1]} ->> ${a[2]} : ${a[3]}`); continue; }
      if (l) out.push(l);
    }

    out.push('@enduml');
    return out.join('\n');
  }

  // =========================================================================
  // Gliffy JSON -> PlantUML
  // =========================================================================
  function stripHtml(html) {
    return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim();
  }

  function extractText(obj) {
    if (!obj || !obj.children) return '';
    for (const child of obj.children) {
      if (child && child.graphic && child.graphic.type === 'Text' && child.graphic.Text) {
        return stripHtml(child.graphic.Text.html || '');
      }
    }
    return '';
  }

  function gliffyJsonToPlantUml(jsonStr) {
    let data;
    try {
      data = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
    } catch (e) {
      return '@startuml\n\' Error: Invalid Gliffy JSON\n@enduml';
    }

    const objects = (data.stage && data.stage.objects) || [];
    const participants = [];
    const messages = [];
    const notes = [];
    const fragments = [];
    const sectionLabels = [];
    const activations = [];

    for (const obj of objects) {
      if (!obj || obj.hidden) continue;
      const uid = (obj.uid || '').toLowerCase();
      const gType = obj.graphic && obj.graphic.type;
      const text = extractText(obj);

      if (uid.includes('lifeline_dash') || uid.includes('section_line') || uid.includes('fragment_separator')) continue;
      if (uid.includes('activation')) { activations.push({ x: obj.x, y: obj.y, h: obj.height }); continue; }
      if (uid.includes('combined_fragment')) { fragments.push({ y: obj.y, h: obj.height, endY: obj.y + obj.height }); continue; }
      if (uid.includes('fragment_label')) {
        const last = fragments[fragments.length - 1];
        if (last && Math.abs(last.y - obj.y) < 5) last.kind = (text || 'alt').toLowerCase();
        continue;
      }
      if (uid.includes('fragment_condition')) {
        const nearFrag = fragments.filter(f => obj.y >= f.y && obj.y <= f.endY).pop();
        if (nearFrag) {
          if (!nearFrag.conditions) nearFrag.conditions = [];
          nearFrag.conditions.push({ y: obj.y, label: (text || '').replace(/^\[|\]$/g, '') });
        }
        continue;
      }
      if (uid.includes('section_label')) { sectionLabels.push({ y: obj.y, title: text }); continue; }

      if (uid.includes('lifeline') && gType === 'Shape') {
        participants.push({ id: obj.id, name: text || `P${obj.id}`, x: obj.x });
      } else if (uid.includes('actor') && gType === 'Shape') {
        participants.push({ id: obj.id, name: text || `Actor${obj.id}`, x: obj.x, isActor: true });
      } else if (uid.includes('note') && gType === 'Shape') {
        const pos = (participants.length > 0 && obj.x > participants[0].x + 60) ? 'right' : 'left';
        notes.push({ text, y: obj.y, x: obj.x, position: pos, target: null });
      } else if (uid.includes('message') && gType === 'Line') {
        const line = obj.graphic.Line;
        const constraints = obj.constraints || {};
        let startNode = constraints.startConstraint &&
          constraints.startConstraint.StartPositionConstraint &&
          constraints.startConstraint.StartPositionConstraint.nodeId;
        let endNode = constraints.endConstraint &&
          constraints.endConstraint.EndPositionConstraint &&
          constraints.endConstraint.EndPositionConstraint.nodeId;
        const label = extractText(obj);
        const isDashed = line && line.dashStyle && line.dashStyle !== null;
        const isAsync = line && line.endArrow === 6;
        const cp = (line && line.controlPath) || [];
        const lineStartX = obj.x + (cp[0] ? cp[0][0] : 0);
        const lineEndX = obj.x + (cp.length > 0 ? cp[cp.length - 1][0] : 0);
        messages.push({ objId: obj.id, from: startNode, to: endNode, label, y: obj.y, isDashed, isAsync, lineStartX, lineEndX });
      } else if (gType === 'Line') {
        continue;
      } else if ((uid.includes('rectangle') || uid.includes('basic')) && gType === 'Shape') {
        if (text && !uid.includes('line') && !uid.includes('arrow') && !uid.includes('fragment') && !uid.includes('section')) {
          participants.push({ id: obj.id, name: text, x: obj.x });
        }
      }
    }

    participants.sort((a, b) => a.x - b.x);
    messages.sort((a, b) => a.y - b.y);
    sectionLabels.sort((a, b) => a.y - b.y);
    fragments.sort((a, b) => a.y - b.y);

    function findNearestParticipant(xPos) {
      let best = null, bestDist = Infinity;
      for (const p of participants) {
        const center = p.x + 60;
        const dist = Math.abs(xPos - center);
        if (dist < bestDist) { bestDist = dist; best = p; }
      }
      return best;
    }

    const out = ['@startuml'];
    const aliasMap = {};
    const pCenterByAlias = {};

    for (const p of participants) {
      const alias = p.name.replace(/[^a-zA-Z0-9_]/g, '') || `P${p.id}`;
      aliasMap[p.id] = alias;
      pCenterByAlias[alias] = p.x + 60;
      const keyword = p.isActor ? 'actor' : (p.name.toLowerCase().includes('db') ? 'database' : 'participant');
      if (alias !== p.name) {
        out.push(`${keyword} "${p.name}" as ${alias}`);
      } else {
        out.push(`${keyword} ${alias}`);
      }
    }
    out.push('');

    const sectionDefs = data.sections || [];
    const sectionByObjId = {};
    for (const sec of sectionDefs) {
      for (const oid of (sec.objectIds || [])) sectionByObjId[oid] = sec;
    }

    const timeline = [];
    let currentSecId = null;

    for (const sl of sectionLabels) {
      timeline.push({ y: sl.y, type: 'section', title: sl.title });
    }

    for (const frag of fragments) {
      timeline.push({ y: frag.y, type: 'fragment_start', kind: frag.kind || 'alt', label: '' });
      if (frag.conditions) {
        const sorted = frag.conditions.slice().sort((a, b) => a.y - b.y);
        if (sorted.length > 0) {
          timeline[timeline.length - 1].label = sorted[0].label;
          for (let i = 1; i < sorted.length; i++) {
            timeline.push({ y: sorted[i].y, type: 'fragment_else', label: sorted[i].label });
          }
        }
      }
      timeline.push({ y: frag.endY, type: 'fragment_end' });
    }

    for (const msg of messages) {
      let fromAlias = aliasMap[msg.from];
      let toAlias = aliasMap[msg.to];
      if (!fromAlias && msg.lineStartX != null) {
        const p = findNearestParticipant(msg.lineStartX);
        if (p) fromAlias = aliasMap[p.id];
      }
      if (!toAlias && msg.lineEndX != null) {
        const p = findNearestParticipant(msg.lineEndX);
        if (p) toAlias = aliasMap[p.id];
      }
      if (!fromAlias || !toAlias) continue;
      const arrow = msg.isDashed ? '-->' : (msg.isAsync ? '->>' : '->');
      timeline.push({ y: msg.y, type: 'message', text: `${fromAlias} ${arrow} ${toAlias} : ${msg.label || ''}`, objId: msg.objId });
    }

    for (const n of notes) {
      if (!n.text) continue;
      let targetAlias = null;
      if (n.x != null) {
        const p = findNearestParticipant(n.x);
        if (p) targetAlias = aliasMap[p.id];
      }
      const pos = n.position || 'right';
      timeline.push({ y: n.y, type: 'note', text: n.text, position: pos, target: targetAlias });
    }

    for (const act of activations) {
      const p = findNearestParticipant(act.x + 5);
      if (p) {
        const alias = aliasMap[p.id];
        timeline.push({ y: act.y, type: 'activate', alias });
        timeline.push({ y: act.y + act.h, type: 'deactivate', alias });
      }
    }

    timeline.sort((a, b) => {
      if (a.y !== b.y) return a.y - b.y;
      const order = { section: 0, fragment_start: 1, activate: 2, message: 3, note: 4, deactivate: 5, fragment_else: 6, fragment_end: 7 };
      return (order[a.type] || 3) - (order[b.type] || 3);
    });

    for (const item of timeline) {
      switch (item.type) {
        case 'section': {
          const sec = sectionByObjId[item.objId];
          if (sec && sec.id !== currentSecId) {
            currentSecId = sec.id;
            out.push(`== Section ${sec.id}: ${sec.title} ==`);
          } else {
            out.push(`== ${item.title} ==`);
          }
          break;
        }
        case 'fragment_start': out.push(`${item.kind} ${item.label}`); break;
        case 'fragment_else': out.push(`else ${item.label}`); break;
        case 'fragment_end': out.push('end'); break;
        case 'activate': out.push(`activate ${item.alias}`); break;
        case 'deactivate': out.push(`deactivate ${item.alias}`); break;
        case 'message': {
          if (sectionLabels.length === 0) {
            const sec = sectionByObjId[item.objId];
            if (sec && sec.id !== currentSecId) {
              currentSecId = sec.id;
              const marker = sec.title ? `Section ${sec.id}: ${sec.title}` : `Section ${sec.id}`;
              out.push(`== ${marker} ==`);
            }
          }
          out.push(item.text);
          break;
        }
        case 'note': {
          const target = item.target ? `${item.position} of ${item.target}` : 'right';
          if (item.text.includes('\n')) {
            out.push(`note ${target}`);
            for (const line of item.text.split('\n')) out.push(`  ${line}`);
            out.push('end note');
          } else {
            out.push(`note ${target} : ${item.text}`);
          }
          break;
        }
      }
    }

    out.push('@enduml');
    return out.join('\n');
  }

  // =========================================================================
  // Gliffy JSON -> Mermaid (convenience)
  // =========================================================================
  function gliffyJsonToMermaid(jsonStr) {
    return plantumlToMermaid(gliffyJsonToPlantUml(jsonStr));
  }

  // =========================================================================
  // PlantUML -> Gliffy JSON
  // =========================================================================
  function plantumlToGliffyJson(puml) {
    // ---- Constants ----
    const SPACING_X = 180;
    const BOX_W = 120;
    const HEADER_Y = 20;
    const HEADER_H = 40;
    const LIFELINE_TOP = HEADER_Y + HEADER_H + 15;
    const MSG_SPACING = 50;
    const SELF_MSG_W = 60;
    const SELF_MSG_H = 30;
    const ACT_BAR_W = 10;
    const SECTION_H = 26;
    const SECTION_GAP = 10;
    const FRAG_LABEL_H = 22;
    const FRAG_PAD = 8;
    const NOTE_H = 40;
    const NOTE_W = 160;
    const MARGIN_LEFT = 40;
    const LAYER_ID = 'layer0';

    let nextId = 0;
    function newId() { return nextId++; }

    function escHtml(t) {
      return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;').replace(/\\n/g, '<br/>');
    }

    function mkText(text, w, fontSize, opts) {
      return {
        x: (opts && opts.x) || 2, y: (opts && opts.y) || 0,
        rotation: 0, id: newId(), uid: null,
        width: w, height: (opts && opts.h) || 14,
        lockAspectRatio: false, lockShape: false, order: 'auto', hidden: false,
        graphic: {
          type: 'Text',
          Text: {
            tid: null, valign: (opts && opts.valign) || 'middle',
            overflow: 'both', vposition: 'none', hposition: 'none',
            html: `<p style="text-align:${(opts && opts.align) || 'center'};"><span style="font-size:${fontSize}px;${(opts && opts.bold) ? 'font-weight:bold;' : ''}">${escHtml(text)}</span></p>`,
            paddingLeft: 0, paddingRight: 0, paddingBottom: 2, paddingTop: 2,
            outerPaddingLeft: 6, outerPaddingRight: 6, outerPaddingBottom: 2, outerPaddingTop: 6,
          },
        },
        children: null, layerId: LAYER_ID,
      };
    }

    function mkRect(x, y, w, h, uid, fill, stroke, sWidth, children) {
      return {
        x, y, rotation: 0, id: newId(), uid,
        width: w, height: h, lockAspectRatio: false, lockShape: false,
        order: 0, hidden: false,
        graphic: {
          type: 'Shape',
          Shape: {
            tid: 'com.gliffy.stencil.rectangle.basic_v1',
            strokeWidth: sWidth, strokeColor: stroke, fillColor: fill,
            gradient: false, dropShadow: false, state: 0, opacity: 1,
          },
        },
        children: children || null, layerId: LAYER_ID, linkMap: [],
      };
    }

    function mkLine(x, y, w, h, cp, uid, opts) {
      return {
        x, y, rotation: 0, id: newId(), uid,
        width: w, height: h, lockAspectRatio: false, lockShape: false,
        order: 0, hidden: false,
        graphic: {
          type: 'Line',
          Line: {
            strokeWidth: (opts && opts.sw) || 1,
            strokeColor: (opts && opts.sc) || '#000000',
            fillColor: 'none',
            dashStyle: (opts && opts.dash) || null,
            startArrow: 0, endArrow: (opts && opts.endArrow) || 0,
            startArrowRotation: 'auto', endArrowRotation: 'auto',
            ortho: !!(opts && opts.ortho),
            interpolationType: 'linear',
            cornerRadius: (opts && opts.corner) || null,
            controlPath: cp, lockSegments: {},
          },
        },
        children: (opts && opts.children) || [], layerId: LAYER_ID, linkMap: [],
      };
    }

    // ==================================================================
    // PHASE 1: Parse PlantUML into structured events
    // ==================================================================
    const srcLines = puml.split('\n');
    const participants = [];
    const events = [];
    const sections = [];
    let currentSection = null;
    let inSkinparamBlock = false;
    let inNote = false;
    let notePosition = null;
    let noteTarget = null;
    let noteBody = [];

    for (const line of srcLines) {
      const l = line.trim();
      if (!l || /^@start|^@end|^title\b|^!theme\b|^'/i.test(l)) continue;
      if (/^skinparam\b/i.test(l)) { if (l.includes('{')) inSkinparamBlock = true; continue; }
      if (inSkinparamBlock) { if (l.includes('}')) inSkinparamBlock = false; continue; }
      if (/^\|\|\|$/.test(l)) continue;

      const secMatch = l.match(/^==\s*(.+?)\s*==\s*$/);
      if (secMatch) {
        if (currentSection) sections.push(currentSection);
        const sm = secMatch[1].match(/^Section\s+([\w]+)[:\s]*(.*)/i);
        currentSection = { id: sm ? sm[1] : String(sections.length + 1), title: sm ? sm[2].trim() : secMatch[1], msgObjIds: [] };
        events.push({ type: 'section', id: currentSection.id, title: currentSection.title });
        continue;
      }

      if (/^end\s*note/i.test(l)) {
        if (inNote && noteBody.length) events.push({ type: 'note', position: notePosition, target: noteTarget, text: noteBody.join('\n') });
        inNote = false; noteBody = [];
        continue;
      }
      if (inNote) { if (l) noteBody.push(l); continue; }
      const noteInline = l.match(/^note\s+(right\s+of|left\s+of|over)\s+(.+?)\s*:\s*(.+)/i);
      if (noteInline) { events.push({ type: 'note', position: noteInline[1], target: noteInline[2], text: noteInline[3] }); continue; }
      const noteMulti = l.match(/^note\s+(right\s+of|left\s+of|over)\s+(.+)/i);
      if (noteMulti) { inNote = true; notePosition = noteMulti[1]; noteTarget = noteMulti[2]; noteBody = []; continue; }
      if (/^note\b/i.test(l)) { if (!l.includes(':')) inNote = true; continue; }

      const fragStart = l.match(/^(alt|opt|loop|group|critical|break|par)\b\s*(.*)/i);
      if (fragStart) { events.push({ type: 'fragment_start', kind: fragStart[1].toLowerCase(), label: fragStart[2].replace(/^#\w+\s*/, '').trim() }); continue; }
      if (/^else\b/i.test(l)) { events.push({ type: 'fragment_else', label: l.replace(/^else\s*/i, '').trim() }); continue; }
      if (/^end\s*$/i.test(l)) { events.push({ type: 'fragment_end' }); continue; }

      const actMatch = l.match(/^(activate|deactivate)\s+(\S+)/i);
      if (actMatch) { events.push({ type: actMatch[1].toLowerCase(), alias: actMatch[2] }); continue; }

      const pMatch = l.match(/^(participant|actor|database)\s+"([^"]+)"\s+as\s+(\S+)/i);
      if (pMatch) { participants.push({ type: pMatch[1].toLowerCase(), label: pMatch[2], alias: pMatch[3].replace(/#[0-9A-Fa-f]+$/, '') }); continue; }
      const pSimple = l.match(/^(participant|actor|database)\s+(\S+)/i);
      if (pSimple) { const a = pSimple[2].replace(/#[0-9A-Fa-f]+$/, ''); participants.push({ type: pSimple[1].toLowerCase(), label: a, alias: a }); continue; }

      const arrowMatch = l.match(/^(\S+)\s*(<?--?>?>?|<?->>|<<?--?)\s*(\S+)\s*:\s*(.*)$/);
      if (arrowMatch) {
        let [, from, arrow, to, label] = arrowMatch;
        if (arrow.startsWith('<')) { [from, to] = [to, from]; }
        events.push({ type: 'message', from, to, label, isDashed: arrow.includes('--'), isAsync: arrow.includes('>>') });
      }
    }
    if (currentSection) sections.push(currentSection);

    // ==================================================================
    // PHASE 2: Layout — walk events and emit Gliffy objects
    // ==================================================================
    const aliasToIdx = {};
    const aliasToX = {};
    for (let i = 0; i < participants.length; i++) {
      aliasToIdx[participants[i].alias] = i;
      aliasToX[participants[i].alias] = MARGIN_LEFT + i * SPACING_X + BOX_W / 2;
    }
    const diagL = MARGIN_LEFT;
    const diagR = MARGIN_LEFT + Math.max(0, participants.length - 1) * SPACING_X + BOX_W;
    const diagW = diagR - diagL;

    const bgObjects = [];
    const fgObjects = [];

    // Participant header boxes
    const pObjIds = {};
    for (let i = 0; i < participants.length; i++) {
      const p = participants[i];
      const fill = p.type === 'database' ? '#F5F5F5' : p.type === 'actor' ? '#E8F5E9' : '#E3F2FD';
      const box = mkRect(MARGIN_LEFT + i * SPACING_X, HEADER_Y, BOX_W, HEADER_H,
        'com.gliffy.shape.uml.uml_v2.sequence.lifeline', fill, '#333333', 2,
        [mkText(p.label, BOX_W - 4, 12, null)]);
      pObjIds[p.alias] = box.id;
      fgObjects.push(box);
    }

    let curY = LIFELINE_TOP;
    const fragmentStack = [];
    const actStarts = {};
    const actRanges = [];
    const sectionObjIds = {};
    let activeSectionId = null;

    for (const evt of events) {
      switch (evt.type) {

        case 'section': {
          activeSectionId = evt.id;
          if (!sectionObjIds[activeSectionId]) sectionObjIds[activeSectionId] = [];
          curY += SECTION_GAP;
          bgObjects.push(mkLine(diagL - 10, curY + SECTION_H / 2, diagW + 20, 0,
            [[0, 0], [diagW + 20, 0]],
            'com.gliffy.shape.uml.uml_v2.sequence.section_line',
            { sc: '#888888', dash: [6, 4] }));
          const tw = Math.min(evt.title.length * 8 + 24, 220);
          bgObjects.push(mkRect(diagL + (diagW - tw) / 2, curY + 2, tw, SECTION_H - 4,
            'com.gliffy.shape.uml.uml_v2.sequence.section_label', '#FFFFFF', '#888888', 1,
            [mkText(evt.title, tw - 4, 11, { bold: true })]));
          curY += SECTION_H + SECTION_GAP;
          break;
        }

        case 'note': {
          const alias = evt.target ? evt.target.replace(/,\s*/g, ',').split(',')[0].trim() : null;
          const pIdx = alias ? aliasToIdx[alias] : 0;
          const baseX = pIdx != null ? aliasToX[participants[pIdx].alias] : MARGIN_LEFT;
          const isRight = /right/i.test(evt.position || 'right');
          const nX = isRight ? baseX + BOX_W / 2 + 10 : baseX - BOX_W / 2 - NOTE_W - 10;
          const textLines = evt.text.split('\n');
          const nH = Math.max(NOTE_H, textLines.length * 16 + 12);
          fgObjects.push(mkRect(Math.max(0, nX), curY, NOTE_W, nH,
            'com.gliffy.shape.uml.uml_v2.sequence.note', '#FFFFCC', '#CCCC00', 1,
            [mkText(textLines.join('\n'), NOTE_W - 8, 11, { x: 4, y: 4, h: nH - 8, valign: 'top', align: 'left' })]));
          curY += nH + 8;
          break;
        }

        case 'fragment_start': {
          fragmentStack.push({ kind: evt.kind, label: evt.label, startY: curY, branches: [] });
          curY += FRAG_LABEL_H;
          break;
        }

        case 'fragment_else': {
          if (fragmentStack.length) {
            fragmentStack[fragmentStack.length - 1].branches.push({ label: evt.label, y: curY });
            curY += FRAG_LABEL_H;
          }
          break;
        }

        case 'fragment_end': {
          if (!fragmentStack.length) break;
          const frag = fragmentStack.pop();
          curY += FRAG_PAD;
          const fX = diagL - 20;
          const fW = diagW + 40;
          const fH = curY - frag.startY;

          bgObjects.push(mkRect(fX, frag.startY, fW, fH,
            'com.gliffy.shape.uml.uml_v2.sequence.combined_fragment', '#F0F0FF', '#7B68EE', 1.5, null));

          const kw = frag.kind.length * 9 + 12;
          bgObjects.push(mkRect(fX, frag.startY, kw, 20,
            'com.gliffy.shape.uml.uml_v2.sequence.fragment_label', '#E8E0FF', '#7B68EE', 1,
            [mkText(frag.kind.toUpperCase(), kw - 4, 10, { bold: true })]));

          if (frag.label) {
            bgObjects.push(mkRect(fX + kw + 4, frag.startY + 2, frag.label.length * 7 + 16, 16,
              'com.gliffy.shape.uml.uml_v2.sequence.fragment_condition', 'none', 'none', 0,
              [mkText('[' + frag.label + ']', frag.label.length * 7 + 16, 10, { align: 'left' })]));
          }

          for (const br of frag.branches) {
            bgObjects.push(mkLine(fX, br.y, fW, 0, [[0, 0], [fW, 0]],
              'com.gliffy.shape.uml.uml_v2.sequence.fragment_separator',
              { sc: '#7B68EE', dash: [6, 4] }));
            if (br.label) {
              bgObjects.push(mkRect(fX + 8, br.y + 2, br.label.length * 7 + 16, 16,
                'com.gliffy.shape.uml.uml_v2.sequence.fragment_condition', 'none', 'none', 0,
                [mkText('[' + br.label + ']', br.label.length * 7 + 16, 10, { align: 'left' })]));
            }
          }
          curY += FRAG_PAD;
          break;
        }

        case 'activate': {
          if (!actStarts[evt.alias]) actStarts[evt.alias] = [];
          actStarts[evt.alias].push(curY);
          break;
        }

        case 'deactivate': {
          const starts = actStarts[evt.alias];
          if (starts && starts.length) actRanges.push({ alias: evt.alias, startY: starts.pop(), endY: curY });
          break;
        }

        case 'message': {
          const fi = aliasToIdx[evt.from];
          const ti = aliasToIdx[evt.to];
          if (fi == null || ti == null) break;
          const fromX = aliasToX[evt.from];
          const toX = aliasToX[evt.to];
          const isSelf = fi === ti;
          const endArrow = evt.isAsync ? 6 : 2;

          if (isSelf) {
            const lw = SELF_MSG_W;
            const lh = SELF_MSG_H;
            const lineObj = mkLine(fromX, curY, lw, lh,
              [[0, 0], [lw, 0], [lw, lh], [0, lh]],
              'com.gliffy.shape.uml.uml_v2.sequence.message',
              { endArrow, dash: evt.isDashed ? [4, 4] : null, ortho: true, corner: 5 });
            if (evt.label) {
              const tc = mkText(evt.label, Math.max(evt.label.length * 6.5, 80), 11, { x: lw + 4, y: lh / 2 - 7 });
              lineObj.children = [tc];
            }
            fgObjects.push(lineObj);
            if (activeSectionId) sectionObjIds[activeSectionId].push(lineObj.id);
            curY += lh + 18;
          } else {
            const minX = Math.min(fromX, toX);
            const lw = Math.abs(toX - fromX);
            const goesRight = toX > fromX;
            const lineObj = mkLine(minX, curY, lw, 0,
              goesRight ? [[0, 0], [lw, 0]] : [[lw, 0], [0, 0]],
              'com.gliffy.shape.uml.uml_v2.sequence.message',
              { endArrow, dash: evt.isDashed ? [4, 4] : null });
            if (evt.label) {
              const tc = mkText(evt.label, lw - 8, 11, { x: 4, y: -18 });
              lineObj.children = [tc];
            }
            fgObjects.push(lineObj);
            if (activeSectionId) sectionObjIds[activeSectionId].push(lineObj.id);
            curY += MSG_SPACING;
          }
          break;
        }
      }
    }

    // Close unclosed activations
    for (const alias of Object.keys(actStarts)) {
      const starts = actStarts[alias];
      while (starts && starts.length) actRanges.push({ alias, startY: starts.pop(), endY: curY });
    }

    // Lifeline dashed lines
    const lifelineBottom = curY + 30;
    for (let i = 0; i < participants.length; i++) {
      const cx = aliasToX[participants[i].alias];
      const topY = HEADER_Y + HEADER_H;
      const lh = lifelineBottom - topY;
      bgObjects.push(mkLine(cx, topY, 0, lh, [[0, 0], [0, lh]],
        'com.gliffy.shape.uml.uml_v2.sequence.lifeline_dash',
        { sc: '#999999', dash: [5, 5] }));
    }

    // Activation bars
    for (const a of actRanges) {
      const cx = aliasToX[a.alias];
      const h = a.endY - a.startY;
      if (h > 0) {
        fgObjects.push(mkRect(cx - ACT_BAR_W / 2, a.startY, ACT_BAR_W, h,
          'com.gliffy.shape.uml.uml_v2.sequence.activation', '#DAEEFF', '#6699CC', 1, null));
      }
    }

    // Assemble objects: backgrounds first (lower z), then foreground
    const allObjects = [...bgObjects, ...fgObjects];
    for (let i = 0; i < allObjects.length; i++) allObjects[i].order = i;

    // Resolve sections
    const resolvedSections = sections.map(sec => ({
      id: sec.id, title: sec.title,
      objectIds: sectionObjIds[sec.id] || [],
    }));

    const totalW = Math.max(400, diagR + 60);
    const totalH = Math.max(300, lifelineBottom + 40);

    const result = {
      contentType: 'application/gliffy+json',
      version: '1.3',
      metadata: {
        title: 'Sequence Diagram', revision: 0, exportBorder: false,
        loadPosition: 'default',
        libraries: ['com.gliffy.libraries.uml.uml_v2.sequence'],
        autosaveDisabled: false,
      },
      embeddedResources: { index: 0, resources: [] },
      stage: {
        objects: allObjects,
        background: '#FFFFFF',
        width: totalW, height: totalH, maxWidth: 5000, maxHeight: 5000,
        nodeIndex: nextId, autoFit: true, exportBorder: false,
        gridOn: true, snapToGrid: true, drawingGuidesOn: true,
        shapeStyles: {}, lineStyles: {}, textStyles: {}, themeData: null,
        viewportType: 'default',
        layers: [{ guid: LAYER_ID, order: 0, name: 'Layer 0', active: true, locked: false, visible: true, nodeIndex: nextId }],
        fitBB: { min: { x: 20, y: 20 }, max: { x: totalW, y: totalH } },
        printModel: { pageSize: 'Letter', portrait: true, fitToOnePage: false, displayPageBreaks: false },
      },
    };
    if (resolvedSections.length > 0) result.sections = resolvedSections;
    return JSON.stringify(result, null, 2);
  }

  // =========================================================================
  // Mermaid -> Gliffy JSON (convenience)
  // =========================================================================
  function mermaidToGliffyJson(src) {
    return plantumlToGliffyJson(mermaidToPlantUml(src));
  }

  // =========================================================================
  // Cross-editor navigation helper
  // =========================================================================
  function convertAndNavigate(content, targetEditor) {
    localStorage.setItem('convert-payload', JSON.stringify({
      target: targetEditor,
      content: content,
      timestamp: Date.now(),
    }));
    window.location.href = targetEditor === 'plantuml' ? '/' :
      targetEditor === 'mermaid' ? '/mermaid' : '/gliffy';
  }

  function checkConvertPayload() {
    const raw = localStorage.getItem('convert-payload');
    if (!raw) return null;
    localStorage.removeItem('convert-payload');
    try {
      const payload = JSON.parse(raw);
      if (Date.now() - payload.timestamp < 30000) return payload;
    } catch (e) { /* ignore */ }
    return null;
  }

  // =========================================================================
  // Gliffy JSON info extraction (for info panel)
  // =========================================================================
  function extractGliffyInfo(jsonStr) {
    let data;
    try {
      data = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
    } catch (e) {
      return { valid: false, error: 'Invalid JSON' };
    }
    if (!data.stage || !data.stage.objects) {
      return { valid: false, error: 'Not a Gliffy diagram (no stage.objects)' };
    }
    const objects = data.stage.objects;
    let shapes = 0, lines = 0, texts = 0;
    const participantNames = [];
    const messageLabels = [];

    for (const obj of objects) {
      if (!obj || obj.hidden) continue;
      const gType = obj.graphic && obj.graphic.type;
      const text = extractText(obj);
      if (gType === 'Line') {
        lines++;
        if (text) messageLabels.push(text);
      } else if (gType === 'Shape') {
        shapes++;
        if (text) participantNames.push(text);
      }
    }

    return {
      valid: true,
      title: (data.metadata && data.metadata.title) || 'Untitled',
      version: data.version || '?',
      objectCount: objects.length,
      shapes, lines,
      participants: participantNames,
      messages: messageLabels,
    };
  }

  return {
    plantumlToMermaid,
    mermaidToPlantUml,
    gliffyJsonToPlantUml,
    gliffyJsonToMermaid,
    plantumlToGliffyJson,
    mermaidToGliffyJson,
    convertAndNavigate,
    checkConvertPayload,
    extractGliffyInfo,
  };

})();
