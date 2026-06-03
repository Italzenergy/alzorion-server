import { productService } from '../services/product.Service.js';

const VALID_CATEGORIES = ['paneles', 'estructuras', 'inversores', 'accesorios'];

const productController = {
  
  // GET /api/products
  getAll: async (req, res) => {
    try {
      // El controlador ahora solo llama al servicio y entrega la respuesta
      const products = await productService.getAllProducts(req.query.category);
      res.json(products);
    } catch (error) {
      console.error("Error CRÍTICO en getAll de productos:", error);
      res.status(500).json({ error: error.message });
    }
  },

  // GET /api/products/:id
  getOne: async (req, res) => {
    try {
      const product = await productService.getProductById(req.params.id);
      res.json(product);
    } catch (error) {
      res.status(404).json({ error: error.message });
    }
  },

  // POST /api/products
  create: async (req, res) => {
    try {
      const { name, internal_code, category, is_serialized, image_url, supplier,accounting_ref  } = req.body;

      if (!name || !internal_code || !category || !supplier ||!accounting_ref ) {
        return res.status(400).json({ error: 'Faltan campos obligatorios (nombre, código, categoría, proveedor, referencia contable)' });
      }

      if (!VALID_CATEGORIES.includes(category)) {
        return res.status(400).json({ error: `Categoría inválida. Usar: ${VALID_CATEGORIES.join(', ')}` });
      }

      const newProduct = await productService.createProduct({
        name,
        internal_code,
        accounting_ref,
        category,
        is_serialized: is_serialized || false,
        image_url: image_url || null,
        supplier 
      });

      res.status(201).json({ message: 'Producto creado', data: newProduct });
    } catch (error) {
      const status = error.message.includes('existe') ? 409 : 500;
      res.status(status).json({ error: error.message });
    }
  },

  // DELETE /api/products/:id
  delete: async (req, res) => {
    try {
      await productService.deleteProduct(req.params.id);
      res.json({ message: 'Producto eliminado correctamente' });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // PUT /api/products/:id (ACTUALIZAR)
  updateProduct: async (req, res) => {
    try {
      const { id } = req.params;
      const { name, internal_code, category, is_serialized, image_url, supplier,accounting_ref } = req.body;

      if (!name || !internal_code || !category || !supplier||!accounting_ref) {
        return res.status(400).json({ error: 'Faltan campos obligatorios' });
      }

      const updatedProduct = await productService.updateProduct(id, {
        name,
        internal_code,
        accounting_ref,
        category,
        is_serialized,
        image_url: image_url || null,
        supplier
      });

      res.status(200).json({ message: 'Producto actualizado', data: updatedProduct });
    } catch (error) {
      const status = error.message.includes('existe') ? 409 : 500;
      res.status(status).json({ error: error.message });
    }
  },
};

export default productController;