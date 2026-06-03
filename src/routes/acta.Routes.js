import { Router } from 'express';
import actaController from '../controllers/acta.Controller.js';
import { authenticateUser, authorizePermission } from '../middleware/authMiddleware.js';

const router = Router();

// Middleware de autenticación para todas las rutas
router.use(authenticateUser);

// Rutas Generales
router.post('/', authorizePermission('actas.create'), actaController.create);
router.get('/', authorizePermission('actas.view'), actaController.getAll);

// Rutas Específicas (Van al final)
router.post('/:id/process', authorizePermission('actas.edit'), actaController.process);
router.get('/:id', authorizePermission('actas.view'), actaController.getOne);
router.put('/:id', authorizePermission('actas.edit'), actaController.update);
// Ruta para anular actas (Devolver inventario)
router.post('/:id/void', authorizePermission('actas.void'), actaController.voidActa);
export default router;