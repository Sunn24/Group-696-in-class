const MAX_PER_GROUP = 5;
const toastEl = document.getElementById('toast');
let toastTimer = null;

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
}

// ---- Board / data model ----
// Each card lives in exactly one column at all times, identified by the
// column's data-index (0 = pool, 1-4 = groups). The source of truth for
// *who is in which group* is Firebase (see firebase-config.js); the DOM
// is just a rendering of the latest data we received from it.

const colsByIndex = {};
document.querySelectorAll('.col').forEach(col => {
  colsByIndex[col.dataset.index] = col;
});

// Build the pool's card elements from the name list in student_names.js, so the
// roster lives in one file and never has to be hand-edited into the HTML.
const poolListEl = document.getElementById('poolList');
(typeof STUDENT_NAMES !== 'undefined' ? STUDENT_NAMES : []).forEach(name => {
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.name = name;
  card.textContent = name;
  poolListEl.appendChild(card);
});

const cardsByName = {};
document.querySelectorAll('.card').forEach(card => {
  cardsByName[card.dataset.name] = card;
});

function sortList(list) {
  const cards = Array.from(list.querySelectorAll('.card'));
  cards.sort((a, b) => a.dataset.name.localeCompare(b.dataset.name, 'en', { sensitivity: 'base' }));
  cards.forEach(card => list.appendChild(card));
}

function refreshColumn(col) {
  const isPool = col.classList.contains('pool');
  const list = col.querySelector('.list');

  sortList(list);

  const cardCount = list.querySelectorAll('.card').length;
  const countEl = col.querySelector('.count');
  if (isPool) {
    if (countEl) countEl.remove();
  } else {
    countEl.textContent = `${cardCount}/${MAX_PER_GROUP}`;
    col.classList.toggle('over', cardCount > MAX_PER_GROUP);
    col.classList.toggle('full', cardCount === MAX_PER_GROUP);
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
}

function refreshAllColumns() {
  document.querySelectorAll('.col').forEach(refreshColumn);
}

// ---- Search box for the pool column ----
// Filters cards currently sitting in the pool by name (case-insensitive,
// partial match). Cards that have been assigned to a group are always
// shown there regardless of the search text — the filter only hides pool
// cards, it never moves anything.
const poolSearchEl = document.getElementById('poolSearch');

function applyPoolFilter() {
  if (!poolSearchEl) return;
  const q = poolSearchEl.value.trim().toLowerCase();
  const poolList = colsByIndex['0'].querySelector('.list');
  let anyVisible = false;

  poolList.querySelectorAll('.card').forEach(card => {
    const match = !q || card.dataset.name.toLowerCase().includes(q);
    card.style.display = match ? '' : 'none';
    if (match) anyVisible = true;
  });

  let noResult = poolList.querySelector('.no-result');
  if (!q || anyVisible) {
    if (noResult) noResult.remove();
  } else {
    const placeholder = poolList.querySelector('.placeholder:not(.no-result)');
    if (placeholder) placeholder.remove();
    if (!noResult) {
      noResult = document.createElement('div');
      noResult.className = 'placeholder no-result';
      poolList.appendChild(noResult);
    }
    noResult.textContent = `ไม่พบชื่อที่ตรงกับ "${poolSearchEl.value.trim()}"`;
  }
}

if (poolSearchEl) {
  poolSearchEl.addEventListener('input', applyPoolFilter);
}

// Render the whole board from the latest data snapshot coming from Firebase.
// `data` looks like: { "Akkaravit": 3, "Boonyakorn": 1, ... }
// A name missing from `data` is treated as still being in the pool (0).
function renderBoard(data) {
  const assignments = data || {};
  Object.keys(cardsByName).forEach(name => {
    const idx = assignments[name] !== undefined ? String(assignments[name]) : '0';
    const targetCol = colsByIndex[idx] || colsByIndex['0'];
    const targetList = targetCol.querySelector('.list');
    if (cardsByName[name].parentElement !== targetList) {
      targetList.appendChild(cardsByName[name]);
    }
  });
  refreshAllColumns();
  applyPoolFilter();
}

// Ask Firebase to move `name` into group `toIndex`. The transaction re-checks
// the current member count on the server side, so two people dropping into
// the same last open slot at the same instant can't both succeed.
function moveCard(name, toIndex) {
  assignmentsRef.transaction((current) => {
    const data = current || {};
    if (toIndex !== '0') {
      const countInTarget = Object.entries(data)
        .filter(([n, idx]) => String(idx) === String(toIndex) && n !== name)
        .length;
      if (countInTarget >= MAX_PER_GROUP) {
        return; // abort — someone else filled this group first
      }
    }
    data[name] = toIndex === '0' ? null : Number(toIndex); // null deletes the key (= pool)
    return data;
  }, (error, committed) => {
    if (error) {
      console.error('Move failed:', error);
      showToast('เชื่อมต่อฐานข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง');
    } else if (!committed) {
      const headerText = colsByIndex[toIndex].querySelector('.col-head span').textContent;
      showToast(`❌ ${headerText} มีสมาชิกครบ ${MAX_PER_GROUP} คนแล้ว ไม่สามารถเพิ่มได้`);
    }
    // On success, the 'value' listener below fires and calls renderBoard()
    // for us — including for every other person's open tab.
  });
}

// Live subscription: keeps every connected browser in sync, and is also
// what fills in the saved state the moment someone opens the page.
assignmentsRef.on('value', (snapshot) => {
  renderBoard(snapshot.val());
}, (error) => {
  console.error('Firebase read failed:', error);
  showToast('เชื่อมต่อฐานข้อมูลไม่ได้ กรุณาตรวจสอบการตั้งค่า firebase-config.js');
});

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
  if (drag) return; // a drag is already in progress (e.g. second finger) — ignore
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  const card = e.currentTarget;
  const rect = card.getBoundingClientRect();

  drag = {
    card,
    pointerId: e.pointerId,
    fromList: card.closest('.list'),
    offsetX: e.clientX - rect.left,
    offsetY: e.clientY - rect.top,
    startX: e.clientX,
    startY: e.clientY,
    width: rect.width,
    height: rect.height,
    moved: false,
  };

  // Listen on `document`, not the card: once the card is re-parented to
  // <body> mid-drag (see onPointerMove), an element that still holds
  // pointer capture can silently lose it in some browsers, which would
  // stop card-scoped listeners from ever firing again and leave the
  // card stuck mid-drag. Document-level listeners aren't affected by
  // where the card lives in the DOM, so they keep receiving events
  // through pointerup no matter what.
  document.addEventListener('pointermove', onPointerMove);
  document.addEventListener('pointerup', onPointerUp);
  document.addEventListener('pointercancel', onPointerUp);
}

function onPointerMove(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
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
  if (!drag || e.pointerId !== drag.pointerId) return;
  const { card, fromList, moved } = drag;

  document.removeEventListener('pointermove', onPointerMove);
  document.removeEventListener('pointerup', onPointerUp);
  document.removeEventListener('pointercancel', onPointerUp);

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

  // Snap back to the old spot right away — the real, authoritative position
  // gets set moments later by the Firebase 'value' listener once the write
  // (or rejection) comes back, so this stays correct even if someone else
  // filled the target group in the meantime.
  returnCardToOrigin(card, fromList);
  refreshColumn(fromCol);

  if (targetCol && targetCol !== fromCol) {
    moveCard(card.dataset.name, targetCol.dataset.index);
  }

  drag = null;
}

function attachCardEvents(card) {
  card.addEventListener('pointerdown', onPointerDown);
}

document.querySelectorAll('.card').forEach(attachCardEvents);
refreshAllColumns();

// Test hook only — not used by the app itself. Lets test.html attach the
// real drag handler to cards it creates dynamically after page load.
window.__attachCardEvents = attachCardEvents;

// ---- Admin actions: Reset / Random ----
// Everyone who opens the page can see these buttons, so they're gated by a
// simple PIN. This is NOT real security (anyone could read this file), it's
// just enough friction to stop students from clicking it by accident or on
// a whim. Change ADMIN_PIN to whatever you like.
const ADMIN_PIN = '2104696SystemAdmin';

function checkAdminPin() {
  if (sessionStorage.getItem('isAdmin') === 'true') return true;
  const entered = prompt('กรุณาใส่รหัสผ่านสำหรับผู้ดูแล:');
  if (entered === null) return false; // cancelled
  if (entered === ADMIN_PIN) {
    sessionStorage.setItem('isAdmin', 'true');
    return true;
  }
  showToast('รหัสผ่านไม่ถูกต้อง');
  return false;
}

function resetBoard() {
  if (!checkAdminPin()) return;
  if (!confirm('ยืนยันรีเซ็ต? รายชื่อทั้งหมดจะถูกย้ายกลับไปที่ "รายชื่อนิสิตในเวลา"')) return;
  assignmentsRef.set(null, (error) => {
    if (error) {
      console.error('Reset failed:', error);
      showToast('รีเซ็ตไม่สำเร็จ ลองใหม่อีกครั้ง');
    } else {
      showToast('รีเซ็ตเรียบร้อยแล้ว');
    }
  });
}

function randomizeBoard() {
  if (!checkAdminPin()) return;
  if (!confirm('ยืนยันสุ่มกลุ่ม? ระบบจะจัดกลุ่มใหม่แบบสุ่มให้ทุกคน (แทนที่การจัดกลุ่มปัจจุบัน)')) return;

  const names = (typeof STUDENT_NAMES !== 'undefined' ? STUDENT_NAMES : []).slice();

  // Fisher-Yates shuffle
  for (let i = names.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [names[i], names[j]] = [names[j], names[i]];
  }

  // Fill groups 1-4 evenly, respecting MAX_PER_GROUP, leaving any overflow in the pool.
  const numGroups = 4;
  const data = {};
  names.forEach((name, i) => {
    const slot = Math.floor(i / numGroups);
    const group = (i % numGroups) + 1;
    if (slot < MAX_PER_GROUP) {
      data[name] = group;
    }
    // else: leaves this student in the pool (key omitted -> treated as pool)
  });

  assignmentsRef.set(data, (error) => {
    if (error) {
      console.error('Random assign failed:', error);
      showToast('สุ่มกลุ่มไม่สำเร็จ ลองใหม่อีกครั้ง');
    } else {
      showToast('สุ่มกลุ่มเรียบร้อยแล้ว');
    }
  });
}

const resetBtnEl = document.getElementById('resetBtn');
const randomBtnEl = document.getElementById('randomBtn');
if (resetBtnEl) resetBtnEl.addEventListener('click', resetBoard);
if (randomBtnEl) randomBtnEl.addEventListener('click', randomizeBoard);
