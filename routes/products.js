// routes/products.js
import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // requerido por Neon
});

// ── GET /api/products ────────────────────────────────────────
// Query params: ?drop=drop02 | ?cat=tshirts | ?drop=all
export function registerProductRoutes(app) {

  app.get('/api/products', async (req, res) => {
    const { drop, cat } = req.query;

    try {
      const conditions = ['p.active = true'];
      const values     = [];

      if (drop && drop !== 'all') {
        values.push(drop);
        conditions.push(`p.drop = $${values.length}`);
      }
      if (cat && cat !== 'all') {
        values.push(cat);
        conditions.push(`p.cat = $${values.length}`);
      }

      const where = conditions.join(' AND ');

      const { rows } = await pool.query(`
        SELECT
          p.id,
          p.name,
          p.cat,
          p.drop,
          p.price,
          p.original_price   AS "originalPrice",
          p.is_new           AS "isNew",
          p.is_sale          AS "isSale",
          p.image,
          p.image_hover      AS "imageHover",
          p.description,

          -- Colores como array: ['Negro', 'Gris']
          COALESCE(
            json_agg(DISTINCT jsonb_build_object('name', pc.name, 'hex', pc.hex))
            FILTER (WHERE pc.name IS NOT NULL),
            '[]'
          ) AS colors,

          -- Stock agrupado por talle y color
          COALESCE(
            json_agg(DISTINCT jsonb_build_object(
              'size',  ps.size,
              'color', ps.color,
              'stock', ps.stock
            )) FILTER (WHERE ps.size IS NOT NULL),
            '[]'
          ) AS stock

        FROM products p
        LEFT JOIN product_colors pc ON pc.product_id = p.id
        LEFT JOIN product_stock  ps ON ps.product_id  = p.id
        WHERE ${where}
        GROUP BY p.id
        ORDER BY p.created_at DESC
      `, values);

      res.json(rows);

    } catch (err) {
      console.error('Error fetching products:', err);
      res.status(500).json({ error: 'No se pudieron obtener los productos.' });
    }
  });

  // ── GET /api/products/:id ──────────────────────────────────
  app.get('/api/products/:id', async (req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT
          p.*,
          p.original_price AS "originalPrice",
          p.is_new         AS "isNew",
          p.is_sale        AS "isSale",
          p.image_hover    AS "imageHover",
          COALESCE(
            json_agg(DISTINCT jsonb_build_object('name', pc.name, 'hex', pc.hex))
            FILTER (WHERE pc.name IS NOT NULL),
            '[]'
          ) AS colors,
          COALESCE(
            json_agg(DISTINCT jsonb_build_object(
              'size',  ps.size,
              'color', ps.color,
              'stock', ps.stock
            )) FILTER (WHERE ps.size IS NOT NULL),
            '[]'
          ) AS stock
        FROM products p
        LEFT JOIN product_colors pc ON pc.product_id = p.id
        LEFT JOIN product_stock  ps ON ps.product_id  = p.id
        WHERE p.id = $1 AND p.active = true
        GROUP BY p.id
      `, [req.params.id]);

      if (!rows.length) return res.status(404).json({ error: 'Producto no encontrado.' });
      res.json(rows[0]);

    } catch (err) {
      console.error('Error fetching product:', err);
      res.status(500).json({ error: 'Error al obtener el producto.' });
    }
  });
  // GET /api/drops
    app.get('/api/drops', async (req, res) => {
    const { rows } = await pool.query(
        `SELECT *, hero_image AS "heroImage", hero_image2 AS "heroImage2",
        accent_color AS "accentColor", release_date AS "releaseDate",
        total_pieces AS "totalPieces"
        FROM drops WHERE active = true ORDER BY created_at ASC`
    );
    res.json(rows);
    });

    // GET /api/drops/:id
    app.get('/api/drops/:id', async (req, res) => {
    const { rows } = await pool.query(
        `SELECT *, hero_image AS "heroImage", hero_image2 AS "heroImage2",
        accent_color AS "accentColor", release_date AS "releaseDate",
        total_pieces AS "totalPieces"
        FROM drops WHERE id = $1 AND active = true`,
        [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Drop no encontrado.' });
    res.json(rows[0]);
    });
}