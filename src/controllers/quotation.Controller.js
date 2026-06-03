import { quotationService } from '../services/quotation.Service.js';

const quotationController = {
 getAll: async (req, res) => {
    try {
      // Pasamos req.user al servicio
      const data = await quotationService.getAll(req.user);
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
  getById: async (req, res) => {
    try {
      const data = await quotationService.getById(req.params.id);
      res.json(data);
    } catch (error) {
      console.error(" ERROR EN GET BY ID:", error.message); 
      res.status(404).json({ error: 'Cotización no encontrada' });
    }
  },

  searchClients: async (req, res) => {
    try {
      // Tomamos lo que el usuario escribe en la URL: ?q=juan
      const query = req.query.q || ''; 
      const data = await quotationService.searchClients(query);
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  create: async (req, res) => {
    try {
      const userId = req.user.id; // Lo sacamos del token de sesión
      const newQuotation = await quotationService.create(req.body, userId);
      res.status(201).json(newQuotation);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
  update: async (req, res) => {
    try {
      await quotationService.update(req.params.id, req.body);
      res.json({ message: 'Cotización actualizada' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  delete: async (req, res) => {
    try {
      await quotationService.delete(req.params.id);
      res.json({ message: 'Cotización eliminada.' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
  sendEmail: async (req, res) => {
    try {
      const { pdfBase64 } = req.body;
      if (!pdfBase64) return res.status(400).json({ error: "Falta el archivo PDF en base64" });
      
      await quotationService.sendEmail(req.params.id, pdfBase64);
      res.json({ message: 'Cotización enviada con éxito' });
    } catch (error) {
      console.error(" ERROR ENVIANDO CORREO:", error.message);
      res.status(500).json({ error: error.message });
    }
  },
  confirmSale: async (req, res) => {
    try {
      const userId = req.user.id; // Del token JWT
      const result = await quotationService.confirmSale(req.params.id, userId);
      res.json(result);
    } catch (error) {
      console.error(" ERROR CONFIRMANDO VENTA:", error.message);
      res.status(500).json({ error: error.message });
    }
  },
  revertSale: async (req, res) => {
    try {
      // Como el middleware de seguridad ya protegió la ruta, ejecutamos directo
      const result = await quotationService.revertSale(req.params.id);
      res.json(result);
    } catch (error) {
      console.error(" ERROR REVIRTIENDO VENTA:", error.message);
      res.status(400).json({ error: error.message }); // 400 por si es error de bodega
    }
  },
  cancel: async (req, res) => {
    try {
      const userId = req.user.id;
      const result = await quotationService.cancelQuotation(req.params.id, userId);
      res.json(result);
    } catch (error) {
      console.error(" ERROR CANCELANDO DOCUMENTO:", error.message);
      res.status(400).json({ error: error.message });
    }
  },
  // POST /api/quotations/:id/upload-receipt
  uploadReceipt: async (req, res) => {
    try {
      const { id } = req.params;
      
      // Multer automáticamente inyecta el archivo procesado en 'req.file'
      if (!req.file) {
        return res.status(400).json({ error: 'No se recibió ningún archivo o el formato fue bloqueado por seguridad.' });
      }

      // Construimos la ruta pública relativa para guardarla en la Base de Datos
      // Quedará algo como: /uploads/receipts/receipt_1713000-123.pdf
      const fileUrl = `/uploads/receipts/${req.file.filename}`;

      // Llamamos a nuestro servicio para actualizar la cotización
      await quotationService.updateReceiptStatus(id, fileUrl);

      res.json({ 
        message: 'Comprobante subido con éxito y enviado a revisión de Contabilidad.', 
        receiptUrl: fileUrl 
      });

    } catch (error) {
      console.error(" ERROR SUBIENDO COMPROBANTE:", error.message);
      res.status(500).json({ error: error.message });
    }
  },
};

export default quotationController;