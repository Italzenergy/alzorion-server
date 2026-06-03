import { supabase } from '../config/supabaseClient.js';

export const userService = {
  // OBTENER TODOS LOS USUARIOS
  getAllUsers: async () => {
    // Buscamos en 'profiles' y cruzamos con 'roles'
    const { data, error } = await supabase
      .from('profiles')
      .select(`
        id, full_name, email, created_at,
        user_roles (
          roles ( name )
        )
      `)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);

    // Aplanamos la data para que el Frontend la lea fácil
    return data.map(user => ({
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      created_at: user.created_at,
      role: user.user_roles?.[0]?.roles?.name || 'sin_rol'
    }));
  },

  // CREAR UN USUARIO NUEVO
  createUser: async (userData) => {
    const { email, password, full_name, role } = userData;

    // 1. Crear en Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email, password, email_confirm: true
    });
    if (authError) throw new Error(`Error Auth: ${authError.message}`);

    // 2. Guardar en 'profiles'
    const { error: profileError } = await supabase
      .from('profiles')
      .insert([{ id: authData.user.id, email, full_name }]);
    if (profileError) throw new Error(`Error en Perfil: ${profileError.message}`);

    // 3. Buscar el ID del Rol que pidieron (ej. 'logistica')
    const { data: roleData, error: roleSearchError } = await supabase
      .from('roles')
      .select('id')
      .eq('name', role)
      .single();
    if (roleSearchError) throw new Error(`Rol '${role}' no existe en la DB.`);

    // 4. Conectar al usuario con su rol en 'user_roles'
    const { error: relationError } = await supabase
      .from('user_roles')
      .insert([{ user_id: authData.user.id, role_id: roleData.id }]);
    if (relationError) throw new Error(`Error asignando rol: ${relationError.message}`);

    return authData.user;
  },
updateUser: async (id, userData) => {
    const { email, password, full_name, role } = userData;

    // 1. Actualizar credenciales en Auth (Si enviaron contraseña nueva)
    const authUpdates = {};
    if (email) authUpdates.email = email;
    if (password && password.trim() !== '') authUpdates.password = password;

    if (Object.keys(authUpdates).length > 0) {
      const { error: authError } = await supabase.auth.admin.updateUserById(id, authUpdates);
      if (authError) throw new Error(`Error en Auth: ${authError.message}`);
    }

    // 2. Actualizar datos públicos en 'profiles'
    if (full_name || email) {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ full_name, email })
        .eq('id', id);
      if (profileError) throw new Error(`Error actualizando perfil: ${profileError.message}`);
    }

    // 3. Actualizar el Rol en 'user_roles'
    if (role) {
      // Buscar el ID del nuevo rol
      const { data: roleData, error: roleError } = await supabase
        .from('roles').select('id').eq('name', role).single();
      
      if (roleError) throw new Error(`Rol '${role}' no encontrado.`);

      // Actualizar la relación
      const { error: relationError } = await supabase
        .from('user_roles')
        .update({ role_id: roleData.id })
        .eq('user_id', id);
        
      if (relationError) throw new Error(`Error actualizando rol: ${relationError.message}`);
    }

    return true;
  },
  // ELIMINAR USUARIO
  deleteUser: async (id) => {
    // Con ON DELETE CASCADE en tu SQL, solo borrando el auth se borra todo, 
    // pero lo hacemos explícito por seguridad.
    await supabase.from('profiles').delete().eq('id', id);
    const { error: authError } = await supabase.auth.admin.deleteUser(id);
    if (authError) throw new Error(authError.message);
    return true;
  }
};