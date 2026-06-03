import {supabase} from '../config/supabaseClient.js';

// 1. EL PORTERO (Verifica que estés logueado)
export const authenticateUser = async (req, res, next) => {
  try {
    // Buscamos la cookie llamada 'access_token'
    const token = req.cookies.access_token;

    if (!token) {
      return res.status(401).json({ error: 'Acceso denegado: No hay sesión activa' });
    }

    // Le preguntamos a Supabase si el token es válido
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Sesión inválida o expirada' });
    }

    // Guardamos al usuario en la petición para usarlo luego
    req.user = user;
    
    next(); // ¡Pase usted!

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// 2. EL JEFE DE SEGURIDAD (Verifica roles/permisos específicos)
// 2. EL JEFE DE SEGURIDAD (Verifica roles/permisos específicos)
export const authorizePermission = (requiredPermission) => {
  return async (req, res, next) => {
    try {
      const userId = req.user.id;

      // Consultamos los permisos en la DB (capturando el error)
      const { data: userRoles, error } = await supabase
        .from('user_roles')
        .select(`
          roles (
            role_permissions (
              permissions (slug)
            )
          )
        `)
        .eq('user_id', userId);

      // Si hay error de base de datos (ej. RLS), lo mostramos
      if (error) {
        console.error(" [Seguridad] Error leyendo DB:", error.message);
        return res.status(500).json({ error: 'Error de base de datos al leer permisos' });
      }

      console.log("\n---  DEBUG DE PERMISOS ---");
      console.log("1. Permiso requerido:", requiredPermission);
      console.log("2. ID del usuario:", userId);
      console.log("3. Respuesta cruda de Supabase:", JSON.stringify(userRoles, null, 2));

      // Aplanamos el array (con validación de seguridad por si viene nulo)
      const myPermissions = (userRoles || [])
        .flatMap(ur => ur.roles?.role_permissions || [])
        .map(rp => rp.permissions?.slug)
        .filter(Boolean); // Filtra cualquier undefined o null

      console.log("4. Permisos extraídos:", myPermissions);
      console.log("------------------------------\n");

      // Verificamos si tiene la llave
      if (!myPermissions.includes(requiredPermission)) {
        return res.status(403).json({ 
          error: `Acceso prohibido: Requieres el permiso '${requiredPermission}'` 
        });
      }

      next(); // Tiene permiso, pase.

    } catch (error) {
      console.error(" [Seguridad] Error fatal:", error.message);
      res.status(500).json({ error: 'Error interno verificando permisos' });
    }
  };
};