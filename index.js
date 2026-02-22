// index.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';

dotenv.config();

// ── Mercado Pago client ──────────────────────────────────────
const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
});

const preference = new Preference(client);
const payment    = new Payment(client);

// ── Express app ──────────────────────────────────────────────
const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:4200',
}));

// ── POST /api/checkout ───────────────────────────────────────
// Crea una preferencia de pago en Mercado Pago y devuelve la URL
app.post('/api/checkout', async (req, res) => {
  const { items } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'El carrito está vacío.' });
  }

  try {
    const body = {
      items: items.map(item => ({
        id:          item.id,
        title:       item.product,
        description: `Talle: ${item.size}${item.color ? ` - ${item.color}` : ''}`,
        quantity:    Number(item.quantity),
        unit_price:  Number(item.price),
        currency_id: 'ARS',
        picture_url: item.image || undefined,
      })),

      // URLs de retorno al sitio
      back_urls: {
        success: `${process.env.FRONTEND_URL}/checkout/success`,
        failure: `${process.env.FRONTEND_URL}/checkout/failure`,
        pending: `${process.env.FRONTEND_URL}/checkout/pending`,
      },
      //auto_return: 'approved',

      // Webhook para notificaciones (opcional pero recomendado)
      notification_url: `${process.env.BACKEND_URL}/api/webhook`,

      // Cuotas sin interés (configurar en tu cuenta de MP)
      payment_methods: {
        installments: 3,
      },
    };

    const result = await preference.create({ body });

    res.json({
      init_point:    result.init_point,      // producción
      sandbox_init_point: result.sandbox_init_point, // testing
      preference_id: result.id,
    });

  } catch (err) {
    console.error('Error creando preferencia:', err);
    res.status(500).json({ error: 'No se pudo crear la preferencia de pago.' });
  }
});


// ── POST /api/webhook ────────────────────────────────────────
// Mercado Pago llama a este endpoint cuando cambia el estado de un pago.
// Usalo para actualizar tu base de datos / confirmar pedidos.
app.post('/api/webhook', async (req, res) => {
  const { type, data } = req.body;

  // MP espera un 200 rápido, procesamos de forma async
  res.sendStatus(200);

  if (type === 'payment') {
    try {
      const result = await payment.get({ id: data.id });

      const status      = result.status;        // approved | rejected | pending
      const paymentId   = result.id;
      const orderId     = result.order?.id;
      const amount      = result.transaction_amount;
      const payer       = result.payer?.email;

      console.log(`[Webhook] Pago ${paymentId} — Status: ${status}`);
      console.log(`  Orden: ${orderId} | Monto: $${amount} | Pagador: ${payer}`);

    } catch (err) {
      console.error('[Webhook] Error procesando pago:', err);
    }
  }
});


// ── GET /api/health ──────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});