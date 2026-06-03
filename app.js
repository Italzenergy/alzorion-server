import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import path from 'path';
import authRoutes from './src/routes/auth.Routes.js';
import productRoutes from './src/routes/product.Routes.js';
import inventoryRoutes  from './src/routes/inventory.Routes.js';
import actaRoutes from './src/routes/acta.Routes.js';
import userRoutes from './src/routes/user.Routes.js';
import quotationRoutes from './src/routes/quotation.Routes.js';
// 1 CARGAMOS VARIABLES DE ENTORNO 
dotenv.config();
//2 INICIALIZAMOS LA APP CON EXPRESS 
const app = express();

// ==========================================
// MIDDLEWARES (Los Guardianes)
// ==========================================
// El orden importa. Express ejecuta esto de arriba a abajo en cada petición.

// 1. Helmet: Protege tu app de ataques comunes HTTP (esconde info del servidor, protege cabeceras)
app.use(helmet());
// 2. Morgan: El "Chismoso". Muestra en consola quién pide qué.
// Ej: "GET /api/inventario 200 12ms"
app.use(morgan('dev'));
// 3. CORS: Control de Aduanas.
// Define quién puede hablar con este servidor.
app.use(cors({
  origin: process.env.FRONTEND_URL, // Solo permitimos peticiones desde tu Next.js (localhost:3000)
  credentials: true, // ¡CRUCIAL! Permite el paso de Cookies (Session) entre Frontend y Backend
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));
// 4. Parsers: Traductores para entender lo que llega.
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true })); // Permite leer req.body en formato JSON
app.use(cookieParser()); // Permite leer req.cookies (sin esto, las cookies son invisibles)

// ==========================================
// RUTAS (Las Direcciones)
// ==========================================

// Ruta de prueba para ver si el servidor respira
app.get('/', (req, res) => {
  res.json({ message: ' Servidor Backend funcionando correctamente' });
});

// AQUI IMPORTAREMOS TUS RUTAS REALES LUEGO
// app.use('/api/auth', authRoutes);
// app.use('/api/inventory', inventoryRoutes);
app.use('/api/auth',authRoutes);
app.use('/api/actas', actaRoutes);
app.use('/api/products', productRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/users', userRoutes);
app.use('/api/quotations', quotationRoutes);
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));
// ==========================================
// MANEJO DE ERRORES GLOBAL
// ==========================================
// Si algo falla en los controladores y usas next(error), cae aquí.
app.use((err, req, res, next) => {
  console.error(' Error capturado:', err.stack);
  res.status(500).json({ 
    error: 'Ocurrió un error interno en el servidor',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined 
  });
});

// ==========================================
// INICIAR SERVIDOR
// ==========================================
const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`
  ################################################
   Servidor corriendo en puerto: ${PORT}
   Ambiente: ${process.env.NODE_ENV}
   Frontend permitido: ${process.env.FRONTEND_URL}
  ################################################
  `);
});

export default app;
