// routes/stock.js
import { pool } from './products.js';

export function registerStockRoutes(app) {

  // ── GET /api/stock ─────────────────────────────────────────
  // Devuelve todos los productos activos con su stock por talla/color
  app.get('/api/stock', async (_req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT
          p.id          AS "productId",
          p.name        AS "productName",
          COALESCE(
            json_agg(
              jsonb_build_object(
                'size',      ps.size,
                'color',     ps.color,
                'quantity',  ps.stock,
                'reserved',  0,
                'available', ps.stock
              )
              ORDER BY ps.size
            ) FILTER (WHERE ps.size IS NOT NULL),
            '[]'
          ) AS sizes,
          COALESCE(SUM(ps.stock), 0) AS "totalAvailable"
        FROM products p
        LEFT JOIN product_stock ps ON ps.product_id = p.id
        WHERE p.active = true
        GROUP BY p.id
        ORDER BY p.name ASC
      `);
      res.json(rows);
    } catch (err) {
      console.error('[Stock] GET /api/stock error:', err);
      res.status(500).json({ error: 'Error obteniendo el stock.' });
    }
  });

  // ── GET /api/stock/:productId ──────────────────────────────
  app.get('/api/stock/:productId', async (req, res) => {
    const { productId } = req.params;
    try {
      const { rows: product } = await pool.query(
        'SELECT id, name FROM products WHERE id = $1 AND active = true',
        [productId]
      );
      if (!product.length) return res.status(404).json({ error: 'Producto no encontrado.' });

      const { rows: sizes } = await pool.query(`
        SELECT size, color, stock AS quantity, 0 AS reserved, stock AS available
        FROM product_stock
        WHERE product_id = $1
        ORDER BY size
      `, [productId]);

      res.json({
        productId:      product[0].id,
        productName:    product[0].name,
        sizes,
        totalAvailable: sizes.reduce((acc, s) => acc + s.quantity, 0),
      });
    } catch (err) {
      console.error(`[Stock] GET /api/stock/${productId} error:`, err);
      res.status(500).json({ error: 'Error obteniendo el stock.' });
    }
  });

  // ── PATCH /api/stock/:productId ────────────────────────────
  // Actualiza el stock de UNA talla (y opcionalmente color)
  // Body: { size: string, quantity: number, color?: string }
  app.patch('/api/stock/:productId', async (req, res) => {
    const { productId } = req.params;
    const { size, quantity, color = null } = req.body;

    if (!size || quantity === undefined || quantity === null) {
      return res.status(400).json({ error: 'Se requieren "size" y "quantity".' });
    }
    if (!Number.isInteger(quantity) || quantity < 0) {
      return res.status(400).json({ error: '"quantity" debe ser un entero >= 0.' });
    }

    try {
      // Upsert: si no existe la fila la crea, si existe la actualiza
      await pool.query(`
        INSERT INTO product_stock (product_id, size, color, stock)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (product_id, size, color)
          DO UPDATE SET stock = EXCLUDED.stock
      `, [productId, size, color, quantity]);

      return getProductStock(res, productId);
    } catch (err) {
      console.error(`[Stock] PATCH /api/stock/${productId} error:`, err);
      res.status(500).json({ error: 'Error actualizando el stock.' });
    }
  });

  // ── PUT /api/stock/:productId ──────────────────────────────
  // Reemplaza el stock completo de un producto (todas las tallas)
  // Body: { sizes: [{ size, quantity, color? }] }
  app.put('/api/stock/:productId', async (req, res) => {
    const { productId } = req.params;
    const { sizes } = req.body;

    if (!Array.isArray(sizes) || sizes.length === 0) {
      return res.status(400).json({ error: '"sizes" debe ser un array no vacío.' });
    }
    for (const s of sizes) {
      if (!s.size || !Number.isInteger(s.quantity) || s.quantity < 0) {
        return res.status(400).json({ error: 'Cada talla requiere "size" y "quantity" (entero >= 0).' });
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM product_stock WHERE product_id = $1', [productId]);
      for (const { size, quantity, color = null } of sizes) {
        await client.query(
          'INSERT INTO product_stock (product_id, size, color, stock) VALUES ($1, $2, $3, $4)',
          [productId, size, color, quantity]
        );
      }
      await client.query('COMMIT');
      return getProductStock(res, productId);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`[Stock] PUT /api/stock/${productId} error:`, err);
      res.status(500).json({ error: 'Error actualizando el stock.' });
    } finally {
      client.release();
    }
  });
}

// ── Helper compartido ──────────────────────────────────────────
async function getProductStock(res, productId) {
  const { rows: product } = await pool.query(
    'SELECT id, name FROM products WHERE id = $1',
    [productId]
  );
  if (!product.length) return res.status(404).json({ error: 'Producto no encontrado.' });

  const { rows: sizes } = await pool.query(`
    SELECT size, color, stock AS quantity, 0 AS reserved, stock AS available
    FROM product_stock
    WHERE product_id = $1
    ORDER BY size
  `, [productId]);

  return res.json({
    productId:      product[0].id,
    productName:    product[0].name,
    sizes,
    totalAvailable: sizes.reduce((acc, s) => acc + s.quantity, 0),
  });
}

// ── Utilidad interna para el webhook ──────────────────────────
// Descuenta stock cuando MercadoPago confirma un pago aprobado.
// Uso: await decrementStock(productId, size, quantity, color?)
export async function decrementStock(productId, size, quantity = 1, color = null) {
  await pool.query(`
    UPDATE product_stock
    SET stock = GREATEST(0, stock - $1)
    WHERE product_id = $2
      AND size = $3
      AND (color = $4 OR ($4 IS NULL AND color IS NULL))
  `, [quantity, productId, size, color]);
}