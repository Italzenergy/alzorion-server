import { supabase } from '../config/supabaseClient.js';

export const inventoryService = {
  
  // 1. FUNCIÓN DE REGISTRAR INGRESO
  registerIntake: async (intakeData, userId) => {
    const { entry_date, import_number, location, owner, product_id, items, is_serialized } = intakeData;

    let inventoryRecords = [];

    if (is_serialized && Array.isArray(items)) {
      inventoryRecords = items.map(item => ({
        product_id,
        import_number,
        location,
        owner_company: owner,
        entry_date,
        quantity: 1, 
        serial_number: item.serie,
        pallet_id: item.pallet,
        status: 'disponible'
      }));
    } else {
      inventoryRecords = [{
        product_id,
        import_number,
        location,
        owner_company: owner,
        entry_date,
        quantity: items.quantity, 
        status: 'disponible'
      }];
    }

    const { data: invData, error: invError } = await supabase
      .from('inventory')
      .insert(inventoryRecords)
      .select();

    if (invError) {
      if (invError.code === '23505') {
        throw new Error('Uno o más números de serie de este lote ya existen en la bodega.');
      }
      throw new Error(`Error en inventario: ${invError.message}`);
    }

    const movementRecords = invData.map(inv => ({
      inventory_id: inv.id,
      user_id: userId,
      type: 'entrada',
      quantity_moved: inv.quantity,
      snapshot_location: inv.location,
      snapshot_import_number: inv.import_number,
      snapshot_pallet: inv.pallet_id,
      snapshot_owner: inv.owner_company,
      snapshot_serial: inv.serial_number
    }));

    const { error: movError } = await supabase
      .from('movements')
      .insert(movementRecords);

    if (movError) {
      console.error("Error crítico de trazabilidad:", movError);
      throw new Error('Inventario creado, pero falló el registro de trazabilidad.');
    }

    return { inserted_rows: invData.length, total_quantity: is_serialized ? invData.length : items.quantity };
  }, // <--- ESTA COMA ES LA CLAVE PARA SEPARAR LAS FUNCIONES

  // 2. FUNCIÓN DE OBTENER STOCK
  getInventoryStock: async () => {
    const { data, error } = await supabase
      .from('inventory')
      .select(`
        *,
        products (
          name,
          internal_code,
          category,
          supplier
        )
      `)
      .order('entry_date', { ascending: false }); 

    if (error) throw new Error(error.message);
    return data;
  },
  // 3. FUNCIÓN PARA AJUSTES Y GARANTÍAS (BAJAS/CUARENTENA)
  adjustInventory: async (inventoryId, adjustQty, newStatus, userId) => {
    // 1. Buscamos el registro actual
    const { data: currentItem, error: fetchError } = await supabase
      .from('inventory')
      .select('*')
      .eq('id', inventoryId)
      .single();

    if (fetchError || !currentItem) throw new Error('Registro no encontrado en bodega.');
    if (adjustQty <= 0 || adjustQty > currentItem.quantity) throw new Error('Cantidad a ajustar inválida.');

    let targetInventoryId = currentItem.id;

    // 2. Lógica de "División" (Split) para productos a granel
    if (adjustQty < currentItem.quantity) {
      // Le restamos los dañados al registro original (quedan los buenos)
      await supabase.from('inventory')
        .update({ quantity: currentItem.quantity - adjustQty })
        .eq('id', currentItem.id);

      // Creamos un registro nuevo solo para los dañados con el nuevo estado
      const { data: newItem, error: insertError } = await supabase.from('inventory')
        .insert([{
          product_id: currentItem.product_id,
          serial_number: currentItem.serial_number,
          batch_number: currentItem.batch_number,
          import_number: currentItem.import_number,
          pallet_id: currentItem.pallet_id,
          location: currentItem.location,
          owner_company: currentItem.owner_company,
          quantity: adjustQty,
          status: newStatus,
          entry_date: currentItem.entry_date
        }]).select().single();

      if (insertError) throw new Error('Error separando el lote: ' + insertError.message);
      targetInventoryId = newItem.id; // El movimiento quedará amarrado a este nuevo registro
    } else {
      // Si la cantidad es igual (ej. un panel serializado), simplemente actualizamos el estado
      await supabase.from('inventory')
        .update({ status: newStatus })
        .eq('id', currentItem.id);
    }

    // 3. Registrar el movimiento en el historial (Trazabilidad)
    const { error: movError } = await supabase.from('movements').insert([{
      inventory_id: targetInventoryId,
      user_id: userId,
      type: 'ajuste', // Movimiento tipo ajuste
      quantity_moved: adjustQty,
      snapshot_location: currentItem.location,
      snapshot_import_number: currentItem.import_number,
      snapshot_pallet: currentItem.pallet_id,
      snapshot_owner: currentItem.owner_company,
      snapshot_serial: currentItem.serial_number
    }]);

    if (movError) throw new Error('Fallo al guardar el historial del ajuste.');

    return true;
  },
  getAvailableSerials: async (productId, status = 'disponible') => {
    const { data, error } = await supabase
      .from('inventory')
      .select('serial_number, pallet_id')
      .eq('product_id', productId)
      .eq('status', status)
      // Aseguramos que solo traiga los registros que SÍ tienen serial
      .not('serial_number', 'is', null)
      .not('serial_number', 'eq', '');

    if (error) throw new Error(error.message);

    // Formateamos la respuesta para que el frontend la lea exactamente como la espera: { serie, pallet }
    return data.map(item => ({
      serie: item.serial_number,
      pallet: item.pallet_id || 'N/A'
    }));
  }
}; 