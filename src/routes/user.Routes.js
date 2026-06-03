import { Router } from 'express';
import userController from '../controllers/user.Controller.js';
import { authenticateUser, authorizePermission } from '../middleware/authMiddleware.js';

const router = Router();

// Todas las rutas de usuarios requieren estar logueado
router.use(authenticateUser);

// AQUÍ ESTÁ LA MAGIA: 
// Usamos los SLUGS de permisos que creaste en tu base de datos
router.get('/', authorizePermission('users.view'), userController.getAllUsers);
router.post('/', authorizePermission('users.manage'), userController.createUser);
router.put('/:id', authorizePermission('users.manage'), userController.updateUser);
router.delete('/:id', authorizePermission('users.manage'), userController.deleteUser);

export default router;