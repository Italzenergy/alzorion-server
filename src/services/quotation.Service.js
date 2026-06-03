import { supabase } from '../config/supabaseClient.js';
import nodemailer from 'nodemailer';
export const quotationService = {
// 1. Obtener cotizaciones (Con filtro de privacidad por rol REAL)
  getAll: async (user) => {
    // 1. Buscamos el rol REAL del usuario en nuestra tabla public.user_roles
    let userRealRole = 'comercial'; // Por defecto, asumimos que es comercial

    if (user && user.id) {
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('roles(name)')
        .eq('user_id', user.id)
        .single();
        
      if (roleData && roleData.roles) {
        userRealRole = roleData.roles.name; 
      }
    }

    console.log(`Rol real detectado para ${user?.email}: ${userRealRole}`);

    // 2. Armamos la consulta base
    let query = supabase
      .from('quotations')
      .select(`
        *,
        clients ( name, nid ),
        profiles ( full_name )
      `)
      .order('created_at', { ascending: false });

    // 3. Aplicamos el filtro si NO es admin
    if (userRealRole !== 'admin') {
      console.log(`Aplicando filtro de privacidad para: ${user?.email}`);
      query = query.eq('user_id', user.id);
    } else {
      console.log("Es Admin: Mostrando TODAS las cotizaciones.");
    }

    const { data, error } = await query;

    if (error) throw new Error(error.message);
    return data;
  },
 // Obtener una cotización específica con sus items y datos del cliente
  getById: async (id) => {
    const { data, error } = await supabase
      .from('quotations')
      .select(`
        *,
        clients (*),
        profiles ( full_name, email ),
        quotation_items (*)
      `)
      .eq('id', id)
      .single();

    if (error) throw new Error(error.message);
    return data;
  },
  // 2. Autocompletado de Clientes (Buscador)
  searchClients: async (searchTerm) => {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .ilike('name', `%${searchTerm}%`) // Busca si el nombre contiene las letras
      .limit(10);

    if (error) throw new Error(error.message);
    return data;
  },

  // 3. Crear Cotización Completa
  create: async (quotationData, userId) => {
    const { client, items, subtotal, tax_total, total, notes, valid_until } = quotationData;

    // A. Gestionar Cliente (UPSERT: Actualiza si el NIT existe, Inserta si es nuevo)
    const { data: clientData, error: clientError } = await supabase
      .from('clients')
      .upsert([{
        name: client.name,
        nid: client.nid,
        email: client.email,
        phone: client.phone,
        address: client.address
      }], { onConflict: 'nid' })
      .select()
      .single();

    if (clientError) throw new Error(`Error guardando cliente: ${clientError.message}`);

    // B. Generar Consecutivo (SO-XXXX)
    const { data: lastQuot } = await supabase
      .from('quotations')
      .select('document_number')
      .order('created_at', { ascending: false })
      .limit(1);

    let nextNumber = 'SO-0001';
    if (lastQuot && lastQuot.length > 0) {
      // Extraemos el número, le sumamos 1, y rellenamos con ceros (ej. 2 -> "0002")
      const lastNum = parseInt(lastQuot[0].document_number.split('-')[1]);
      nextNumber = `SO-${String(lastNum + 1).padStart(4, '0')}`;
    }

    // C. Guardar la Cabecera de la Cotización
    const { data: newQuot, error: quotError } = await supabase
      .from('quotations')
      .insert([{
        document_number: nextNumber,
        client_id: clientData.id,
        user_id: userId,
        subtotal,
        tax_total,
        total,
        notes,
        valid_until
      }])
      .select()
      .single();

    if (quotError) throw new Error(`Error en cotización: ${quotError.message}`);

    // D. Guardar los Detalles (Productos)
    const itemsToInsert = items.map(item => ({
      quotation_id: newQuot.id, // o simplemente 'id' si estás en el update
      product_id: item.product_id,
      product_name: item.product_name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      tax_rate: item.tax_rate,
      total_price: item.total_price,
      accounting_ref: item.accounting_ref,
      internal_code: item.internal_code 
    }));

    const { error: itemsError } = await supabase.from('quotation_items').insert(itemsToInsert);
    if (itemsError) throw new Error(`Error en los productos: ${itemsError.message}`);

    return newQuot;
  },
  // 4. Actualizar Cotización Existente
  update: async (id, quotationData) => {
    const { client, items, subtotal, tax_total, total, notes, valid_until } = quotationData;

    // A. Actualizar Cliente
    const { data: clientData, error: clientError } = await supabase
      .from('clients')
      .upsert([{ name: client.name, nid: client.nid, email: client.email, phone: client.phone, address: client.address }], { onConflict: 'nid' })
      .select().single();
    if (clientError) throw new Error(clientError.message);

    // B. Actualizar Cabecera de la Cotización
    const { error: quotError } = await supabase
      .from('quotations')
      .update({ client_id: clientData.id, subtotal, tax_total, total, notes, valid_until, updated_at: new Date() })
      .eq('id', id);
    if (quotError) throw new Error(quotError.message);

    // C. Borrar los items viejos y meter los nuevos (Es la forma más segura de actualizar listas)
    await supabase.from('quotation_items').delete().eq('quotation_id', id);
    
    const itemsToInsert = items.map(item => ({
      quotation_id: id, product_id: item.product_id, product_name: item.product_name,
      quantity: item.quantity, unit_price: item.unit_price, tax_rate: item.tax_rate, total_price: item.total_price,
      accounting_ref: item.accounting_ref,
      internal_code: item.internal_code
    }));
    await supabase.from('quotation_items').insert(itemsToInsert);

    return true;
  },

  // 4. Eliminar Cotización
  delete: async (id) => {
    // Al borrar la cabecera, los items se borran solos por el ON DELETE CASCADE del SQL
    const { error } = await supabase.from('quotations').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return true;
  },
  sendEmail: async (id, pdfBase64) => {
    // 1. Buscamos la cotización para obtener el correo del cliente
    const quote = await quotationService.getById(id);
    
    if (!quote.clients?.email) {
      throw new Error("El cliente no tiene un correo electrónico registrado.");
    }

    // 2. Configuramos el "Cartero" usando tus variables SMTP del .env
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: process.env.SMTP_PORT == 465, // true para puerto 465, false para otros como 587
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    // 3. Limpiamos el Base64 (html2pdf a veces le pone un encabezado que daña el archivo)
    const base64Data = pdfBase64.replace(/^data:application\/pdf;filename=[\w.-]+;base64,/, "")
                                .replace(/^data:application\/pdf;base64,/, "");

    // ==========================================
    // EL BALANCEADOR (¿Es SO o PO?)
    // ==========================================
    const isPO = quote.status === 'confirmada';
    
    const emailSubject = isPO 
      ? `Confirmación de Orden ${quote.document_number} - ALZ ENERGY` 
      : `Cotización ${quote.document_number} - ALZ ENERGY`;

    // Texto dinámico según el estado
    const dynamicBody = isPO 
      ? `
        <p style="font-size:14px; line-height:1.6;">
          De acuerdo a nuestra negociación, nos permitimos confirmar y adjuntar su 
          <strong style="color:#04ec1f;">Orden de Compra ${quote.document_number}</strong>.
        </p>

        <div style="background:#f9f9f9; border-left:4px solid #04ec1f; padding:15px; margin:20px 0;">
          <p style="margin:0; font-size:14px;">
            <strong>Estado de su pedido:</strong><br/>
            Venta Confirmada. Su orden ha sido notificada a nuestra bodega para iniciar el proceso de alistamiento y despacho.
          </p>
        </div>

        <p style="font-size:14px; line-height:1.6;">
          Agradecemos su confianza en ALZ ENERGY. Quedamos a su disposición para cualquier consulta sobre el estado de su entrega.
        </p>
      ` 
      : `
        <p style="font-size:14px; line-height:1.6;">
          De acuerdo a su solicitud, nos permitimos adjuntar la cotización 
          <strong style="color:#04ec1f;">${quote.document_number}</strong>.
        </p>

        <div style="background:#f9f9f9; border-left:4px solid #04ec1f; padding:15px; margin:20px 0;">
          <p style="margin:0; font-size:14px;">
            <strong>Vigencia de la oferta:</strong><br/>
            ${new Date(quote.valid_until).toLocaleDateString('es-CO')}
          </p>
        </div>

        <p style="font-size:14px; line-height:1.6;">
          Quedamos atentos a cualquier inquietud o comentario para proceder con la confirmación de la orden de compra (PO).
        </p>

        <!-- CTA -->
        <div style="text-align:center; margin:30px 0;">
          <a href="#" 
             style="background:#04ec1f; color:#000; text-decoration:none; padding:12px 25px; border-radius:6px; font-size:14px; font-weight:bold; display:inline-block;">
            Confirmar Orden
          </a>
        </div>
      `;

    // 4. Armamos el correo electrónico final
    const mailOptions = {
      from: `"ALZ ENERGY" <${process.env.SMTP_USER}>`,
      to: quote.clients.email,
      subject: emailSubject,
      html: `
        <div style="font-family: 'Montserrat', Arial, sans-serif; background-color:#f4f6f8; padding: 30px 0;">
          <div style="max-width:600px; margin:0 auto; background:#ffffff; border-radius:10px; overflow:hidden; box-shadow:0 4px 15px rgba(0,0,0,0.08);">

            <!-- Header -->
            <div style="background: linear-gradient(90deg, #04ec1f, #04ec1f); padding: 20px; text-align:center;">
              <h1 style="color:#ffffff; margin:0; font-size:22px; letter-spacing:1px;">
                ALZ ENERGY
              </h1>
              <p style="color:#e8f5e9; margin:5px 0 0; font-size:13px;">
                POTENCIA TU ENERGÍA 
              </p>
            </div>

            <!-- Body -->
            <div style="padding: 30px;">
              <h2 style="color:#333; margin-top:0;">Hola, ${quote.clients.name}</h2>

              <!-- AQUI INYECTAMOS EL TEXTO BALANCEADO -->
              ${dynamicBody}

              <p style="font-size:14px; margin-top:30px;">
                Cordialmente,
              </p>

              <p style="font-size:14px; margin:0;">
                <strong>Equipo Comercial</strong><br/>
                ALZ ENERGY
              </p>
            </div>

            <!-- Footer -->
            <div style="background:#f1f1f1; padding:15px; text-align:center; font-size:12px; color:#777;">
              <p style="margin:0;">
                Este correo fue generado automáticamente. Si tiene dudas, responda a este mensaje.<br/>
                Correo generado ALZ ORION
              </p>
            </div>

          </div>
        </div>
      `,
      attachments: [
        {
          // Formato dinámico: SO-0001 - Miguel Marulanda.pdf o PO-0001 - Miguel Marulanda.pdf
          filename: `${quote.document_number} - ${quote.clients.name}.pdf`,
          content: base64Data,
          encoding: 'base64'
        }
      ]
    };

    // 5. Enviamos el correo
    await transporter.sendMail(mailOptions);

    // 6. Actualizamos el estado SOLO si NO está ya confirmada
    // Así evitamos que una PO se regrese al estado de "enviada" accidentalmente
    if (!isPO) {
      const { error } = await supabase
        .from('quotations')
        .update({ status: 'enviada' })
        .eq('id', id);

      if (error) throw new Error("Correo enviado, pero falló al actualizar el estado: " + error.message);
    }

    return { success: true };
  },
  // 6. Confirmar Venta (De SO a PO y genera Acta de Bodega)
  confirmSale: async (id, userId) => {
    // A. Buscar la cotización con sus items y cliente
    const quote = await quotationService.getById(id);
    if (!quote) throw new Error("Cotización no encontrada");
    if (quote.status === 'confirmada') throw new Error("Esta venta ya fue confirmada anteriormente.");

    // B. Cambiar el prefijo del documento (SO a PO)
    const newDocumentNumber = quote.document_number.replace('SO-', 'PO-');

    // C. Generar un número de Acta para la bodega (ej: ACT-2024-PO0001)
    const actaNumber = `ACT-${new Date().getFullYear()}-${newDocumentNumber}`;

    // === INICIO DE LA TRANSACCIÓN LÓGICA ===
    
    // 1. Actualizar la Cotización
    const { error: quoteError } = await supabase
      .from('quotations')
      .update({ 
        document_number: newDocumentNumber,
        status: 'confirmada',
        updated_at: new Date()
      })
      .eq('id', id);

    if (quoteError) throw new Error("Error al confirmar venta: " + quoteError.message);

    // 2. Crear el Acta de Salida (Estado 'pendiente' para que Bodega la vea)
    // Preparamos los items para guardarlos en el JSONB del acta
    const itemsForActa = quote.quotation_items.map(item => ({
      product_id: item.product_id,
      quantity: item.quantity,
      accounting_ref: item.accounting_ref,
      internal_code: item.internal_code,
      description: item.product_name,
      serials: "" // Bodega llenará esto cuando despache
    }));

    const { error: actaError } = await supabase
      .from('actas')
      .insert([{
        document_number: actaNumber,
        invoice_number: newDocumentNumber, // Enlazamos el acta con la PO
        operation_type: 'Salida de Bodega',
        created_by: userId,
        client_name: quote.clients?.name || 'Cliente sin nombre',
        client_nid: quote.clients?.nid || 'N/A',
        client_phone: quote.clients?.phone || 'N/A',
        client_email: quote.clients?.email || 'N/A',
        items_detail: itemsForActa, // El detalle en formato JSON
        inventory_status: 'pendiente', // OJO: Estado vital para la vista de bodega
        comments: quote.notes
      }]);

    if (actaError) {
      // Si falla el acta, idealmente deberíamos revertir la cotización, pero 
      // para simplificar lanzamos el error para revisión manual.
      console.error("ALERTA: Venta confirmada pero falló creación de Acta:", actaError.message);
      throw new Error("Venta confirmada, pero hubo un error generando la orden para bodega.");
    }

    return { 
      message: "Venta confirmada exitosamente. Orden enviada a bodega.",
      newNumber: newDocumentNumber 
    };
  },
  // 7. Revertir Venta (Solo Admin - De PO a SO y cancela Bodega)
  revertSale: async (id) => {
    // 1. Obtener la cotización actual
    const quote = await quotationService.getById(id);
    if (quote.status !== 'confirmada') throw new Error("Solo se pueden revertir órdenes confirmadas.");

    // 2. Buscar el acta de salida asociada en bodega
    const { data: acta } = await supabase
      .from('actas')
      .select('*')
      .eq('invoice_number', quote.document_number)
      .single();

    // 3. VALIDACIÓN CRÍTICA DE INVENTARIO
    if (acta && acta.inventory_status === 'procesado') {
      throw new Error("¡Alto! Bodega ya procesó esta salida y descontó el inventario. No puedes revertir el documento, debes generar una devolución de mercancía.");
    }

    // 4. Eliminar el acta pendiente de bodega (Abortar misión)
    if (acta) {
      const { error: deleteActaError } = await supabase.from('actas').delete().eq('id', acta.id);
      if (deleteActaError) throw new Error("Error cancelando la orden en bodega.");
    }

    // 5. Revertir el nombre (PO a SO) y el estado
    const oldDocumentNumber = quote.document_number.replace('PO-', 'SO-');
    
    const { error: updateError } = await supabase
      .from('quotations')
      .update({ 
        document_number: oldDocumentNumber,
        status: 'borrador', // La regresamos a borrador para que pueda ser editada
        updated_at: new Date()
      })
      .eq('id', id);

    if (updateError) throw new Error("Error al revertir la cotización: " + updateError.message);

    return { 
      message: "Orden revertida con éxito. El acta en bodega fue cancelada.",
      newNumber: oldDocumentNumber 
    };
  },
  // 8. Cancelar Documento (SO o PO)
  cancelQuotation: async (id, userId) => {
    // 1. Obtener la cotización actual
    const quote = await quotationService.getById(id);
    if (!quote) throw new Error("Documento no encontrado.");
    if (quote.status === 'cancelada') throw new Error("Este documento ya se encuentra cancelado.");

    // 2. Lógica de protección si es una PO (Confirmada)
    if (quote.status === 'confirmada') {
      // Buscar el acta de salida asociada en bodega
      const { data: acta } = await supabase
        .from('actas')
        .select('*')
        .eq('invoice_number', quote.document_number)
        .single();

      if (acta) {
        // VALIDACIÓN CRÍTICA: Si bodega ya despachó, no podemos cancelar desde ventas.
        if (acta.inventory_status === 'procesado') {
          throw new Error("¡Alto! Bodega ya despachó esta mercancía. Deben Anular el Acta en el módulo de Bodega primero para devolver el inventario.");
        }
        
        // Si sigue pendiente, le anulamos el acta a bodega
        await supabase
          .from('actas')
          .update({ inventory_status: 'anulada' })
          .eq('id', acta.id);
      }
    }

    // 3. Cambiar el estado a 'cancelada' en la cotización
    const { error: updateError } = await supabase
      .from('quotations')
      .update({ 
        status: 'cancelada', 
        updated_at: new Date()
      })
      .eq('id', id);

    if (updateError) throw new Error("Error al cancelar el documento: " + updateError.message);

    return { message: `El documento ${quote.document_number} ha sido cancelado exitosamente.` };
  },
 // --- NUEVA FUNCIÓN: SUBIR COMPROBANTE Y CAMBIAR ESTADO ---
  updateReceiptStatus: async (id, receiptUrl) => {
    try {
      // 1. Verificamos que la cotización exista
      // Nota: Usamos quotationService.getById para asegurar la referencia
      const quote = await quotationService.getById(id);
      
      if (!quote) throw new Error("Documento no encontrado en la base de datos.");
      
      // 2. Validamos estados permitidos
      if (quote.status !== 'enviada' && quote.status !== 'borrador') {
         throw new Error(`Estado no permitido. El documento está en: ${quote.status}`);
      }

      // 3. Actualizamos en Supabase / PostgreSQL
      const { data, error: updateError } = await supabase
        .from('quotations')
        .update({ 
          status: 'pago_en_revision', 
          receipt_url: receiptUrl, 
          // Usamos toISOString() para que PostgreSQL no se confunda
          updated_at: new Date().toISOString() 
        })
        .eq('id', id)
        .select(); // Pedimos que nos devuelva el cambio para confirmar

      if (updateError) {
        console.error("Error de Supabase al actualizar:", updateError);
        throw new Error(updateError.message);
      }

      console.log(`Comprobante vinculado a ${quote.document_number} correctamente.`);
      return data;

    } catch (error) {
      // Este log saldrá en tu consola negra (Backend)
      console.error(" Error interno en updateReceiptStatus:", error.message);
      throw error; 
    }
  },
};