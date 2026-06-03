import { Router } from 'express';
import quotationController from '../controllers/quotation.Controller.js';
import { authenticateUser } from '../middleware/authMiddleware.js';
import analyticsController from '../controllers/analytics.Controller.js';
import { uploadReceipt } from '../middleware/uploadMiddleware.js';
const router = Router();

// Todas estas rutas requieren inicio de sesión
router.use(authenticateUser);

// 1. RUTAS FIJAS (Estáticas) PRIMERO
router.get('/', quotationController.getAll);
router.get('/clients/search', quotationController.searchClients);
router.get('/analytics/dashboard', analyticsController.getDashboard); // <--- DEBE IR AQUÍ

// 2. RUTAS DINÁMICAS (Con :id) DESPUÉS
router.get('/:id', quotationController.getById);
router.put('/:id', quotationController.update);
router.delete('/:id', quotationController.delete);
router.post('/:id/upload-receipt', uploadReceipt.single('receipt'), quotationController.uploadReceipt);

router.post('/', quotationController.create);
router.post('/:id/send', quotationController.sendEmail);
router.post('/:id/confirm', quotationController.confirmSale);
router.post('/:id/revert', quotationController.revertSale);
router.post('/:id/cancel', quotationController.cancel);

export default router;