import {authService} from '../services/auth.Service.js';
import {supabase} from '../config/supabaseClient.js';

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Validar que enviaron datos
    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña obligatorios' });
    }

    // 2. Llamar al servicio (El cocinero)
    const { session, user, permissions } = await authService.loginUser(email, password);

    // 3. CONFIGURAR LAS COOKIES (La parte importante)
    // HttpOnly: El JavaScript del navegador NO puede leerlas (Anti-Hackers)
    // Secure: Solo viajan por HTTPS (en produccion)
    // SameSite: Protege contra ataques CSRF
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', 
      sameSite: 'strict',
      //maxAge: 7 * 24 * 60 * 60 * 1000 // 7 días $\times$ 24 horas $\times$ 60 minutos $\times$ 60 segundos $\times$ 1000 milisegundos.
      maxAge: 60 * 60 * 1000 
    };

    // Guardamos el Access Token (pase corto) y Refresh Token (pase largo)
    res.cookie('access_token', session.access_token, cookieOptions);
    res.cookie('refresh_token', session.refresh_token, cookieOptions);

    // 4. Responder al Frontend
    // Nota: NO enviamos el token en el JSON. Ya va en la cookie invisible.
    return res.status(200).json({
      message: 'Inicio de sesión exitoso',
      user,
      permissions
    });

  } catch (error) {
    return res.status(401).json({ error: error.message });
  }
};

// Función para cerrar sesión
export const logout = (req, res) => {
  // Simplemente borramos las cookies
  res.clearCookie('access_token');
  res.clearCookie('refresh_token');
  return res.status(200).json({ message: 'Sesión cerrada' });
};

// Obtener el perfil actual usando la cookie
export const getProfile = async (req, res) => {
  try {
    console.log("🔍 Buscando perfil para el usuario ID:", req.user.id);

    // req.user ya viene validado por el middleware "authenticateUser"
    const { data: profileData, error } = await supabase
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
      .eq('id', req.user.id)
      .single();

    if (error) {
      console.error("❌ Error de Supabase al buscar perfil:", error);
      throw error;
    }

    if (!profileData) {
      throw new Error("El usuario no tiene un perfil en la tabla 'profiles'");
    }

    // Aplanamos de forma súper segura (evitando que explote si no hay roles)
    const rolesArray = profileData.user_roles || [];
    const permissions = rolesArray
      .flatMap(ur => ur.roles?.role_permissions || [])
      .map(rp => rp.permissions?.slug)
      .filter(Boolean); // Quita posibles nulos

    const roleName = rolesArray[0]?.roles?.name || 'sin-rol';

    console.log(`✅ Perfil encontrado: ${profileData.full_name} (${roleName})`);

    return res.status(200).json({
      user: {
        id: req.user.id,
        email: profileData.email,
        full_name: profileData.full_name,
        role: roleName
      },
      permissions
    });
  } catch (error) {
    console.error("🔥 Error 500 en getProfile:", error.message);
    return res.status(500).json({ error: error.message });
  }
};
export const authController = {
    login,
    logout,
    getProfile
}