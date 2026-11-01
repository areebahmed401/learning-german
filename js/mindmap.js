// Mind map: root in the middle, branches to both sides (one side on narrow screens).
// Click a node with children to fold or unfold it.
const NS = 'http://www.w3.org/2000/svg';
const GAP_X = 46;
const GAP_Y = 10;
const PALETTE = ['var(--accent)', 'var(--der)', 'var(--die)', 'var(--das)', 'var(--gold)', '#8a6bd1'];

const s = (tag, attrs = {}, text) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (text != null) el.textContent = text;
  return el;
};

function colorFor(label, i) {
  const m = /^(der|die|das)\b/i.exec(label);
  return m ? `var(--${m[1].toLowerCase()})` : PALETTE[i % PALETTE.length];
}

function size(node, depth) {
  const fs = depth === 0 ? 17 : depth === 1 ? 14.5 : 13;
  const w = Math.min(240, Math.max(node.label.length * fs * 0.56, (node.note || '').length * 6.6) + 26);
  return { w, h: node.note ? 46 : 32, fs };
}

export function renderMindmap(container, root) {
  const collapsed = new Set();
  // two-sided when it fits the container, otherwise everything on the right (scrolls sideways)
  const draw = () => {
    const room = container.clientWidth - 20;
    let svg = build(root, collapsed, false, draw);
    if (+svg.getAttribute('width') > room) svg = build(root, collapsed, true, draw);
    container.replaceChildren(svg);
  };
  draw();
  let last = container.clientWidth;
  new ResizeObserver(() => {
    if (Math.abs(container.clientWidth - last) > 30) { last = container.clientWidth; draw(); }
  }).observe(container);
}

function build(root, collapsed, narrow, redraw) {
  const nodes = [];
  const links = [];

  // subtree height, respecting folded nodes
  const height = (n, d, path) => {
    const { h } = size(n, d);
    const kids = !collapsed.has(path) ? n.children || [] : [];
    if (!kids.length) return h;
    const sum = kids.reduce((acc, k, i) => acc + height(k, d + 1, `${path}/${i}`) + (i ? GAP_Y : 0), 0);
    return Math.max(h, sum);
  };

  // place a subtree; dir = 1 (right) or -1 (left); x = inner edge of the node
  const place = (n, d, path, x, yTop, dir, color) => {
    const { w, h, fs } = size(n, d);
    const H = height(n, d, path);
    const cy = yTop + H / 2;
    const cx = x + (dir * w) / 2;
    const kids = n.children || [];
    nodes.push({ n, d, path, cx, cy, w, h, fs, color, kids: kids.length, folded: collapsed.has(path) });
    if (!kids.length || collapsed.has(path)) return { cx, cy, w };
    const kidsH = kids.reduce((acc, k, i) => acc + height(k, d + 1, `${path}/${i}`) + (i ? GAP_Y : 0), 0);
    let y = cy - kidsH / 2;
    kids.forEach((k, i) => {
      const kp = `${path}/${i}`;
      const kh = height(k, d + 1, kp);
      const child = place(k, d + 1, kp, x + dir * (w + GAP_X), y, dir, color);
      links.push({ x1: x + dir * w, y1: cy, x2: child.cx - (dir * child.w) / 2, y2: child.cy, color });
      y += kh + GAP_Y;
    });
    return { cx, cy, w };
  };

  const r = size(root, 0);
  const kids = root.children || [];
  const rightCount = narrow ? kids.length : Math.ceil(kids.length / 2);
  const sides = [
    { dir: 1, list: kids.slice(0, rightCount).map((k, i) => [k, i]) },
    { dir: -1, list: kids.slice(rightCount).map((k, i) => [k, i + rightCount]) },
  ];
  const rootX = narrow ? r.w / 2 : 0;
  nodes.push({ n: root, d: 0, path: 'r', cx: rootX, cy: 0, w: r.w, h: r.h + 8, fs: r.fs, color: 'var(--text)', kids: 0, root: true });

  for (const { dir, list } of sides) {
    const hs = list.map(([k, i]) => height(k, 1, `r/${i}`));
    const total = hs.reduce((a, b) => a + b, 0) + GAP_Y * 2 * Math.max(0, list.length - 1);
    let y = -total / 2;
    list.forEach(([k, i], j) => {
      const color = colorFor(k.label, i);
      const child = place(k, 1, `r/${i}`, rootX + dir * (r.w / 2 + GAP_X + 10), y, dir, color);
      links.push({ x1: rootX + (dir * r.w) / 2, y1: 0, x2: child.cx - (dir * child.w) / 2, y2: child.cy, color, thick: true });
      y += hs[j] + GAP_Y * 2;
    });
  }

  const minX = Math.min(...nodes.map((n) => n.cx - n.w / 2)) - 12;
  const maxX = Math.max(...nodes.map((n) => n.cx + n.w / 2)) + 12;
  const minY = Math.min(...nodes.map((n) => n.cy - n.h / 2)) - 12;
  const maxY = Math.max(...nodes.map((n) => n.cy + n.h / 2)) + 12;
  const svg = s('svg', { viewBox: `${minX} ${minY} ${maxX - minX} ${maxY - minY}`, width: maxX - minX, height: maxY - minY, role: 'img', 'aria-label': `Mind map: ${root.label}` });

  for (const l of links) {
    const mx = (l.x1 + l.x2) / 2;
    svg.append(s('path', { class: 'mm-link', d: `M${l.x1},${l.y1} C${mx},${l.y1} ${mx},${l.y2} ${l.x2},${l.y2}`, stroke: l.color, 'stroke-width': l.thick ? 3 : 2 }));
  }
  for (const n of nodes) {
    const g = s('g', { class: `mm-node${n.kids ? ' has-kids' : ''}`, transform: `translate(${n.cx},${n.cy})` });
    const fill = n.root ? 'var(--text)' : n.d === 1 ? n.color : 'var(--surface)';
    g.append(s('rect', {
      x: -n.w / 2, y: -n.h / 2, width: n.w, height: n.h, rx: n.d === 2 ? 8 : 12,
      fill, 'fill-opacity': n.d === 1 ? 0.14 : 1, stroke: n.root ? 'var(--text)' : n.color,
    }));
    const label = s('text', { 'text-anchor': 'middle', y: n.n.note ? -4 : 5, 'font-size': n.fs, 'font-weight': n.d < 2 ? 800 : 700 }, n.n.label + (n.folded ? `  +${n.kids}` : ''));
    if (n.root) label.setAttribute('style', 'fill: var(--bg)');
    g.append(label);
    if (n.n.note) g.append(s('text', { class: 'note', 'text-anchor': 'middle', y: 14, 'font-size': 11.5 }, n.n.note));
    if (n.kids) {
      g.setAttribute('tabindex', '0');
      g.setAttribute('role', 'button');
      g.setAttribute('aria-label', `${n.folded ? 'Unfold' : 'Fold'} ${n.n.label}`);
      const toggle = () => { collapsed.has(n.path) ? collapsed.delete(n.path) : collapsed.add(n.path); redraw(); };
      g.addEventListener('click', toggle);
      g.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggle()));
    }
    svg.append(g);
  }
  return svg;
}
