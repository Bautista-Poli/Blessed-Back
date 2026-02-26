// routes/products.js
import pg from 'pg';
const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const DEFAULT_SIZES = ['XS', 'S', 'M', 'L', 'XL'];

export function registerProductRoutes(app) {

  // ── GET /api/products ────────────────────────────────────────
  app.get('/api/products', async (req, res) => {
    const { drop, cat } = req.query;
    try {
      const conditions = ['p.active = true'];
      const values     = [];

      if (drop && drop !== 'all') { values.push(drop); conditions.push(`p.drop = $${values.length}`); }
      if (cat  && cat  !== 'all') { values.push(cat);  conditions.push(`p.cat = $${values.length}`);  }

      const { rows } = await pool.query(`
        SELECT
          p.id,
          p.name,
          p.cat,
          p.drop,
          p.price,
          p.original_price AS "originalPrice",
          p.is_new         AS "isNew",
          p.is_sale        AS "isSale",
          p.images,
          p.description,
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
        WHERE ${conditions.join(' AND ')}
        GROUP BY p.id
        ORDER BY p.created_at DESC
      `, values);

      res.json(rows);
    } catch (err) {
      console.error('GET /api/products error:', err);
      res.status(500).json({ error: 'No se pudieron obtener los productos.' });
    }
  });

  // ── GET /api/products/:id ────────────────────────────────────
  app.get('/api/products/:id', async (req, res) => {
    try {
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
        WHERE p.id = $1 AND p.active = true
        GROUP BY p.id
      `, [req.params.id]);

      if (!rows.length) return res.status(404).json({ error: 'Producto no encontrado.' });
      res.json(rows[0]);
    } catch (err) {
      console.error('GET /api/products/:id error:', err);
      res.status(500).json({ error: 'Error al obtener el producto.' });
    }
  });

  // ── POST /api/products ───────────────────────────────────────
  app.post('/api/products', async (req, res) => {
    const {
      id, name, cat, drop, price, originalPrice,
      isNew, isSale, images, description,
      colors = [],
      // El frontend puede enviar las tallas que quiere inicializar.
      // Si no envía nada usamos DEFAULT_SIZES.
      initialSizes = DEFAULT_SIZES,
    } = req.body;

    if (!id || !name || !cat || !drop || !price) {
      return res.status(400).json({ error: 'Faltan campos obligatorios.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Insertar el producto
      await client.query(`
        INSERT INTO products (id, name, cat, drop, price, original_price, is_new, is_sale, images, description, active)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true)
      `, [
        id, name, cat, drop,
        Number(price),
        Number(originalPrice ?? price),
        !!isNew, !!isSale,
        images ?? [],
        description || null,
      ]);

      // 2. Insertar colores
      for (const c of colors) {
        await client.query(
          'INSERT INTO product_colors (product_id, name, hex) VALUES ($1,$2,$3)',
          [id, c.name, c.hex]
        );
      }

      // 3. Insertar stock default con quantity = 0
      //    Si el producto tiene colores → una fila por talla × color
      //    Si no tiene colores           → una fila por talla (color = null)
      const stockEntries = colors.length > 0
        ? initialSizes.flatMap(size => colors.map(c => ({ size, color: c.name })))
        : initialSizes.map(size => ({ size, color: null }));

      for (const { size, color } of stockEntries) {
        await client.query(
          'INSERT INTO product_stock (product_id, size, color, stock) VALUES ($1,$2,$3,0)',
          [id, size, color]
        );
      }

      await client.query('COMMIT');

      // Devolver el producto completo con stock y colores
      const { rows } = await client.query(`
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
      `, [id]);

      res.status(201).json(rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.code === '23505') {
        return res.status(409).json({ error: `Ya existe un producto con id "${id}".` });
      }
      console.error('POST /api/products error:', err);
      res.status(500).json({ error: 'Error al crear el producto.' });
    } finally {
      client.release();
    }
  });

  // ── DELETE /api/products/:id ─────────────────────────────────
  app.delete('/api/products/:id', async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Borrar en cascada (si no tenés ON DELETE CASCADE en el schema)
      await client.query('DELETE FROM product_stock  WHERE product_id = $1', [req.params.id]);
      await client.query('DELETE FROM product_colors WHERE product_id = $1', [req.params.id]);
      const { rowCount } = await client.query(
        'DELETE FROM products WHERE id = $1', [req.params.id]
      );
      await client.query('COMMIT');
      if (!rowCount) return res.status(404).json({ error: 'Producto no encontrado.' });
      res.status(204).send();
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('DELETE /api/products/:id error:', err);
      res.status(500).json({ error: 'Error al eliminar el producto.' });
    } finally {
      client.release();
    }
  });
}