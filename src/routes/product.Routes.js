import { Router } from 'express';
import productController from '../controllers/product.Controller.js';
import { authenticateUser, authorizePermission } from '../middleware/authMiddleware.js';

const router = Router();

// Todas las rutas requieren estar LOGUEADO
router.use(authenticateUser);

// Rutas Públicas (para cualquier usuario logueado)
// Todos pueden ver el catálogo (Consultor, Logística, Admin)
router.get('/', authorizePermission('inventory.view'), productController.getAll);
router.get('/:id', authorizePermission('inventory.view'), productController.getOne);

// Rutas Protegidas (Solo Admin o Logística con permiso de crear)
// Crear productos
router.post('/', 
  authorizePermission('inventory.create'), 
  productController.create
);

// Eliminar productos (Quizás solo Admin? o quien tenga inventory.delete)
router.delete('/:id', 
  authorizePermission('inventory.delete'), 
  productController.delete
);
router.put('/:id', authorizePermission('inventory.edit'), productController.updateProduct);
export default router;