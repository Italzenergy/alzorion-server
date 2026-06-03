import {supabase} from '../config/supabaseClient.js';

export const authService ={
  
  // Función para iniciar sesión
  loginUser: async (email, password) => {
    // 1. Pedimos a Supabase que valide al usuario
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    // 2. RECUPERAR DATOS DEL PERFIL (Nombre, Rol)
    // Supabase Auth solo nos da el ID. Nosotros queremos saber quién es en nuestra tabla 'profiles'.
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select(`
        full_name,
        email,
        user_roles (
          roles (
            name,
            role_permissions (
              permissions (slug)
            )
          )
        )
      `)
      .eq('id', data.user.id)
      .single();

    // Si no tiene perfil (raro, pero posible), devolvemos solo lo básico
    if (profileError) return { session: data.session, user: data.user, permissions: [] };

    // 3. APLANAR LOS PERMISOS
    // La consulta de arriba devuelve una estructura anidada horrible. Vamos a limpiarla.
    // Resultado esperado: ['inventory.view', 'actas.create']
    const permissions = profileData.user_roles
      .flatMap(ur => ur.roles.role_permissions)
      .map(rp => rp.permissions.slug);
    
    const roleName = profileData.user_roles[0]?.roles?.name || 'sin-rol';

    return {
      session: data.session, // Aquí vienen los tokens
      user: {
        id: data.user.id,
        email: profileData.email,
        full_name: profileData.full_name,
        role: roleName
      },
      permissions // Array de strings simple
    };
  }
};

