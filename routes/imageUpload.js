import { v2 as cloudinary } from 'cloudinary';
import multer from 'multer';

const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export function registerUploadRoutes(app) {
  app.get('/api/uploads/', (_req, res) => res.json({ status: 'ok' }));

  // POST /api/uploads/product
  app.post('/api/uploads/product', upload.single('file'), async (req, res) => {
    try {
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: 'blessed/products', resource_type: 'image' },
          (err, result) => err ? reject(err) : resolve(result)
        );
        stream.end(req.file.buffer);
      });
      res.json({ url: result.secure_url, publicId: result.public_id });
    } catch (err) {
      console.error('Upload product error:', err);
      res.status(500).json({ error: 'Error al subir imagen.' });
    }
  });

  // POST /api/uploads/drop
  app.post('/api/uploads/drop', upload.single('file'), async (req, res) => {
    try {
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: 'blessed/drops', resource_type: 'image' },
          (err, result) => err ? reject(err) : resolve(result)
        );
        stream.end(req.file.buffer);
      });
      res.json({ url: result.secure_url, publicId: result.public_id });
    } catch (err) {
      console.error('Upload drop error:', err);
      res.status(500).json({ error: 'Error al subir imagen.' });
    }
  });

  // DELETE /api/uploads
  app.delete('/api/uploads', async (req, res) => {
    const { publicId } = req.body;
    if (!publicId) return res.status(400).json({ error: 'publicId requerido' });
    try {
      await cloudinary.uploader.destroy(publicId);
      res.json({ ok: true });
    } catch (err) {
      console.error('Delete image error:', err);
      res.status(500).json({ error: 'Error al borrar imagen.' });
    }
  });
}