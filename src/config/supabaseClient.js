import { createClient } from "@supabase/supabase-js";
import dotenv from 'dotenv';
//Cargamos la variables de entorno 
dotenv.config();
//traemos las variables de entonrno de supabase 
const supabaseUrl = process.env.SUPABASE_URL;
const supabasekey = process.env.SUPABASE_ANON_KEY;

//validamos que las variables de entorno esten llenas por seguirdad 
//si no cerramos el proceso 
if (!supabaseUrl||!supabasekey){
console.error("Error critico variables url o key vacias");
throw new Error('Faltan credenciales de supabase');
}
// Creación de la instancia del cliente
// NOTA TÉCNICA:
// persistSession: false -> Porque estamos en el servidor (backend), no en un navegador.
// No queremos que Node.js guarde la sesión del usuario "Juan" y se la muestre a "Pedro".
export const supabase = createClient(supabaseUrl,supabasekey,{

    auth:{
        persistSession:false,
        autoRefreshToken:false,
        detectSessionInUrl:false
    }
    
});
console.log(' Cliente Supabase configurado correctamente');