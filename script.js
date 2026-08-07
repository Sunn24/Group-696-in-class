const MAX_PER_GROUP = 7;
const board = document.getElementById('board');
const toastEl = document.getElementById('toast');
let dragged = null; // { card, fromCol }
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

function attachCardEvents(card) {
  card.addEventListener('dragstart', () => {
    dragged = { card, fromCol: card.closest('.col') };
    card.classList.add('dragging');
  });
  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    dragged = null;
  });
}

document.querySelectorAll('.card').forEach(attachCardEvents);

document.querySelectorAll('.col').forEach(col => {
  col.addEventListener('dragover', (e) => {
    e.preventDefault();
    col.classList.add('dragover');
  });
  col.addEventListener('dragleave', () => {
    col.classList.remove('dragover');
  });
  col.addEventListener('drop', (e) => {
    e.preventDefault();
    col.classList.remove('dragover');
    if (!dragged) return;
    if (dragged.fromCol === col) return;

    const isPool = col.classList.contains('pool');
    const list = col.querySelector('.list');
    const currentCount = list.querySelectorAll('.card').length;

    if (!isPool && currentCount >= MAX_PER_GROUP) {
      const headerText = col.querySelector('.col-head span').textContent;
      showToast(`❌ ${headerText} มีสมาชิกครบ ${MAX_PER_GROUP} คนแล้ว ไม่สามารถเพิ่มได้`);
      return;
    }

    const placeholder = list.querySelector('.placeholder');
    if (placeholder) placeholder.remove();
    list.appendChild(dragged.card);
    updateCounts();
    dragged = null;
  });
});
