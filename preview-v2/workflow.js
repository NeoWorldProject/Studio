// Nodes own their positions. Every connector is anchored to measured node bounds.
(() => {
  const board = document.querySelector('.nw-workflow');
  if (!board) return;
  const svg = board.querySelector('.nw-connections');
  const layer = svg.querySelector('.nw-edges');
  const toggle = board.querySelector('.nw-motion-toggle');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const nodes = [...board.querySelectorAll('.nw-node')];
  const NS = 'http://www.w3.org/2000/svg';
  let motionPaused = reduced.matches;
  let visible = false;

  // Waypoints run only through reserved gutters; endpoints follow DOM measurements.
  const edges = [
    { from:'observations', to:'agent', a:'right', b:'left' },
    { from:'agent', to:'tools', a:'right', b:'left', af:.42, bf:.42 },
    { from:'tools', to:'agent', a:'left', b:'right', af:.65, bf:.65 },
    { from:'agent', to:'handoff', a:'bottom', b:'top', route:(a,b)=>[[a.x,365],[b.x,365]] },
    { from:'handoff', to:'program', a:'bottom', b:'top', af:.43 },
    { from:'program', to:'refine', a:'right', b:'left', kind:'object' },
    { from:'refine', to:'feedback', a:'right', b:'left', kind:'object' },
    { from:'feedback', to:'articulation', a:'right', b:'left', kind:'object' },
    { from:'articulation', to:'integration', a:'right', b:'left', kind:'object' },
    { from:'integration', to:'scene', a:'top', b:'bottom' },
    { from:'scene', to:'agent', a:'top', b:'top', kind:'feedback', route:(a,b)=>[[a.x,103],[b.x,103]] },
    { from:'feedback', to:'program', a:'bottom', b:'bottom', kind:'object feedback', route:(a,b)=>[[a.x,729],[b.x,729]] },
    { from:'scene', to:'simulation', a:'right', b:'right', af:.5, bf:.5, route:(a,b)=>[[1164,a.y],[1164,b.y]] },
    { from:'policy', to:'simulation', a:'right', b:'left', af:.38, bf:.38 },
    { from:'simulation', to:'policy', a:'left', b:'right', af:.62, bf:.62, kind:'feedback' },
    { from:'policy', to:'deploy', a:'left', b:'right' },
  ];

  function element(name, attrs) {
    const el = document.createElementNS(NS, name);
    Object.entries(attrs).forEach(([key,value]) => el.setAttribute(key, value));
    return el;
  }

  function anchor(id, side, fraction = .5) {
    const node = board.querySelector(`#nw-${id}`).getBoundingClientRect();
    const box = board.getBoundingClientRect();
    const scale = box.width / 1180;
    const x = (node.left - box.left) / scale;
    const y = (node.top - box.top) / scale;
    const w = node.width / scale, h = node.height / scale;
    if (side === 'left') return {x, y:y+h*fraction};
    if (side === 'right') return {x:x+w, y:y+h*fraction};
    if (side === 'top') return {x:x+w*fraction, y};
    return {x:x+w*fraction, y:y+h};
  }

  function roundedPath(points) {
    let d = `M${points[0].x},${points[0].y}`;
    for (let i=1; i<points.length-1; i++) {
      const prev=points[i-1], curr=points[i], next=points[i+1];
      const inLen=Math.hypot(curr.x-prev.x,curr.y-prev.y);
      const outLen=Math.hypot(next.x-curr.x,next.y-curr.y);
      if (!inLen || !outLen) continue;
      const radius=Math.min(10,inLen/2,outLen/2);
      const before={x:curr.x+(prev.x-curr.x)*radius/inLen,y:curr.y+(prev.y-curr.y)*radius/inLen};
      const after={x:curr.x+(next.x-curr.x)*radius/outLen,y:curr.y+(next.y-curr.y)*radius/outLen};
      d+=` L${before.x},${before.y} Q${curr.x},${curr.y} ${after.x},${after.y}`;
    }
    const end=points[points.length-1];
    return d+` L${end.x},${end.y}`;
  }

  function draw() {
    const fragment=document.createDocumentFragment();
    edges.forEach((edge,index)=>{
      const a=anchor(edge.from,edge.a,edge.af), b=anchor(edge.to,edge.b,edge.bf);
      const waypoints=(edge.route?.(a,b)||[]).map(([x,y])=>({x,y}));
      const d=roundedPath([a,...waypoints,b]);
      const g=element('g',{'class':`nw-edge ${(edge.kind||'').split(' ').filter(Boolean).map(k=>`is-${k}`).join(' ')}`,'data-from':edge.from,'data-to':edge.to});
      g.append(element('path',{'class':'nw-edge-base',d}));
      const pulse=element('path',{'class':'nw-edge-pulse',d,pathLength:1});
      pulse.style.animationDelay=`${-index*.37}s`;
      g.append(pulse,element('circle',{'class':'nw-edge-dot',cx:a.x,cy:a.y,r:2.5}));
      fragment.append(g);
    });
    layer.replaceChildren(fragment);
  }

  function trace(id) {
    board.classList.toggle('is-tracing',Boolean(id));
    layer.querySelectorAll('.nw-edge').forEach(edge=>edge.classList.toggle('is-connected',edge.dataset.from===id||edge.dataset.to===id));
  }
  nodes.forEach(node=>{
    const id=node.id.slice(3);
    node.addEventListener('pointerenter',()=>trace(id));
    node.addEventListener('pointerleave',()=>trace(document.activeElement.closest?.('.nw-node')?.id.slice(3)));
    node.addEventListener('focusin',()=>trace(id));
    node.addEventListener('focusout',event=>{if(!node.contains(event.relatedTarget))trace(null);});
  });

  function updateMotion() {
    board.classList.toggle('is-running',visible&&!motionPaused);
    toggle.setAttribute('aria-pressed',String(motionPaused));
    toggle.innerHTML=motionPaused?'<span aria-hidden="true">▶</span> Play motion':'<span aria-hidden="true">Ⅱ</span> Pause motion';
  }
  toggle.addEventListener('click',()=>{motionPaused=!motionPaused;updateMotion();});
  reduced.addEventListener('change',event=>{motionPaused=event.matches;updateMotion();});
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries=>{
      visible=entries[0].isIntersecting;
      if(visible)board.classList.add('is-entered');
      updateMotion();
    },{threshold:.08}).observe(board);
  } else {visible=true;board.classList.add('is-entered');}
  let frame;
  const queueDraw=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(draw);};
  const resizeObserver = new ResizeObserver(queueDraw);
  resizeObserver.observe(board);
  nodes.forEach(node=>resizeObserver.observe(node));
  document.fonts.ready.then(queueDraw);
  updateMotion();
  draw();
})();
