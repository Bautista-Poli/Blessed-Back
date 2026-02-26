import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
import { decrementStock } from './stock.js';
import { db } from '../firebase.js';

export const registerCartRoutes = (app) => {
  const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
  const preference = new Preference(client);
  const payment = new Payment(client);

  // ── POST /api/checkout ───────────────────────────────────────
  app.post('/api/checkout', async (req, res) => {
    const { items, email, shipping } = req.body;
    if (!items?.length) return res.status(400).json({ error: 'El carrito está vacío.' });

    try {
      const body = {
        payer: {
          email: email || undefined,
          name: shipping?.address?.nombre,
          surname: shipping?.address?.apellido,
          phone: { number: shipping?.address?.telefono },
          address: { street_name: shipping?.address?.calle, zip_code: shipping?.address?.cp },
        },
        items: items.map(item => ({
          id: item.id,
          title: item.product,
          description: `Talle: ${item.size}${item.color ? ` - ${item.color}` : ''}`,
          quantity: Number(item.quantity),
          unit_price: Number(item.price),
          currency_id: 'ARS',
          picture_url: item.image || undefined,
        })),
        back_urls: {
          success: `${process.env.FRONTEND_URL}/checkout/success`,
          failure: `${process.env.FRONTEND_URL}/checkout/failure`,
          pending: `${process.env.FRONTEND_URL}/checkout/pending`,
        },
        notification_url: `${process.env.BACKEND_URL}/api/webhook`,
        payment_methods: { installments: 3 },
        metadata: {
          cart_items: items.map(i => ({ id: i.id, size: i.size, quantity: i.quantity })),
          shipping_cost: shipping?.cost,
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
        init_point: result.init_point,
        sandbox_init_point: result.sandbox_init_point,
        preference_id: result.id,
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
        console.log(`[Webhook] Pago ${result.id} — ${result.status}`);

        if (result.status === 'approved') {
          const cartItems = result.metadata?.cart_items ?? [];
          await Promise.allSettled(
            cartItems.map(item =>
              decrementStock(db, item.id, item.size, Number(item.quantity))
                .then(() => console.log(`[Stock] -${item.quantity} × ${item.id}`))
                .catch(err => console.error(`[Stock] Error:`, err))
            )
          );
        }
      } catch (err) {
        console.error('[Webhook] Error:', err);
      }
    }
  });
};