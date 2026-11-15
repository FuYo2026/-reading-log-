'use strict';
const KEY = 'reading-log-books-v1';
const $ = (id) => document.getElementById(id);

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; }
  catch { return []; }
}
function store(books) { localStorage.setItem(KEY, JSON.stringify(books)); }

function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

function stars(n) {
  n = Number(n) || 0;
  return n ? '★'.repeat(n) + '☆'.repeat(5 - n) : '';
}

function typeOf(b) { return b.type === 'video' ? 'video' : 'book'; }

function youtubeThumb(url) {
  if (!url) return '';
  const m = String(url).match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
  return m ? 'https://img.youtube.com/vi/' + m[1] + '/hqdefault.jpg' : '';
}

function toggleType() {
  const isVideo = $('type').value === 'video';
  $('bookFields').style.display = isVideo ? 'none' : 'block';
  $('videoFields').style.display = isVideo ? 'block' : 'none';
  $('authorLabel').textContent = isVideo ? 'チャンネル名・出演者など' : '著者';
}

function render() {
  const q = $('search').value.trim().toLowerCase();
  const f = $('filterType').value;
  const books = load()
    .filter(b => f === 'all' || typeOf(b) === f)
    .filter(b => !q || (b.title + ' ' + b.author + ' ' + (b.service || '')).toLowerCase().includes(q))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  $('count').textContent = load().length;
  const list = $('list');
  if (!books.length) {
    list.innerHTML = '<div class="empty">まだ記録がありません。<br>読んだ本や観た動画を追加してみてね📚🎬</div>';
    return;
  }
  list.innerHTML = '';
  for (const b of books) {
    const div = document.createElement('div');
    div.className = 'book';
    const isVideo = typeOf(b) === 'video';
    const cover = b.cover
      ? '<img src="' + b.cover.replace(/"/g, '&quot;') + '" alt="">'
      : '<div class="no-cover">' + (isVideo ? '🎬' : '📖') + '</div>';
    div.innerHTML = cover + '<div><h3></h3><p class="meta"></p><p class="note"></p></div>';
    div.querySelector('h3').textContent = (isVideo ? '🎬 ' : '📚 ') + (b.title || '(タイトルなし)');
    const meta = [isVideo ? b.service : '', b.author, b.date, stars(b.rating)].filter(Boolean).join(' ・ ');
    div.querySelector('.meta').textContent = meta;
    div.querySelector('.note').textContent = b.note || '';
    div.addEventListener('click', () => fillForm(b));
    list.appendChild(div);
  }
}

function fillForm(b) {
  $('editId').value = b.id;
  $('type').value = typeOf(b);
  toggleType();
  $('service').value = b.service || 'YouTube';
  $('url').value = b.url || '';
  $('imageUrl').value = b.type === 'video' ? (b.cover || '') : '';
  $('isbn').value = b.isbn || '';
  $('title').value = b.title || '';
  $('author').value = b.author || '';
  $('date').value = b.date || todayStr();
  $('rating').value = String(b.rating || 0);
  $('note').value = b.note || '';
  $('cover').value = b.cover || '';
  $('preview').innerHTML = b.cover ? '<img src="' + b.cover + '" alt="表紙">' : '';
  $('saveBtn').textContent = '更新する';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function clearForm() {
  for (const id of ['editId', 'isbn', 'title', 'author', 'note', 'cover', 'url', 'imageUrl']) $(id).value = '';
  $('type').value = 'book';
  $('service').value = 'YouTube';
  toggleType();
  $('rating').value = '0';
  $('date').value = todayStr();
  $('preview').innerHTML = '';
  $('lookupMsg').textContent = '';
  $('saveBtn').textContent = '記録する';
}

async function lookupIsbn(raw) {
  const isbn = (raw || '').replace(/[^0-9Xx]/g, '').toUpperCase();
  if (!isbn) { $('lookupMsg').textContent = 'ISBNを入力してね。'; return; }
  $('lookupMsg').textContent = '本を探しています…';
  try {
    // 日本の本に強い openBD
    const r = await fetch('https://api.openbd.jp/v1/get?isbn=' + encodeURIComponent(isbn));
    const data = await r.json();
    const item = data && data[0];
    if (item && item.summary) {
      $('title').value = item.summary.title || '';
      $('author').value = item.summary.author || '';
      $('cover').value = item.summary.cover || '';
      $('preview').innerHTML = item.summary.cover ? '<img src="' + item.summary.cover + '" alt="表紙">' : '';
      $('lookupMsg').textContent = '見つかりました📖';
      return;
    }
    // 海外の本などは Google Books
    const r2 = await fetch('https://www.googleapis.com/books/v1/volumes?q=isbn:' + encodeURIComponent(isbn));
    const d2 = await r2.json();
    const v = d2 && d2.items && d2.items[0] && d2.items[0].volumeInfo;
    if (v) {
      $('title').value = v.title || '';
      $('author').value = (v.authors || []).join(', ');
      const cover = v.imageLinks ? (v.imageLinks.thumbnail || '').replace('http:', 'https:') : '';
      $('cover').value = cover;
      $('preview').innerHTML = cover ? '<img src="' + cover + '" alt="表紙">' : '';
      $('lookupMsg').textContent = '見つかりました📖';
      return;
    }
    $('lookupMsg').textContent = '自動では見つかりませんでした。タイトルと著者を手で入力してね。';
  } catch (e) {
    $('lookupMsg').textContent = '通信エラーです。ネット接続を確認して、もう一度試してね。';
  }
}

// バーコード読み取り（ZXing）
let codeReader = null;
async function startScan() {
  if (!window.ZXingBrowser) {
    $('lookupMsg').textContent = '読み取りライブラリを読み込めませんでした。ISBNを手入力してね。';
    return;
  }
  try {
    codeReader = new ZXingBrowser.BrowserMultiFormatReader();
    $('scanner').style.display = 'block';
    const controls = await codeReader.decodeFromVideoDevice(undefined, $('video'), (result) => {
      if (result) {
        const text = result.getText();
        stopScan(controls);
        $('isbn').value = text;
        lookupIsbn(text);
      }
    });
    $('stopScanBtn').onclick = () => stopScan(controls);
  } catch (e) {
    $('lookupMsg').textContent = 'カメラを使えませんでした。カメラの許可と、HTTPS（またはlocalhost）で開いているか確認してね。';
  }
}
function stopScan(controls) {
  try { if (controls) controls.stop(); } catch {}
  try { if (codeReader) codeReader.reset(); } catch {}
  $('scanner').style.display = 'none';
}

$('lookupBtn').addEventListener('click', () => lookupIsbn($('isbn').value));
$('scanBtn').addEventListener('click', startScan);
$('clearBtn').addEventListener('click', clearForm);
$('search').addEventListener('input', render);

$('type').addEventListener('change', toggleType);
$('filterType').addEventListener('change', render);
$('url').addEventListener('change', () => {
  const t = youtubeThumb($('url').value);
  if (t) { $('imageUrl').value = t; $('cover').value = t; $('preview').innerHTML = '<img src="' + t + '" alt="サムネイル">'; }
});

$('saveBtn').addEventListener('click', () => {
  const title = $('title').value.trim();
  if (!title) { alert('タイトルを入力してね。'); return; }
  const books = load();
  const editId = $('editId').value;
  const isVideo = $('type').value === 'video';
  const cover = isVideo
    ? ($('imageUrl').value.trim() || youtubeThumb($('url').value) || $('cover').value.trim())
    : $('cover').value.trim();
  const rec = {
    id: editId || Date.now().toString(36),
    type: isVideo ? 'video' : 'book',
    service: isVideo ? $('service').value : '',
    url: isVideo ? $('url').value.trim() : '',
    isbn: isVideo ? '' : $('isbn').value.trim(),
    title,
    author: $('author').value.trim(),
    date: $('date').value || todayStr(),
    rating: Number($('rating').value) || 0,
    note: $('note').value.trim(),
    cover,
  };
  if (editId) {
    const i = books.findIndex(b => b.id === editId);
    if (i >= 0) books[i] = rec; else books.push(rec);
  } else {
    books.push(rec);
  }
  store(books);
  clearForm();
  render();
});

$('exportBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(load(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'reading-log-backup.json';
  a.click();
  URL.revokeObjectURL(a.href);
});

$('importFile').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!Array.isArray(data)) throw new Error('bad format');
      store(data);
      render();
      alert('読み込みました📚');
    } catch { alert('読み込めませんでした。書き出したJSONファイルを選んでね。'); }
  };
  reader.readAsText(file);
});

$('date').value = todayStr();
render();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
