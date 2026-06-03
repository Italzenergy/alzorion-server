import { supabase } from '../config/supabaseClient.js';

export const actaService = {
  
  createActa: async (actaData, userId) => {
    // 1. Generar el Consecutivo Automático (Ej. ACT-0001)
    const { data: lastActa } = await supabase
      .from('actas')
      .select('document_number')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    let nextNumber = 1;
    if (lastActa && lastActa.document_number) {
      // Extrae el número del formato "ACT-0001"
      const lastNum = parseInt(lastActa.document_number.split('-')[1]);
      if (!isNaN(lastNum)) nextNumber = lastNum + 1;
    }
    
    // Formatea con ceros a la izquierda (ACT-0001, ACT-0015, etc.)
    const document_number = `ACT-${String(nextNumber).padStart(4, '0')}`;

    // 2. Preparar los datos para insertar
    const newActa = {
      document_number,
      created_by: userId,
      
      // Encabezado
      invoice_number: actaData.invoice_number || null,
      operation_type: actaData.operation_type || 'Salida',
      
      // Cliente
      client_name: actaData.client_name,
      client_nid: actaData.client_nid,
      client_phone: actaData.client_phone,
      client_email: actaData.client_email,
      
      // Transportador
      transporter_name: actaData.transporter_name,
      transporter_nid: actaData.transporter_nid,
      transporter_phone: actaData.transporter_phone,
      vehicle_plate: actaData.vehicle_plate,
      transport_company: actaData.transport_company,
      
      // Logística
      destination_city: actaData.destination_city,
      freight_price: actaData.freight_price || 0,
      is_cash_on_delivery: actaData.is_cash_on_delivery || false,
      
      // AQUÍ GUARDAMOS LO QUE ESCRIBAS MANUALMENTE EN EL FORMULARIO
      items_detail: actaData.items_detail || []
    };

    // 3. Guardar en la base de datos
    const { data, error } = await supabase
      .from('actas')
      .insert([newActa])
      .select()
      .single();

    if (error) throw new Error(`Error creando acta: ${error.message}`);
    
    return data;
  },

  getAllActas: async () => {
    const { data, error } = await supabase
      .from('actas')
      .select(`
        *,
        profiles ( full_name )
      `)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data;
  },
  // 1. NUEVA FUNCIÓN: Buscar una sola acta
  getActaById: async (id) => {
    const { data, error } = await supabase
      .from('actas')
      .select(`
        *,
        profiles ( full_name )
      `)
      .eq('id', id)
      .single();

    if (error) throw new Error(`Error buscando acta: ${error.message}`);
    return data;
  },

  // 2. NUEVA FUNCIÓN: Actualizar el acta
  updateActa: async (id, updateData) => {
    const { data, error } = await supabase
      .from('actas')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Error actualizando acta: ${error.message}`);
    return data;
  },
  // ... tus funciones anteriores (createActa, getAllActas, getActaById, updateActa)

  // NUEVA FUNCIÓN: Procesar Inventario (TODO O NADA)
  processActaInventory: async (actaId, movements, userId) => {
    
    // ==========================================
    // FASE 1: VALIDACIÓN ESTRICTA (Solo lectura)
    // ==========================================
    
    const validaciones = {
      inventoryItemsToUpdate: [], // Para guardar IDs de filas en la tabla 'inventory' que vamos a cambiar de estado o restar cantidad
      movementsToInsert: []       // Para guardar en tu tabla 'movements' el historial
    };

    for (const mov of movements) {
      
      // CASO A: TIENE SERIALES (is_serialized = true)
      if (mov.serials && mov.serials.trim() !== '') {
        const serialList = mov.serials.split(/,|\n/).map(s => s.trim()).filter(Boolean);

        if (serialList.length !== mov.quantity) {
          throw new Error(`Error en "${mov.original_description}": Indicaste cantidad ${mov.quantity}, pero escaneaste ${serialList.length} seriales.`);
        }

        // Buscamos los seriales EXACTOS en TU tabla 'inventory' que estén disponibles
        const { data: dbSerials, error: serialError } = await supabase
          .from('inventory') 
          .select('id, serial_number, status, location, import_number, pallet_id, owner_company')
          .eq('product_id', mov.db_product_id)
          .in('serial_number', serialList);

        if (serialError) throw new Error("Error consultando seriales en la base de datos.");

        // Verificar uno por uno
        for (const sn of serialList) {
          const found = dbSerials.find(dbs => dbs.serial_number === sn);
          
          if (!found) {
            throw new Error(`¡ALERTA! El serial ${sn} NO EXISTE en el sistema para este producto.`);
          }
          if (found.status !== 'disponible') {
            throw new Error(`¡ALERTA! El serial ${sn} no está disponible. Su estado es: ${found.status}.`);
          }
          
          // Preparamos para actualizar la tabla 'inventory' (cambiar a 'vendido')
          validaciones.inventoryItemsToUpdate.push({
             id: found.id,
             newStatus: 'vendido', // Usamos un enum válido de tu BD
             quantityToDeduct: 1 // Los serializados siempre son de a 1
          });

          // Preparamos el registro para la tabla 'movements' (Historial)
          validaciones.movementsToInsert.push({
            inventory_id: found.id,
            acta_id: actaId,
            user_id: userId,
            type: 'salida',
            quantity_moved: 1,
            snapshot_location: found.location,
            snapshot_import_number: found.import_number,
            snapshot_pallet: found.pallet_id,
            snapshot_owner: found.owner_company,
            snapshot_serial: found.serial_number
          });
        }

      } else {
        // CASO B: NO TIENE SERIALES (Ej: Estructuras, L FEET)
        // Buscamos cuánto stock hay disponible en la tabla 'inventory' para este producto.
        // Como pueden estar divididos en varios pallets, traemos todos los lotes disponibles.
        const { data: dbLotes, error: lotesErr } = await supabase
          .from('inventory')
          .select('*')
          .eq('product_id', mov.db_product_id)
          .eq('status', 'disponible')
          .order('entry_date', { ascending: true }); // Método FIFO: Sacamos primero lo más viejo

        if (lotesErr || !dbLotes) throw new Error(`Error consultando inventario.`);

        // Sumamos el stock total disponible de todos los lotes
        const totalStockDisponible = dbLotes.reduce((acc, lote) => acc + lote.quantity, 0);

        if (totalStockDisponible < mov.quantity) {
          throw new Error(`Stock insuficiente para el producto seleccionado. Intentas sacar ${mov.quantity}, pero solo hay ${totalStockDisponible} disponibles.`);
        }

        // LÓGICA DE DESCUENTO POR LOTES (Si piden 100 y el primer pallet tiene 80, saca 80 de ahí y 20 del siguiente)
        let cantidadFaltante = mov.quantity;

        for (const lote of dbLotes) {
          if (cantidadFaltante <= 0) break;

          const cantidadARestarDeEsteLote = Math.min(lote.quantity, cantidadFaltante);
          
          validaciones.inventoryItemsToUpdate.push({
            id: lote.id,
            newStatus: (lote.quantity - cantidadARestarDeEsteLote === 0) ? 'vendido' : 'disponible', // Si se vacía el lote, queda vendido
            quantityToDeduct: cantidadARestarDeEsteLote
          });

          // Registro para el historial 'movements'
          validaciones.movementsToInsert.push({
            inventory_id: lote.id,
            acta_id: actaId,
            user_id: userId,
            type: 'salida',
            quantity_moved: cantidadARestarDeEsteLote,
            snapshot_location: lote.location,
            snapshot_import_number: lote.import_number,
            snapshot_pallet: lote.pallet_id,
            snapshot_owner: lote.owner_company,
            snapshot_serial: null // No tiene serial
          });

          cantidadFaltante -= cantidadARestarDeEsteLote;
        }
      }
    }

    // ==========================================
    // FASE 2: EJECUCIÓN (Cero Errores)
    // ==========================================

    // 2.1. Actualizar la tabla INVENTORY
    for (const updateItem of validaciones.inventoryItemsToUpdate) {
       // Primero leemos la cantidad actual para restarle
       const { data: currentInv } = await supabase.from('inventory').select('quantity').eq('id', updateItem.id).single();
       const nuevaCantidad = currentInv.quantity - updateItem.quantityToDeduct;

       await supabase
         .from('inventory')
         .update({ 
           quantity: nuevaCantidad, 
           status: updateItem.newStatus 
         })
         .eq('id', updateItem.id);
    }

    // 2.2. Registrar en la tabla MOVEMENTS (El historial que alimenta tu Vista Excel)
    if (validaciones.movementsToInsert.length > 0) {
      const { error: moveErr } = await supabase
        .from('movements')
        .insert(validaciones.movementsToInsert);
      
      if (moveErr) console.error("Error guardando historial de movimientos:", moveErr);
    }

    // 2.3. Marcar el Acta como Procesada (Opcional, pero recomendado si le agregas una columna status a la tabla actas)
    // await supabase.from('actas').update({ status: 'Procesada' }).eq('id', actaId);
     const { error: updateActaErr } = await supabase
      .from('actas')
      .update({ inventory_status: 'procesado' }) // Asegúrate de que la columna se llame así en SQL
      .eq('id', actaId);

    if (updateActaErr) {
      console.error("Error al marcar el acta como procesada:", updateActaErr);
      // No lanzamos error aquí para no revertir el inventario, pero lo logueamos
    }
    return { success: true, processed_items: validaciones.movementsToInsert.length };
  },
  // NUEVA FUNCIÓN: Anular Acta de forma segura
  voidActa: async (actaId, userId) => {
    // 1. Obtener el estado actual del acta
    const { data: acta, error: actaErr } = await supabase
      .from('actas')
      .select('*')
      .eq('id', actaId)
      .single();

    if (actaErr || !acta) throw new Error("Acta no encontrada en el sistema.");
    if (acta.inventory_status === 'anulada') throw new Error("Esta acta ya se encuentra anulada.");

    // 2. Si el acta ya descontó inventario ('procesado'), DEBEMOS DEVOLVERLO
    if (acta.inventory_status === 'procesado') {
      
      // Buscamos todos los movimientos de salida que generó esta acta
      const { data: movimientos } = await supabase
        .from('movements')
        .select('*')
        .eq('acta_id', actaId)
        .eq('type', 'salida');

      if (movimientos && movimientos.length > 0) {
        const devoluciones = [];

        for (const mov of movimientos) {
          // Consultamos cómo está ese producto/serial en el inventario actualmente
          const { data: invItem } = await supabase
            .from('inventory')
            .select('id, quantity, status')
            .eq('id', mov.inventory_id)
            .single();

          if (invItem) {
            // Devolvemos la cantidad a la bodega y lo marcamos como 'disponible'
            const nuevaCantidad = invItem.quantity + mov.quantity_moved;
            
            await supabase
              .from('inventory')
              .update({ quantity: nuevaCantidad, status: 'disponible' })
              .eq('id', invItem.id);

            // Preparamos el registro de la auditoría (Movimiento tipo 'devolucion')
            devoluciones.push({
              inventory_id: invItem.id,
              acta_id: actaId,
              user_id: userId,
              type: 'devolucion', // Usamos tu ENUM
              quantity_moved: mov.quantity_moved,
              snapshot_location: mov.snapshot_location,
              snapshot_import_number: mov.snapshot_import_number,
              snapshot_pallet: mov.snapshot_pallet,
              snapshot_owner: mov.snapshot_owner,
              snapshot_serial: mov.snapshot_serial
            });
          }
        }

        // Guardamos el historial de devoluciones
        if (devoluciones.length > 0) {
          await supabase.from('movements').insert(devoluciones);
        }
      }
    }

    // 3. Finalmente, cambiamos el estado del Acta a 'anulada'
    const { error: updateErr } = await supabase
      .from('actas')
      .update({ inventory_status: 'anulada' })
      .eq('id', actaId);

    if (updateErr) throw new Error("Error al intentar anular el acta.");

    return { 
      message: acta.inventory_status === 'procesado' 
        ? "Acta anulada. El stock fue devuelto a la bodega exitosamente." 
        : "Acta pendiente anulada exitosamente." 
    };
  }
};