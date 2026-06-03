import { Router } from 'express';
import inventoryController from '../controllers/inventory.Controller.js';
import { authenticateUser, authorizePermission } from '../middleware/authMiddleware.js';

const router = Router();

// Todas las rutas de inventario requieren estar LOGUEADO
router.use(authenticateUser);
// RUTA DEL DASHBOARD (Agrega esta línea)
router.get('/dashboard-stats', authorizePermission('reports.view'), inventoryController.getDashboardStats);
// RUTA PROTEGIDA: Solo quienes tengan la llave 'inventory.create' pueden meter mercancía
router.post('/inbound', authorizePermission('inventory.create'), inventoryController.createIntake);
// Agrega esta línea arriba de la de 'inbound'
router.get('/stock', authorizePermission('inventory.view'), inventoryController.getStock);
// Agrega esta línea al final de tus rutas
router.put('/adjust', authorizePermission('inventory.edit'), inventoryController.adjustStatus);
// RUTA NUEVA: Buscador de seriales para el modal de actas
router.get('/products/:productId/serials', authorizePermission('inventory.view'), inventoryController.getSerialsByProduct);
export default router;