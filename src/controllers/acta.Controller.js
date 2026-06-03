import { actaService } from '../services/acta.Service.js';

const actaController = {
  create: async (req, res) => {
    try {
      const actaData = req.body;
      const userId = req.user.id; 

      if (!actaData.client_name || !actaData.transporter_name || !actaData.destination_city) {
        return res.status(400).json({ error: 'Faltan datos obligatorios (Cliente, Transportador o Destino)' });
      }

      const newActa = await actaService.createActa(actaData, userId);
      
      res.status(201).json({
        message: 'Acta generada exitosamente',
        data: newActa
      });
    } catch (error) {
      console.error("Error al crear acta:", error);
      res.status(500).json({ error: error.message });
    }
  },

  getAll: async (req, res) => {
    try {
      const actas = await actaService.getAllActas();
      res.json(actas);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // LLAMAMOS AL SERVICIO PARA BUSCAR UNA SOLA
  getOne: async (req, res) => {
    try {
      const acta = await actaService.getActaById(req.params.id);
      res.json(acta);
    } catch (error) {
      res.status(404).json({ error: error.message });
    }
  },

  // LLAMAMOS AL SERVICIO PARA ACTUALIZAR
  update: async (req, res) => {
    try {
      const updatedActa = await actaService.updateActa(req.params.id, req.body);
      res.json({ message: 'Acta actualizada con éxito', data: updatedActa });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
  // ... tus funciones anteriores (create, getAll, getOne, update)

  process: async (req, res) => {
    try {
      const actaId = req.params.id;
      const { movements } = req.body;
      const userId = req.user.id; // Quién está procesando esto

      // Enviamos todo al Servicio (El Cocinero) para que haga la validación estricta
      const result = await actaService.processActaInventory(actaId, movements, userId);

      res.json({ message: 'Inventario descontado exitosamente', result });
    } catch (error) {
      // Si falla cualquier serial, caerá aquí y le mandará el error al Frontend
      res.status(400).json({ error: error.message });
    }
  },
  voidActa: async (req, res) => {
    try {
      const actaId = req.params.id;
      const userId = req.user.id;
      
      const result = await actaService.voidActa(actaId, userId);
      res.json(result);
    } catch (error) {
      console.error("Error al anular acta:", error);
      res.status(400).json({ error: error.message });
    }
  }
};


export default actaController;