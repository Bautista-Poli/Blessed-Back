import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { registerProductRoutes } from './routes/products.js';
import { registerDropRoutes }    from './routes/drops.js';
import { registerAdminRoutes }   from './routes/admin.js';
import { registerUploadRoutes }  from './routes/imageUpload.js';
import { registerStockRoutes }   from './routes/stock.js';
import { registerCartRoutes }    from './routes/cart.js'; // ← La nueva importación

dotenv.config();

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cors({
  origin: (origin, callback) => {
    const allowed = [
      process.env.FRONTEND_URL,
      'http://localhost:4200',
      'http://localhost:4201',
    ].filter(Boolean);
    if (!origin || allowed.includes(origin)) callback(null, true);
    else callback(new Error(`CORS bloqueado para: ${origin}`));
  }
}));

// ── Registro de Rutas ────────────────────────────────────────
registerProductRoutes(app);
registerDropRoutes(app);
registerAdminRoutes(app);
registerUploadRoutes(app);
registerStockRoutes(app);
registerCartRoutes(app); // ← Inyectamos las rutas de checkout/webhook

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/', (_req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => console.log(`🚀 Servidor en http://localhost:${PORT}`));