const MAX_PER_GROUP = 7;
const toastEl = document.getElementById('toast');
let toastTimer = null;

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
}

function updateCounts() {
  document.querySelectorAll('.col').forEach(col => {
    const isPool = col.classList.contains('pool');
    const list = col.querySelector('.list');
    const cardCount = list.querySelectorAll('.card').length;
    const countEl = col.querySelector('.count');
    if (isPool) {
      countEl.textContent = cardCount;
    } else {
      countEl.textContent = `${cardCount}/${MAX_PER_GROUP}`;
      col.classList.toggle('over', cardCount > MAX_PER_GROUP);
    }
    const placeholder = list.querySelector('.placeholder');
    if (cardCount === 0 && !placeholder) {
      const ph = document.createElement('div');
      ph.className = 'placeholder';
      ph.textContent = 'ลากมาวางที่นี่';
      list.appendChild(ph);
    } else if (cardCount > 0 && placeholder) {
      placeholder.remove();
    }
  });
}

// ---- Pointer-based drag & drop (works on mouse, touch, and pen —
// including Safari/iOS and Android, unlike native HTML5 DnD) ----

let drag = null; // { card, fromList, offsetX, offsetY, startX, startY, moved, width, height }
const DRAG_THRESHOLD = 6; // px before we treat it as a real drag, not a tap

function colFromPoint(x, y) {
  const card = drag ? drag.card : null;
  if (card) card.style.display = 'none'; // don't hit ourselves
  const el = document.elementFromPoint(x, y);
  if (card) card.style.display = '';
  return el ? el.closest('.col') : null;
}

function clearDragoverHighlights() {
  document.querySelectorAll('.col.dragover').forEach(c => c.classList.remove('dragover'));
}

function returnCardToOrigin(card, originList) {
  const ph = originList.querySelector('.placeholder');
  if (ph) ph.remove();
  originList.appendChild(card);
}

function onPointerDown(e) {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  const card = e.currentTarget;
  const rect = card.getBoundingClientRect();

  drag = {
    card,
    fromList: card.closest('.list'),
    offsetX: e.clientX - rect.left,
    offsetY: e.clientY - rect.top,
    startX: e.clientX,
    startY: e.clientY,
    width: rect.width,
    height: rect.height,
    moved: false,
  };

  card.setPointerCapture(e.pointerId);
  card.addEventListener('pointermove', onPointerMove);
  card.addEventListener('pointerup', onPointerUp);
  card.addEventListener('pointercancel', onPointerUp);
}

function onPointerMove(e) {
  if (!drag) return;
  const dx = e.clientX - drag.startX;
  const dy = e.clientY - drag.startY;

  if (!drag.moved) {
    if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
    drag.moved = true;
    drag.card.classList.add('dragging');
    drag.card.style.position = 'fixed';
    drag.card.style.width = drag.width + 'px';
    drag.card.style.zIndex = '1000';
    drag.card.style.left = '0px';
    drag.card.style.top = '0px';
    document.body.appendChild(drag.card);
  }

  drag.card.style.left = (e.clientX - drag.offsetX) + 'px';
  drag.card.style.top = (e.clientY - drag.offsetY) + 'px';

  clearDragoverHighlights();
  const col = colFromPoint(e.clientX, e.clientY);
  if (col) col.classList.add('dragover');
}

function onPointerUp(e) {
  if (!drag) return;
  const { card, fromList, moved } = drag;

  card.removeEventListener('pointermove', onPointerMove);
  card.removeEventListener('pointerup', onPointerUp);
  card.removeEventListener('pointercancel', onPointerUp);
  try { card.releasePointerCapture(e.pointerId); } catch (err) {}

  clearDragoverHighlights();

  if (!moved) {
    drag = null;
    return; // treated as a tap/click, nothing to do
  }

  card.classList.remove('dragging');
  card.style.position = '';
  card.style.left = '';
  card.style.top = '';
  card.style.width = '';
  card.style.zIndex = '';

  const targetCol = colFromPoint(e.clientX, e.clientY);
  const fromCol = fromList.closest('.col');

  if (!targetCol || targetCol === fromCol) {
    returnCardToOrigin(card, fromList);
  } else {
    const isPool = targetCol.classList.contains('pool');
    const targetList = targetCol.querySelector('.list');
    const currentCount = targetList.querySelectorAll('.card').length;

    if (!isPool && currentCount >= MAX_PER_GROUP) {
      const headerText = targetCol.querySelector('.col-head span').textContent;
      showToast(`❌ ${headerText} มีสมาชิกครบ ${MAX_PER_GROUP} คนแล้ว ไม่สามารถเพิ่มได้`);
      returnCardToOrigin(card, fromList);
    } else {
      const ph = targetList.querySelector('.placeholder');
      if (ph) ph.remove();
      targetList.appendChild(card);
    }
  }

  updateCounts();
  drag = null;
}

function attachCardEvents(card) {
  card.addEventListener('pointerdown', onPointerDown);
}

document.querySelectorAll('.card').forEach(attachCardEvents);
