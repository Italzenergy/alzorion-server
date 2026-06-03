import { supabase } from '../config/supabaseClient.js';

export const productService = {
  
  // 1. Obtener todos los productos y calcular su stock real
  getAllProducts: async (category) => {
    let query = supabase
      .from('products')
      .select(`
        id, 
        internal_code,
        accounting_ref,
        name, 
        category,
        is_serialized,
        supplier, 
        image_url,
        inventory ( quantity, status )
      `)
      .order('name', { ascending: true });

    if (category) {
      query = query.eq('category', category);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const productsWithStock = (data || []).map(product => {
      const invList = product.inventory || []; 
      
      const stockDisponible = invList
        .filter(inv => inv.status === 'disponible')
        .reduce((sum, current) => sum + current.quantity, 0);

      return {
        id: product.id,
        internal_code: product.internal_code, 
        accounting_ref: product.accounting_ref,
        name: product.name,
        category: product.category,
        is_serialized: product.is_serialized,
        supplier: product.supplier,
        image_url: product.image_url,
        stock: stockDisponible
      };
    });

    return productsWithStock;
  },

  // 2. Obtener un producto por ID
  getProductById: async (id) => {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw new Error('Producto no encontrado');
    return data;
  },

  // 3. Crear nuevo producto (BLINDADO)
  createProduct: async (productData) => {
    // Extraemos EXPLICITAMENTE los campos para obligar a Supabase a verlos
    const { name, internal_code, category, is_serialized, supplier, image_url, accounting_ref } = productData;

    const { data, error } = await supabase
      .from('products')
      .insert([{ 
        name, 
        internal_code, 
        category, 
        is_serialized, 
        supplier, 
        image_url, 
        accounting_ref 
      }])
      .select()
      .single();

    if (error) {
      if (error.code === '23505') throw new Error('Ya existe un producto con ese Código Interno.');
      throw new Error(error.message);
    }
    return data;
  },

  // 4. Actualizar producto (BLINDADO)
  updateProduct: async (id, productData) => {
    // Extraemos EXPLICITAMENTE
    const { name, internal_code, category, is_serialized, supplier, image_url, accounting_ref } = productData;

    const { data, error } = await supabase
      .from('products')
      .update({ 
        name, 
        internal_code, 
        category, 
        is_serialized, 
        supplier, 
        image_url, 
        accounting_ref 
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  },

  // 5. Eliminar producto
  deleteProduct: async (id) => {
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', id);

    if (error) {
      if (error.code === '23503') throw new Error('No se puede eliminar: El producto tiene historial o stock activo.');
      throw new Error(error.message);
    }
    return true;
  }
};