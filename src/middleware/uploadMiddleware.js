import multer from 'multer';
import path from 'path';
import fs from 'fs';

// 1. CREAR LA CARPETA SI NO EXISTE
// Esto es vital para el VPS. Si la carpeta no existe, Node.js fallaría al intentar guardar.
const uploadDir = 'uploads/receipts';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// 2. CONFIGURACIÓN DE ALMACENAMIENTO (El "Disco Duro")
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Le decimos a Multer que guarde el archivo en nuestra carpeta segura
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Extraemos la extensión original (.pdf, .png, etc.)
    const ext = path.extname(file.originalname);
    
    // Creamos un nombre único e irrepetible para evitar sobreescrituras
    // Formato: receipt_1713000000000-123456.pdf
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    
    cb(null, `receipt_${uniqueSuffix}${ext}`);
  }
});

// 3. FILTRO DE SEGURIDAD (El "Guardia de la Puerta")
const fileFilter = (req, file, cb) => {
  // Lista blanca estricta de formatos permitidos
  const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true); // Archivo limpio, déjalo pasar
  } else {
    // Es un archivo malicioso o no soportado, lo bloqueamos
    cb(new Error('Formato no válido. Solo se permiten archivos PDF, JPG y PNG.'), false);
  }
};

// 4. EXPORTAR EL MIDDLEWARE LISTO
export const uploadReceipt = multer({
  storage: storage,
  limits: { 
    fileSize: 5 * 1024 * 1024 // Límite estricto de 5 Megabytes por seguridad
  },
  fileFilter: fileFilter
});