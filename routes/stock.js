// routes/stock.js
import { pool } from './products.js';

export function registerStockRoutes(app) {

  // ── GET /api/stock ─────────────────────────────────────────
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
              ) ORDER BY ps.size
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
    try {
      const result = await getFullProduct(req.params.productId);
      if (!result) return res.status(404).json({ error: 'Producto no encontrado.' });
      res.json(result);
    } catch (err) {
      console.error(`[Stock] GET /api/stock/${req.params.productId} error:`, err);
      res.status(500).json({ error: 'Error obteniendo el stock.' });
    }
  });

  // ── PATCH /api/stock/:productId ────────────────────────────
  // Body: { size: string, quantity: number, color?: string|null }
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
      await pool.query(`
        INSERT INTO product_stock (product_id, size, color, stock)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (product_id, size, color)
          DO UPDATE SET stock = EXCLUDED.stock
      `, [productId, size, color, quantity]);

      const product = await getFullProduct(productId);
      if (!product) return res.status(404).json({ error: 'Producto no encontrado.' });
      res.json(product);
    } catch (err) {
      console.error(`[Stock] PATCH /api/stock/${productId} error:`, err);
      res.status(500).json({ error: 'Error actualizando el stock.' });
    }
  });

  // ── PUT /api/stock/:productId ──────────────────────────────
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

      const product = await getFullProduct(productId);
      if (!product) return res.status(404).json({ error: 'Producto no encontrado.' });
      res.json(product);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`[Stock] PUT /api/stock/${productId} error:`, err);
      res.status(500).json({ error: 'Error actualizando el stock.' });
    } finally {
      client.release();
    }
  });
}

// ── Helpers ────────────────────────────────────────────────────

/**
 * Devuelve el producto completo (mismo shape que GET /api/products/:id)
 * para que el frontend pueda sincronizar su BehaviorSubject directamente.
 */
async function getFullProduct(productId) {
  const { rows } = await pool.query(`
    SELECT
      p.id, p.name, p.cat, p.drop, p.price, p.description, p.images,
      p.original_price AS "originalPrice",
      p.is_new         AS "isNew",
      p.is_sale        AS "isSale",
      COALESCE(
        json_agg(DISTINCT jsonb_build_object('name', pc.name, 'hex', pc.hex))
        FILTER (WHERE pc.name IS NOT NULL), '[]'
      ) AS colors,
      COALESCE(
        json_agg(DISTINCT jsonb_build_object('size', ps.size, 'color', ps.color, 'stock', ps.stock))
        FILTER (WHERE ps.size IS NOT NULL), '[]'
      ) AS stock
    FROM products p
    LEFT JOIN product_colors pc ON pc.product_id = p.id
    LEFT JOIN product_stock  ps ON ps.product_id  = p.id
    WHERE p.id = $1
    GROUP BY p.id
  `, [productId]);

  return rows[0] ?? null;
}

/**
 * Descuenta stock cuando MercadoPago confirma un pago aprobado.
 * Exportada para uso en el webhook de index.js.
 */
export async function decrementStock(productId, size, quantity = 1, color = null) {
  await pool.query(`
    UPDATE product_stock
    SET stock = GREATEST(0, stock - $1)
    WHERE product_id = $2
      AND size = $3
      AND (color = $4 OR ($4 IS NULL AND color IS NULL))
  `, [quantity, productId, size, color]);
}