const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const session = require('express-session');
const generateId = require('./utils/generateId');

const app = express();

// ===== Middleware =====
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({
  secret: 'scab-admin-secret',
  resave: false,
  saveUninitialized: true
}));

// ===== View Engine =====
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ===== File Upload Setup =====
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = 'public/uploads/';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + file.originalname;
    cb(null, uniqueName);
  }
});
const upload = multer({ storage });

// ===== Admin Auth Middleware =====
const adminAuth = (req, res, next) => {
  if (req.session && req.session.isLoggedIn) next();
  else res.redirect('/admin/login');
};

// ===== Static Pages =====
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/cart', (req, res) => res.sendFile(path.join(__dirname, 'public', 'cart.html')));
app.get('/faq', (req, res) => res.sendFile(path.join(__dirname, 'public', 'faq.html')));
app.get('/privacy-policy', (req, res) => res.sendFile(path.join(__dirname, 'public', 'privacy-policy.html')));
app.get('/terms', (req, res) => res.sendFile(path.join(__dirname, 'public', 'terms.html')));

app.get('/about', (req, res) => {
  res.redirect('/#about');
});

// ===== Product Pages =====
app.get('/products', (req, res) => {
  const products = JSON.parse(fs.readFileSync('./data/products.json'));
  res.render('products', { products });
});

app.get('/product-detail/:id', (req, res) => {
  const products = JSON.parse(fs.readFileSync('./data/products.json'));
  const product = products.find(p => p.id === req.params.id);
  if (!product) return res.status(404).send('❌ Product not found');
  res.render('product-detail', { product });
});

app.get('/api/products', (req, res) => {
  const products = JSON.parse(fs.readFileSync('./data/products.json'));
  res.json(products);
});

// ===== Contact Form =====
app.post('/contact', (req, res) => {
  const { name, email, message } = req.body;
  if (!name || !email || !message) return res.status(400).json({ success: false });

  const messages = fs.existsSync('./data/messages.json')
    ? JSON.parse(fs.readFileSync('./data/messages.json')) : [];

  messages.push({ id: generateId(), name, email, message, date: new Date().toISOString() });
  fs.writeFileSync('./data/messages.json', JSON.stringify(messages, null, 2));
  res.status(200).json({ success: true });
});

// ===== Admin Login/Logout =====
app.get('/admin/login', (req, res) => res.render('admin-login', { error: null }));

app.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'sqabimpexADMIN' && password === 'e-shop2025') {
    req.session.isLoggedIn = true;
    res.redirect('/admin');
  } else {
    res.render('admin-login', { error: 'Invalid credentials' });
  }
});

app.get('/admin/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

// ===== Admin Dashboard =====
app.get('/admin', adminAuth, (req, res) => {
  const messages = fs.existsSync('./data/messages.json') ? JSON.parse(fs.readFileSync('./data/messages.json')) : [];
  const carts = fs.existsSync('./data/carts.json') ? JSON.parse(fs.readFileSync('./data/carts.json')) : [];
  const buyRequests = fs.existsSync('./data/buy-requests.json') ? JSON.parse(fs.readFileSync('./data/buy-requests.json')) : [];

  res.render('admin-dashboard', {
    messageCount: messages.length,
    cartCount: carts.length,
    buyCount: buyRequests.length
  });
});

// ===== Messages =====
app.get('/admin/messages', adminAuth, (req, res) => {
  const messages = fs.existsSync('./data/messages.json') ? JSON.parse(fs.readFileSync('./data/messages.json')) : [];
  res.render('admin-messages', { messages });
});

app.post('/admin/delete-message/:id', adminAuth, (req, res) => {
  const id = req.params.id;
  let messages = fs.existsSync('./data/messages.json') ? JSON.parse(fs.readFileSync('./data/messages.json')) : [];
  messages = messages.filter(m => m.id !== id);
  fs.writeFileSync('./data/messages.json', JSON.stringify(messages, null, 2));
  res.redirect('/admin/messages');
});

// ===== Product Admin =====
app.get('/admin/products', adminAuth, (req, res) => {
  const products = JSON.parse(fs.readFileSync('./data/products.json'));
  res.render('admin-products', { products });
});

app.get('/admin/add-product', adminAuth, (req, res) => res.render('admin-add-product'));

app.post('/admin/add-product', adminAuth, upload.array('productImages'), (req, res) => {
  const { title, description, price, imageLinks } = req.body;
  let images = [];

  if (req.files && req.files.length > 0) {
    images = req.files.map(file => '/uploads/' + file.filename);
  }

  if (imageLinks && typeof imageLinks === 'string') {
    images.push(imageLinks.trim());
  } else if (Array.isArray(imageLinks)) {
    images = images.concat(imageLinks.map(link => link.trim()));
  }

  const products = JSON.parse(fs.readFileSync('./data/products.json'));
  products.push({ id: generateId(), title, description, price, images });
  fs.writeFileSync('./data/products.json', JSON.stringify(products, null, 2));
  res.redirect('/admin/products');
});

app.post('/admin/delete-product/:id', adminAuth, (req, res) => {
  const products = JSON.parse(fs.readFileSync('./data/products.json'));
  const targetIndex = products.findIndex(p => p.id === req.params.id);

  if (targetIndex >= 0 && targetIndex < 3) {
    return res.status(403).send('❌ Cannot delete featured homepage product.');
  }

  const updated = products.filter(p => p.id !== req.params.id);
  fs.writeFileSync('./data/products.json', JSON.stringify(updated, null, 2));
  res.redirect('/admin/products');
});

// ===== Cart Send to Admin =====
app.post('/api/send-cart', (req, res) => {
  const { cart, contact, message } = req.body;
  if (!Array.isArray(cart) || cart.length === 0 || !contact) {
    return res.status(400).json({ success: false, error: 'Missing cart or contact' });
  }

  const file = './data/carts.json';
  const existing = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : [];
  existing.push({ id: generateId(), contact, message: message || '', cart, date: new Date().toISOString() });

  fs.writeFileSync(file, JSON.stringify(existing, null, 2));
  res.status(200).json({ success: true });
});

// ===== Admin View Carts =====
app.get('/admin/carts', adminAuth, (req, res) => {
  const carts = fs.existsSync('./data/carts.json') ? JSON.parse(fs.readFileSync('./data/carts.json')) : [];
  res.render('admin-carts', { carts });
});

app.post('/admin/delete-cart/:id', adminAuth, (req, res) => {
  const carts = fs.existsSync('./data/carts.json') ? JSON.parse(fs.readFileSync('./data/carts.json')) : [];
  const updated = carts.filter(c => c.id !== req.params.id);
  fs.writeFileSync('./data/carts.json', JSON.stringify(updated, null, 2));
  res.redirect('/admin/carts');
});

// ===== Buy Now =====
app.get('/buy-now', (req, res) => {
  const products = JSON.parse(fs.readFileSync('./data/products.json'));
  const product = products.find(p => p.id === req.query.id);
  if (!product) return res.status(404).send("❌ Product not found");
  res.render('buy-now', { product });
});

app.post('/buy-now', (req, res) => {
  const { name, contact, message, productId } = req.body;
  const products = JSON.parse(fs.readFileSync('./data/products.json'));
  const product = products.find(p => p.id === productId);

  if (!name || !contact || !product) {
    return res.status(400).json({ success: false, error: "Missing required fields" });
  }

  const data = fs.existsSync('./data/buy-requests.json')
    ? JSON.parse(fs.readFileSync('./data/buy-requests.json'))
    : [];

  data.push({ id: generateId(), name, contact, message, product, date: new Date().toISOString() });
  fs.writeFileSync('./data/buy-requests.json', JSON.stringify(data, null, 2));
  res.status(200).json({ success: true });
});

app.get('/admin/buy-requests', adminAuth, (req, res) => {
  const data = fs.existsSync('./data/buy-requests.json') ? JSON.parse(fs.readFileSync('./data/buy-requests.json')) : [];
  res.render('admin-buy-requests', { requests: data });
});

app.post('/admin/delete-buy-request/:id', adminAuth, (req, res) => {
  const id = req.params.id;
  const filePath = './data/buy-requests.json';

  const existing = fs.existsSync(filePath)
    ? JSON.parse(fs.readFileSync(filePath))
    : [];

  const updated = existing.filter(item => item.id !== id);
  fs.writeFileSync(filePath, JSON.stringify(updated, null, 2));
  res.redirect('/admin/buy-requests');
});

// ===== 404 =====
app.use((req, res) => res.status(404).send('❌ Page not found'));

// ===== Start Server =====
app.listen(3000, () => console.log('🚀 Server started at http://localhost:3000'));
