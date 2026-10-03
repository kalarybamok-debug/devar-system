const express = require('express');
const http = require('http');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

const DATA_FILE = path.join(__dirname, 'orders.json');
let orders = [];
let nextId = 1;

function loadOrders() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    orders = parsed.orders || [];
    nextId = parsed.nextId || 1;
  } catch (e) {
    orders = [];
    nextId = 1;
  }
}
function persist() {
  fs.writeFile(DATA_FILE, JSON.stringify({ orders, nextId }, null, 2), () => {});
}
loadOrders();

io.on('connection', (socket) => {
  socket.emit('orders:sync', orders);

  socket.on('order:place', (data) => {
    if (!data || !Array.isArray(data.items) || data.items.length === 0) return;
    const order = {
      id: nextId++,
      table: data.table || '—',
      items: data.items,
      total: data.total || 0,
      time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      createdAt: Date.now(),
      status: 'new',
    };
    orders.unshift(order);
    orders = orders.slice(0, 200);
    persist();
    io.emit('orders:sync', orders);
  });

  socket.on('order:status', ({ id, status }) => {
    orders = orders.map((o) => (o.id === id ? { ...o, status } : o));
    persist();
    io.emit('orders:sync', orders);
  });

  socket.on('order:clear-done', () => {
    orders = orders.filter((o) => o.status !== 'done');
    persist();
    io.emit('orders:sync', orders);
  });
});

function localAddresses() {
  const nets = os.networkInterfaces();
  const out = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) out.push(net.address);
    }
  }
  return out;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log('\n===========================================');
  console.log('  Devra ڕاژە دەستی پێکرد / Devra server is running');
  console.log('===========================================');
  console.log(`  لای کاشێر (POS):      http://localhost:${PORT}/pos.html`);
  console.log(`  QR بۆ مێزەکان:        http://localhost:${PORT}/qr.html`);
  const ips = localAddresses();
  if (ips.length) {
    ips.forEach((ip) => {
      console.log(`\n  ئەم ئامێرە لەسەر تۆڕی ناوخۆیی: http://${ip}:${PORT}`);
      console.log(`  (ئەمە بەکاربهێنە لە qr.html بۆ دروستکردنی کوارکۆدەکان)`);
    });
  } else {
    console.log('\n  نەتوانرا ناونیشانی IPی ناوخۆیی بدۆزرێتەوە. بە "ipconfig" یان "ifconfig" بیدۆزەرەوە.');
  }
  console.log('\n  تێبینی: ئەم ڕاژەیە پێویستی بە ئینتەرنێت نییە، تەنها پێویستە هەموو ئامێرەکان لە یەک وایفایدا بن.');
  console.log('===========================================\n');
});
