// index.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
import { registerProductRoutes } from './routes/products.js';
import { registerDropRoutes }    from './routes/drops.js';
import { registerAdminRoutes }   from './routes/admin.js';
import { registerUploadRoutes }   from './routes/imageUpload.js';

dotenv.config();

const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
const preference = new Preference(client);
const payment    = new Payment(client);

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cors({
  origin: (origin, callback) => {
    const allowed = [
      process.env.FRONTEND_URL,
      'http://localhost:4200',
      'http://localhost:4201',
    ].filter(Boolean);
    if (!origin || allowed.includes(origin)) callback(null, true);
    else callback(new Error(`CORS bloqueado para: ${origin}`));
  }
}));

// ── Rutas ────────────────────────────────────────────────────
registerProductRoutes(app);
registerDropRoutes(app);
registerAdminRoutes(app);
registerUploadRoutes(app);

// ── POST /api/checkout ───────────────────────────────────────
app.post('/api/checkout', async (req, res) => {
  const { items, email, shipping } = req.body;
  if (!items?.length) return res.status(400).json({ error: 'El carrito está vacío.' });

  try {
    const body = {
      payer: {
        email:   email || undefined,
        name:    shipping?.address?.nombre,
        surname: shipping?.address?.apellido,
        phone:   { number: shipping?.address?.telefono },
        address: { street_name: shipping?.address?.calle, zip_code: shipping?.address?.cp },
      },
      items: items.map(item => ({
        id:          item.id,
        title:       item.product,
        description: `Talle: ${item.size}${item.color ? ` - ${item.color}` : ''}`,
        quantity:    Number(item.quantity),
        unit_price:  Number(item.price),
        currency_id: 'ARS',
        picture_url: item.image || undefined,
      })),
      back_urls: {
        success: `${process.env.FRONTEND_URL}/checkout/success`,
        failure: `${process.env.FRONTEND_URL}/checkout/failure`,
        pending: `${process.env.FRONTEND_URL}/checkout/pending`,
      },
      notification_url: `${process.env.BACKEND_URL}/api/webhook`,
      payment_methods:  { installments: 3 },
      metadata: {
        shipping_cost:    shipping?.cost,
        shipping_carrier: shipping?.name,
        shipping_address: shipping?.address,
      },
    };

    if (shipping?.cost > 0) {
      body.items.push({
        id: 'shipping', title: `Envío — ${shipping.name}`,
        description: 'Costo de envío', quantity: 1,
        unit_price: Number(shipping.cost), currency_id: 'ARS',
      });
    }

    const result = await preference.create({ body });
    res.json({
      init_point:         result.init_point,
      sandbox_init_point: result.sandbox_init_point,
      preference_id:      result.id,
    });
  } catch (err) {
    console.error('Checkout error:', err);
    res.status(500).json({ error: 'No se pudo crear la preferencia de pago.' });
  }
});

// ── POST /api/webhook ────────────────────────────────────────
app.post('/api/webhook', async (req, res) => {
  const { type, data } = req.body;
  res.sendStatus(200);
  if (type === 'payment') {
    try {
      const result = await payment.get({ id: data.id });
      console.log(`[Webhook] Pago ${result.id} — ${result.status} — $${result.transaction_amount}`);
    } catch (err) {
      console.error('[Webhook] Error:', err);
    }
  }
});

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/', (_req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => console.log(`🚀 Servidor en http://localhost:${PORT}`));