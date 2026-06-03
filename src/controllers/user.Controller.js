import { userService } from '../services/user.Service.js';

const userController = {
  getAllUsers: async (req, res) => {
    try {
      const users = await userService.getAllUsers();
      res.json(users);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  createUser: async (req, res) => {
    try {
      const { email, password, full_name, role } = req.body;

      if (!email || !password || !full_name || !role) {
        return res.status(400).json({ error: 'Faltan campos obligatorios.' });
      }

      await userService.createUser({ email, password, full_name, role });
      res.status(201).json({ message: 'Usuario creado exitosamente.' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
// === NUEVO: ACTUALIZAR USUARIO ===
  updateUser: async (req, res) => {
    try {
      const { id } = req.params;
      await userService.updateUser(id, req.body);
      res.json({ message: 'Usuario actualizado correctamente.' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
  deleteUser: async (req, res) => {
    try {
      await userService.deleteUser(req.params.id);
      res.json({ message: 'Usuario eliminado del sistema.' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
};

export default userController;