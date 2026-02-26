// routes/stock.js
import { db } from '../firebase.js'; // ajustá el path según tu proyecto

// ── Helpers ──────────────────────────────────────────────────

/**
 * Convierte un doc de Firestore en el shape ProductStock que espera el frontend.
 * Estructura en Firestore:
 *   stock/{productId}  →  { productName: string, sizes: { [size]: { quantity, reserved } } }
 */
function docToProductStock(id, data) {
  const sizesMap = data.sizes ?? {};
  const sizes = Object.entries(sizesMap).map(([size, s]) => {
    const quantity = s.quantity  ?? 0;
    const reserved = s.reserved ?? 0;
    return {
      size,
      quantity,
      reserved,
      available: Math.max(0, quantity - reserved),
    };
  });

  // Ordenar tallas: numérico primero (34,36…), luego texto (XS,S,M,L,XL,XXL), luego resto
  sizes.sort((a, b) => {
    const numA = Number(a.size), numB = Number(b.size);
    const sizeOrder = ['XS','S','M','L','XL','XXL','XXXL'];
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
    if (!isNaN(numA)) return -1;
    if (!isNaN(numB)) return  1;
    const iA = sizeOrder.indexOf(a.size.toUpperCase());
    const iB = sizeOrder.indexOf(b.size.toUpperCase());
    if (iA !== -1 && iB !== -1) return iA - iB;
    if (iA !== -1) return -1;
    if (iB !== -1) return  1;
    return a.size.localeCompare(b.size);
  });

  const totalAvailable = sizes.reduce((acc, s) => acc + s.available, 0);

  return {
    productId:      id,
    productName:    data.productName ?? '',
    sizes,
    totalAvailable,
  };
}

// ── Rutas ─────────────────────────────────────────────────────

export function registerStockRoutes(app) {

  // GET /api/stock  →  todos los productos con su stock
  app.get('/api/stock', async (_req, res) => {
    try {
      const snap = await db.collection('stock').get();
      const stock = snap.docs.map(doc => docToProductStock(doc.id, doc.data()));
      res.json(stock);
    } catch (err) {
      console.error('[Stock] GET /api/stock error:', err);
      res.status(500).json({ error: 'Error obteniendo el stock.' });
    }
  });

  // GET /api/stock/:productId  →  stock de un producto
  app.get('/api/stock/:productId', async (req, res) => {
    const { productId } = req.params;
    try {
      const doc = await db.collection('stock').doc(productId).get();
      if (!doc.exists) return res.status(404).json({ error: 'Producto no encontrado en stock.' });
      res.json(docToProductStock(doc.id, doc.data()));
    } catch (err) {
      console.error(`[Stock] GET /api/stock/${productId} error:`, err);
      res.status(500).json({ error: 'Error obteniendo el stock.' });
    }
  });

  app.patch('/api/stock/:productId', async (req, res) => {
    const { productId } = req.params;
    const { size, quantity } = req.body;

    if (!size || quantity === undefined || quantity === null) {
      return res.status(400).json({ error: 'Se requieren "size" y "quantity".' });
    }
    if (typeof quantity !== 'number' || quantity < 0 || !Number.isInteger(quantity)) {
      return res.status(400).json({ error: '"quantity" debe ser un entero ≥ 0.' });
    }

    try {
      const ref = db.collection('stock').doc(productId);
      const doc = await ref.get();

      if (!doc.exists) return res.status(404).json({ error: 'Producto no encontrado en stock.' });

      // Actualiza sólo el campo de esa talla usando dot-notation de Firestore
      await ref.update({ [`sizes.${size}.quantity`]: quantity });

      const updated = await ref.get();
      res.json(docToProductStock(updated.id, updated.data()));
    } catch (err) {
      console.error(`[Stock] PATCH /api/stock/${productId} error:`, err);
      res.status(500).json({ error: 'Error actualizando el stock.' });
    }
  });

  // PUT /api/stock/:productId  →  reemplaza el stock completo de un producto
  // Body: { sizes: [{ size: string, quantity: number }] }
  app.put('/api/stock/:productId', async (req, res) => {
    const { productId } = req.params;
    const { sizes } = req.body;

    if (!Array.isArray(sizes) || sizes.length === 0) {
      return res.status(400).json({ error: '"sizes" debe ser un array no vacío.' });
    }
    for (const s of sizes) {
      if (!s.size || typeof s.quantity !== 'number' || s.quantity < 0 || !Number.isInteger(s.quantity)) {
        return res.status(400).json({ error: 'Cada talla requiere "size" (string) y "quantity" (entero ≥ 0).' });
      }
    }

    try {
      const ref = db.collection('stock').doc(productId);
      const doc = await ref.get();

      if (!doc.exists) return res.status(404).json({ error: 'Producto no encontrado en stock.' });

      // Reconstruir el mapa de tallas preservando los "reserved" existentes
      const existing = doc.data().sizes ?? {};
      const newSizes = {};
      for (const { size, quantity } of sizes) {
        newSizes[size] = {
          quantity,
          reserved: existing[size]?.reserved ?? 0,
        };
      }

      await ref.update({ sizes: newSizes });

      const updated = await ref.get();
      res.json(docToProductStock(updated.id, updated.data()));
    } catch (err) {
      console.error(`[Stock] PUT /api/stock/${productId} error:`, err);
      res.status(500).json({ error: 'Error actualizando el stock.' });
    }
  });

  // ── Utilidad interna (no expuesta al frontend) ──────────────
  // Llamá esta función desde el webhook de MercadoPago para descontar
  // unidades cuando un pago se aprueba.
  //
  // decrementStock(productId, size, quantity)  →  Promise<void>
}

export async function decrementStock(db, productId, size, quantity = 1) {
  const ref = db.collection('stock').doc(productId);
  const doc = await ref.get();
  if (!doc.exists) throw new Error(`Stock doc not found for product ${productId}`);

  const current = doc.data().sizes?.[size]?.quantity ?? 0;
  const next    = Math.max(0, current - quantity);
  await ref.update({ [`sizes.${size}.quantity`]: next });
}