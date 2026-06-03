import { supabase } from '../config/supabaseClient.js';

export const analyticsService = {
  
  getGeneralDashboard: async (startDate, endDate, user) => {
    
    // 1. OBTENER ROL REAL DEL USUARIO
    let userRealRole = 'comercial';
    if (user && user.id) {
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('roles(name)')
        .eq('user_id', user.id)
        .single();
        
      if (roleData && roleData.roles) userRealRole = roleData.roles.name;
    }

    // 2. CONSTRUIR CONSULTA BASE
    let query = supabase
      .from('quotations')
      .select(`
        id, document_number, status, total, created_at,
        clients ( name ), profiles ( full_name ),
        quotation_items ( product_name, quantity, total_price )
      `);

    // 3. FILTROS DE FECHA
    if (startDate && endDate) {
      query = query.gte('created_at', startDate).lte('created_at', endDate);
    }

    // 4. EL CANDADO DE SEGURIDAD (NUEVO)
    // Si el usuario no es administrador, SOLO puede ver sus propias cotizaciones
    if (userRealRole !== 'admin') {
      query = query.eq('user_id', user.id);
    }

    const { data: quotes, error } = await query;
    if (error) throw new Error(error.message);

    const kpis = { total_po_quantity: 0, total_so_quantity: 0, total_drafts_quantity: 0, total_canceled_quantity: 0, total_sales_money: 0 };
    
    const consultantsMap = {};
    const clientsMap = {};
    const productsMap = {}; // NUEVO: Mapa de productos

    quotes.forEach(quote => {
      const amount = Number(quote.total || 0);
      const consultantName = quote.profiles?.full_name || 'Desconocido';
      const clientName = quote.clients?.name || 'Cliente sin nombre';

      if (!consultantsMap[consultantName]) consultantsMap[consultantName] = { name: consultantName, po_count: 0, so_count: 0, drafts_count: 0, canceled_count: 0, total_money: 0 };
      if (!clientsMap[clientName]) clientsMap[clientName] = { name: clientName, po_count: 0, total_money: 0 };

      if (quote.status === 'confirmada') {
        kpis.total_po_quantity += 1;
        kpis.total_sales_money += amount;
        
        consultantsMap[consultantName].po_count += 1;
        consultantsMap[consultantName].total_money += amount;
        
        clientsMap[clientName].po_count += 1;
        clientsMap[clientName].total_money += amount;

        // NUEVO: Contabilizar productos vendidos (Solo si es Venta Confirmada - PO)
        if (quote.quotation_items && Array.isArray(quote.quotation_items)) {
          quote.quotation_items.forEach(item => {
            const pName = item.product_name || 'Producto Desconocido';
            if (!productsMap[pName]) {
              productsMap[pName] = { name: pName, quantity: 0, revenue: 0 };
            }
            productsMap[pName].quantity += Number(item.quantity || 0);
            productsMap[pName].revenue += Number(item.total_price || 0);
          });
        }
      } 
      else if (quote.status === 'enviada') {
        kpis.total_so_quantity += 1;
        consultantsMap[consultantName].so_count += 1;
      } 
      else if (quote.status === 'borrador') {
        kpis.total_drafts_quantity += 1;
        consultantsMap[consultantName].drafts_count += 1;
      } 
      else if (quote.status === 'cancelada') {
        kpis.total_canceled_quantity += 1;
        consultantsMap[consultantName].canceled_count += 1;
      }
    });

    const top_consultants = Object.values(consultantsMap).sort((a, b) => b.total_money - a.total_money);
    const top_clients = Object.values(clientsMap).sort((a, b) => b.total_money - a.total_money).slice(0, 10); 
    
    // NUEVO: Ordenamos los productos por cantidad vendida y sacamos los primeros 10
    const top_products = Object.values(productsMap).sort((a, b) => b.quantity - a.quantity).slice(0, 10);

    return {
      kpis,
      top_consultants,
      top_clients,
      top_products, // Lo enviamos al frontend
      raw_data: quotes 
    };
  }
};