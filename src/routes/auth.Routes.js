import { Router } from "express";
import {authController} from '../controllers/auth.Controller.js'
import { authenticateUser } from '../middleware/authMiddleware.js';
 const router = Router();

//Metodo post http://localhost4000/api/auth/login
router.post('/login',authController.login);
//Metodo post http://localhost4000/api/auth/logout
router.post('/logout',authController.logout);
router.get('/profile', authenticateUser, authController.getProfile);
export default router;