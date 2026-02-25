// routes/drops.js
import { pool } from './products.js';

export function registerDropRoutes(app) {


  app.get('/api/drops', async (req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT *,
          hero_image   AS "heroImage",
          hero_image2  AS "heroImage2",
          accent_color AS "accentColor",
          release_date AS "releaseDate",
          total_pieces AS "totalPieces"
        FROM drops
        WHERE active = true
        ORDER BY number ASC
      `);
      res.json(rows);
    } catch (err) {
      console.error('GET /api/drops error:', err);
      res.status(500).json({ error: 'Error al obtener los drops.' });
    }
  });

  // ── GET /api/drops/admin/all ────────────────────────────────────
  // Admin: todos los drops (activos e inactivos)
  app.get('/api/drops/admin/all', async (req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT *,
          hero_image   AS "heroImage",
          hero_image2  AS "heroImage2",
          accent_color AS "accentColor",
          release_date AS "releaseDate",
          total_pieces AS "totalPieces"
        FROM drops
        ORDER BY number ASC
      `);
      res.json(rows);
    } catch (err) {
      console.error('GET /api/drops/admin/all error:', err);
      res.status(500).json({ error: 'Error al obtener los drops.' });
    }
  });

  // ── GET /api/drops/:id ─────────────────────────────────────────
  app.get('/api/drops/:id', async (req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT *,
          hero_image   AS "heroImage",
          hero_image2  AS "heroImage2",
          accent_color AS "accentColor",
          release_date AS "releaseDate",
          total_pieces AS "totalPieces"
        FROM drops
        WHERE id = $1
      `, [req.params.id]);

      if (!rows.length) return res.status(404).json({ error: 'Drop no encontrado.' });
      res.json(rows[0]);
    } catch (err) {
      console.error('GET /api/drops/:id error:', err);
      res.status(500).json({ error: 'Error al obtener el drop.' });
    }
  });

  // ── POST /api/drops ────────────────────────────────────────────
  app.post('/api/drops', async (req, res) => {
    const {
      id, number, label, tagline, description,
      hero_image, hero_image2, accent_color,
      release_date, total_pieces, active
    } = req.body;

    // Validaciones mínimas
    if (!id || !number || !label || !tagline || !description || !hero_image || !release_date) {
      return res.status(400).json({ error: 'Faltan campos obligatorios.' });
    }

    try {
      const { rows } = await pool.query(`
        INSERT INTO drops (
          id, number, label, tagline, description,
          hero_image, hero_image2, accent_color,
          release_date, total_pieces, active
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        RETURNING *,
          hero_image   AS "heroImage",
          hero_image2  AS "heroImage2",
          accent_color AS "accentColor",
          release_date AS "releaseDate",
          total_pieces AS "totalPieces"
      `, [
        id,
        number,
        label,
        tagline,
        description,
        hero_image,
        hero_image2 || null,
        accent_color || '#e8e4dc',
        release_date,
        total_pieces ?? 0,
        active ?? true,
      ]);

      res.status(201).json(rows[0]);
    } catch (err) {
      // Violación de clave primaria (id duplicado)
      if (err.code === '23505') {
        return res.status(409).json({ error: `Ya existe un drop con id "${id}".` });
      }
      console.error('POST /api/drops error:', err);
      res.status(500).json({ error: 'Error al crear el drop.' });
    }
  });

  // ── PUT /api/drops/:id ─────────────────────────────────────────
  app.put('/api/drops/:id', async (req, res) => {
    const { id } = req.params;
    const {
      number, label, tagline, description,
      hero_image, hero_image2, accent_color,
      release_date, total_pieces, active
    } = req.body;

    try {
      const { rows } = await pool.query(`
        UPDATE drops SET
          number       = COALESCE($1,  number),
          label        = COALESCE($2,  label),
          tagline      = COALESCE($3,  tagline),
          description  = COALESCE($4,  description),
          hero_image   = COALESCE($5,  hero_image),
          hero_image2  = $6,
          accent_color = COALESCE($7,  accent_color),
          release_date = COALESCE($8,  release_date),
          total_pieces = COALESCE($9,  total_pieces),
          active       = COALESCE($10, active)
        WHERE id = $11
        RETURNING *,
          hero_image   AS "heroImage",
          hero_image2  AS "heroImage2",
          accent_color AS "accentColor",
          release_date AS "releaseDate",
          total_pieces AS "totalPieces"
      `, [
        number       ?? null,
        label        ?? null,
        tagline      ?? null,
        description  ?? null,
        hero_image   ?? null,
        hero_image2  ?? null,   // puede ser null intencionalmente
        accent_color ?? null,
        release_date ?? null,
        total_pieces ?? null,
        active       ?? null,
        id,
      ]);

      if (!rows.length) return res.status(404).json({ error: 'Drop no encontrado.' });
      res.json(rows[0]);
    } catch (err) {
      console.error('PUT /api/drops/:id error:', err);
      res.status(500).json({ error: 'Error al actualizar el drop.' });
    }
  });

  // ── DELETE /api/drops/:id ──────────────────────────────────────
  app.delete('/api/drops/:id', async (req, res) => {
    try {
      const { rowCount } = await pool.query(
        'DELETE FROM drops WHERE id = $1',
        [req.params.id]
      );

      if (!rowCount) return res.status(404).json({ error: 'Drop no encontrado.' });
      res.status(204).send();
    } catch (err) {
      console.error('DELETE /api/drops/:id error:', err);
      res.status(500).json({ error: 'Error al eliminar el drop.' });
    }
  });
}