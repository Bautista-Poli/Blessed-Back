// routes/admin.js
import { pool } from './products.js';

export function registerAdminRoutes(app) {

  // ── POST /api/products ── Crear producto ─────────────────────
  app.post('/api/products', async (req, res) => {
    const {
      id, name, cat, drop, price, description,
      originalPrice, isNew = false, isSale = false,
      images = [],
    } = req.body;

    if (!id || !name || !cat || !drop || !price || !originalPrice) {
      return res.status(400).json({ error: 'Campos requeridos: id, name, cat, drop, price, originalPrice.' });
    }

    try {
      const { rows } = await pool.query(`
        INSERT INTO products (id, name, cat, drop, price, original_price, is_new, is_sale, images, description)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING
          id, name, cat, drop, price, images, description,
          original_price AS "originalPrice",
          is_new         AS "isNew",
          is_sale        AS "isSale"
      `, [id, name, cat, drop, price, originalPrice, isNew, isSale, images, description ?? null]);

      res.status(201).json({ ...rows[0], colors: [], stock: [] });
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: `Ya existe un producto con id "${id}".` });
      console.error('POST /api/products error:', err);
      res.status(500).json({ error: 'Error al crear el producto.' });
    }
  });

  // ── DELETE /api/products/:id ── Eliminar producto ────────────
  app.delete('/api/products/:id', async (req, res) => {
    try {
      const { rowCount } = await pool.query(
        'DELETE FROM products WHERE id = $1', [req.params.id]
      );
      if (!rowCount) return res.status(404).json({ error: 'Producto no encontrado.' });
      res.status(204).send();
    } catch (err) {
      console.error('DELETE /api/products/:id error:', err);
      res.status(500).json({ error: 'Error al eliminar el producto.' });
    }
  });

  // ── POST /api/products/:id/images ── Agregar imagen ──────────
  // Body: { url: 'assets/...' }
  app.post('/api/products/:id/images', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'Se requiere { url }.' });

    try {
      const { rows } = await pool.query(`
        UPDATE products
        SET images = array_append(images, $1)
        WHERE id = $2
        RETURNING images
      `, [url, req.params.id]);

      if (!rows.length) return res.status(404).json({ error: 'Producto no encontrado.' });
      res.json({ images: rows[0].images });
    } catch (err) {
      console.error('POST /api/products/:id/images error:', err);
      res.status(500).json({ error: 'Error al agregar la imagen.' });
    }
  });

  // ── DELETE /api/products/:id/images ── Eliminar imagen ───────
  // Body: { url: 'assets/...' }   OR   { index: 2 }
  app.delete('/api/products/:id/images', async (req, res) => {
    const { url, index } = req.body;

    if (url === undefined && index === undefined) {
      return res.status(400).json({ error: 'Se requiere { url } o { index }.' });
    }

    try {
      let query, params;

      if (url !== undefined) {
        // Eliminar por URL exacta
        query = `
          UPDATE products
          SET images = array_remove(images, $1)
          WHERE id = $2
          RETURNING images
        `;
        params = [url, req.params.id];
      } else {
        // Eliminar por índice (0-based)
        query = `
          UPDATE products
          SET images = images[1:$1] || images[$2:]
          WHERE id = $3
          RETURNING images
        `;
        // PostgreSQL arrays son 1-based, convertimos
        params = [index, index + 2, req.params.id];
      }

      const { rows } = await pool.query(query, params);
      if (!rows.length) return res.status(404).json({ error: 'Producto no encontrado.' });
      res.json({ images: rows[0].images });
    } catch (err) {
      console.error('DELETE /api/products/:id/images error:', err);
      res.status(500).json({ error: 'Error al eliminar la imagen.' });
    }
  });

  // ── PUT /api/products/:id/images ── Reordenar imágenes ───────
  // Body: { images: ['url1', 'url2', 'url3'] }
  app.put('/api/products/:id/images', async (req, res) => {
    const { images } = req.body;
    if (!Array.isArray(images)) return res.status(400).json({ error: 'Se requiere { images: [] }.' });

    try {
      const { rows } = await pool.query(`
        UPDATE products SET images = $1 WHERE id = $2 RETURNING images
      `, [images, req.params.id]);

      if (!rows.length) return res.status(404).json({ error: 'Producto no encontrado.' });
      res.json({ images: rows[0].images });
    } catch (err) {
      console.error('PUT /api/products/:id/images error:', err);
      res.status(500).json({ error: 'Error al reordenar las imágenes.' });
    }
  });
}