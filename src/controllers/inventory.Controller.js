import { inventoryService } from '../services/inventory.Service.js';
import { productService } from '../services/product.Service.js'; // Necesitamos consultar el catálogo
import { supabase } from '../config/supabaseClient.js'; // <-- ¡ESTA ES LA LÍNEA QUE FALTA!
const inventoryController = {
  
  // POST /api/inventory/inbound
  createIntake: async (req, res) => {
    try {
      const { entry_date, import_number, location, owner, product_id, items } = req.body;
      const userId = req.user.id; // Extraído de la Cookie por tu middleware "El Portero"

      // 1. Validaciones de seguridad básicas
      if (!import_number || !location || !owner || !product_id || !items) {
        return res.status(400).json({ error: 'Faltan campos obligatorios para el ingreso' });
      }

      // 2. Verificar la regla de negocio del producto
      const product = await productService.getProductById(product_id);

      if (product.is_serialized && !Array.isArray(items)) {
        return res.status(400).json({ error: 'Inconsistencia: El producto exige números de serie pero no se recibió el listado.' });
      }

      if (!product.is_serialized && !items.quantity) {
        return res.status(400).json({ error: 'Inconsistencia: El producto es a granel pero no se indicó la cantidad.' });
      }

      // 3. Enviar a procesar
      const result = await inventoryService.registerIntake({
        entry_date,
        import_number,
        location,
        owner,
        product_id,
        items,
        is_serialized: product.is_serialized
      }, userId);

      res.status(201).json({ 
        message: 'Mercancía ingresada a bodega exitosamente', 
        data: result 
      });

    } catch (error) {
      console.error(" Error en ingreso:", error.message);
      const status = error.message.includes('ya existen') ? 409 : 500;
      res.status(status).json({ error: error.message });
    }
  },
  getStock: async (req, res) => {
    try {
      const stock = await inventoryService.getInventoryStock();
      res.json(stock);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
  // PUT /api/inventory/adjust
  adjustStatus: async (req, res) => {
    try {
      const { inventoryId, quantity, newStatus } = req.body;
      const userId = req.user.id;

      if (!inventoryId || !quantity || !newStatus) {
        return res.status(400).json({ error: 'Faltan datos para el ajuste.' });
      }

      // Validar que el estado sea correcto según el ENUM de Supabase
      const validStatuses = ['cuarentena', 'baja', 'devuelto', 'disponible'];
      if (!validStatuses.includes(newStatus)) {
        return res.status(400).json({ error: 'Estado inválido.' });
      }

      await inventoryService.adjustInventory(inventoryId, quantity, newStatus, userId);

      res.status(200).json({ message: `Inventario ajustado a estado: ${newStatus}` });
    } catch (error) {
      console.error("🔥 Error ajustando inventario:", error.message);
      res.status(500).json({ error: error.message });
    }
  },
  // GET /api/inventory/dashboard-stats
  getDashboardStats: async (req, res) => {
    try {
      // 1. Manejo de Fechas del Calendario
      const now = new Date();
      // Por defecto: Desde el día 1 del mes actual, hasta hoy
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

      const startDate = req.query.startDate ? new Date(req.query.startDate).toISOString() : startOfMonth;
      const endDate = req.query.endDate ? new Date(req.query.endDate + 'T23:59:59.999Z').toISOString() : endOfMonth;

      // 2. Movimientos (Entradas y Salidas) en ese rango de fechas
      const { data: movs } = await supabase
        .from('movements')
        .select(`
          type, quantity_moved, created_at,
          inventory ( products ( name, internal_code ) )
        `)
        .gte('created_at', startDate)
        .lte('created_at', endDate)
        .order('created_at', { ascending: false });

      let entradas = 0; let salidas = 0;
      const detalleEntradas = []; const detalleSalidas = [];
      
      (movs || []).forEach(m => {
        const item = {
          date: m.created_at,
          quantity: m.quantity_moved,
          name: m.inventory?.products?.name || 'Mercancía General',
          sku: m.inventory?.products?.internal_code || 'N/A'
        };
        if (m.type === 'entrada') { entradas += m.quantity_moved; detalleEntradas.push(item); }
        if (m.type === 'salida') { salidas += m.quantity_moved; detalleSalidas.push(item); }
      });

      // 3. Mercancía en Problemas (Cuarentena, Baja, Devuelto)
      const { data: inv } = await supabase
        .from('inventory')
        .select('quantity, status, products(name, internal_code)')
        .in('status', ['cuarentena', 'baja', 'devuelto']);

      const problemStock = (inv || []).reduce((sum, item) => sum + item.quantity, 0);
      const detalleCuarentena = (inv || []).map(i => ({
        quantity: i.quantity,
        status: i.status,
        name: i.products?.name || 'Desconocido',
        sku: i.products?.internal_code || 'N/A'
      }));

      // 4. Alertas de Stock Bajo (AQUÍ PUEDES CAMBIAR EL 20 POR OTRO NÚMERO)
      const allProducts = await productService.getAllProducts();
      const lowStockAlerts = allProducts
        .filter(p => p.stock > 0 && p.stock <= 20)
        .sort((a, b) => a.stock - b.stock)
        .slice(0, 5);

      // 5. Inventario Crudo (Para las tablas de Excel)
      const { data: rawInventory } = await supabase
        .from('inventory')
        .select(`quantity, serial_number, pallet_id, owner_company, products ( name, category, supplier )`)
        .eq('status', 'disponible');

      res.json({
        chartData: [
          // Le agregamos un "key" para que React sepa qué botón tocaste
          { name: 'Entradas', cantidad: entradas, keyId: 'entradas' },
          { name: 'Salidas', cantidad: salidas, keyId: 'salidas' }
        ],
        details: { entradas: detalleEntradas, salidas: detalleSalidas, cuarentena: detalleCuarentena },
        problemStock,
        lowStockAlerts,
        rawInventory: rawInventory || []
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
  getSerialsByProduct: async (req, res) => {
    try {
      const { productId } = req.params;
      const { status } = req.query; // Para atrapar el ?status=disponible

      if (!productId) {
        return res.status(400).json({ error: "Falta el ID del producto" });
      }

      const serials = await inventoryService.getAvailableSerials(productId, status || 'disponible');
      res.json(serials);
    } catch (error) {
      console.error("Error buscando seriales del producto:", error.message);
      res.status(500).json({ error: error.message });
    }
  }
};

export default inventoryController;