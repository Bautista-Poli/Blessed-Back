// routes/drops.js
import { pool } from './products.js';

export function registerDropRoutes(app) {

  // ── GET /api/drops ───────────────────────────────────────────
  app.get('/api/drops', async (req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT *,
          hero_image   AS "heroImage",
          hero_image2  AS "heroImage2",
          accent_color AS "accentColor",
          release_date AS "releaseDate",
          total_pieces AS "totalPieces"
        FROM drops WHERE active = true ORDER BY created_at ASC
      `);
      res.json(rows);
    } catch (err) {
      console.error('GET /api/drops error:', err);
      res.status(500).json({ error: 'Error al obtener los drops.' });
    }
  });

  // ── GET /api/drops/:id ───────────────────────────────────────
  app.get('/api/drops/:id', async (req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT *,
          hero_image   AS "heroImage",
          hero_image2  AS "heroImage2",
          accent_color AS "accentColor",
          release_date AS "releaseDate",
          total_pieces AS "totalPieces"
        FROM drops WHERE id = $1 AND active = true
      `, [req.params.id]);

      if (!rows.length) return res.status(404).json({ error: 'Drop no encontrado.' });
      res.json(rows[0]);
    } catch (err) {
      console.error('GET /api/drops/:id error:', err);
      res.status(500).json({ error: 'Error al obtener el drop.' });
    }
  });
}