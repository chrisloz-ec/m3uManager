// auth.js - VERSIÓN FUNCIONAL BASADA EN TU EJEMPLO
console.log('=== AUTH.JS CARGADO ===');

// Variables globales
let supabaseClient = null;
const SUPABASE_URL = 'URL_SUPABASE';
const SUPABASE_KEY = 'APIKEY_SUPABASE';

// Función global para alertas
window.showAlert = function(message, type = 'info') {
    console.log('showAlert:', message);
    
    // Buscar contenedor de alertas
    let alertContainer = document.getElementById('alertContainer');
    if (!alertContainer) {
        alertContainer = document.createElement('div');
        alertContainer.id = 'alertContainer';
        alertContainer.className = 'position-fixed top-0 end-0 p-3';
        alertContainer.style.zIndex = '9999';
        document.body.appendChild(alertContainer);
    }
    
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
    alertDiv.innerHTML = `
        <i class="bi bi-${type === 'success' ? 'check-circle' : 
                         type === 'danger' ? 'exclamation-triangle' : 
                         type === 'warning' ? 'exclamation-circle' : 'info-circle'} me-2"></i>
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    alertContainer.appendChild(alertDiv);
    
    setTimeout(() => {
        if (alertDiv.parentElement) {
            alertDiv.remove();
        }
    }, 5000);
    
    return alertDiv;
};

// Inicializar Supabase
function initSupabase() {
    console.log('Inicializando Supabase...');
    
    if (typeof supabase === 'undefined') {
        console.error('ERROR: Supabase library no cargada');
        return null;
    }
    
    try {
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true
            }
        });
        
        console.log('Supabase inicializado exitosamente');
        return supabaseClient;
        
    } catch (error) {
        console.error('Error inicializando Supabase:', error);
        return null;
    }
}

// Obtener cliente
function getSupabase() {
    if (!supabaseClient) {
        return initSupabase();
    }
    return supabaseClient;
}

// ===== FUNCIONES DE AUTENTICACIÓN =====

// REGISTRO (basado en tu ejemplo funcional)
window.register = async function(fullName, email, password) {
    try {
        console.log('Registrando usuario:', { email, fullName });
        
        const client = getSupabase();
        if (!client) {
            return { success: false, error: 'Error de configuración' };
        }
        
        // Validaciones
        if (!email || !password || !fullName) {
            return { success: false, error: 'Todos los campos son requeridos' };
        }
        
        if (password.length < 6) {
            return { success: false, error: 'La contraseña debe tener al menos 6 caracteres' };
        }

        // Registrar usuario (SOLO signUp como en tu ejemplo)
        const { data: authData, error: authError } = await client.auth.signUp({
            email: email,
            password: password,
            options: {
                data: { 
                    full_name: fullName
                },
                emailRedirectTo: `${window.location.origin}/login.html?verified=true`
            }
        });

        if (authError) {
            console.error('Error en registro:', authError);
            
            let errorMessage = authError.message;
            if (authError.message.includes('User already registered')) {
                errorMessage = 'Este email ya está registrado';
            }
            
            return { success: false, error: errorMessage };
        }

        console.log('Usuario creado en Auth:', authData.user?.id);
        
        // IMPORTANTE: NO intentamos crear el perfil aquí
        // El perfil se creará cuando el usuario inicie sesión por primera vez
        
        return { 
            success: true, 
            message: '¡Registro exitoso! Por favor verifica tu correo electrónico.',
            user: authData.user
        };
        
    } catch (error) {
        console.error('Error general en registro:', error);
        return { success: false, error: 'Error al crear la cuenta' };
    }
};

// LOGIN (mantén tu versión actual)
window.login = async function(email, password) {
    try {
        const client = getSupabase();
        if (!client) {
            return { success: false, error: 'Error de configuración' };
        }
        
        console.log('Intentando login:', email);
        
        const { data, error } = await client.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) {
            console.error('Error de login:', error);
            let errorMessage = error.message;
            if (error.message.includes('Invalid login credentials')) {
                errorMessage = 'Email o contraseña incorrectos';
            } else if (error.message.includes('Email not confirmed')) {
                errorMessage = 'Por favor verifica tu correo electrónico antes de iniciar sesión';
            }
            return { success: false, error: errorMessage };
        }
        
        console.log('Login exitoso, usuario:', data.user?.id);
        
        // Crear perfil si no existe (al primer login)
        if (data.user) {
            await ensureUserProfile(data.user.id, data.user.user_metadata?.full_name || 'Usuario');
        }
        
        // Redirigir al dashboard
        window.location.href = 'dashboard.html';
        return { success: true };
        
    } catch (error) {
        console.error('Excepción en login:', error);
        return { success: false, error: 'Error al iniciar sesión' };
    }
};

// Función para asegurar que el perfil existe
async function ensureUserProfile(userId, fullName) {
    try {
        const client = getSupabase();
        if (!client) return;
        
        console.log('Verificando perfil para usuario:', userId);
        
        // Verificar si ya existe el perfil
        const { data: existing, error: fetchError } = await client
            .from('user_profiles')
            .select('id')
            .eq('id', userId)
            .maybeSingle(); // Usar maybeSingle para evitar error si no existe
        
        if (fetchError) {
            console.warn('Error verificando perfil:', fetchError);
        }
        
        // Si no existe, crear uno
        if (!existing) {
            console.log('Creando nuevo perfil...');
            
            try {
                const { error: insertError } = await client
                    .from('user_profiles')
                    .insert([{
                        id: userId,
                        full_name: fullName,
                        lists_limit: 3,
                        subscription_tier: 'free',
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    }]);
                
                if (insertError) {
                    console.warn('Error creando perfil:', insertError);
                    
                    // Si es error de RLS, usar método alternativo
                    if (insertError.code === '42501') {
                        await createProfileFallback(userId, fullName);
                    }
                } else {
                    console.log('Perfil creado exitosamente');
                }
            } catch (insertError) {
                console.warn('Excepción creando perfil:', insertError);
            }
        } else {
            console.log('Perfil ya existe');
        }
        
    } catch (error) {
        console.error('Error en ensureUserProfile:', error);
    }
}

// Método alternativo para crear perfil (evita RLS)
async function createProfileFallback(userId, fullName) {
    try {
        console.log('Usando método alternativo para crear perfil...');
        
        // Podrías usar aquí:
        // 1. Una función RPC de Supabase
        // 2. Una Edge Function
        // 3. Una política RLS más permisiva
        
        // Por ahora, solo logueamos el error
        console.log('Perfil no creado por RLS. Usuario necesita políticas adecuadas.');
        
    } catch (error) {
        console.error('Error en fallback:', error);
    }
}

// Otras funciones (mantén las existentes)
window.checkAuth = async function() {
    try {
        const client = getSupabase();
        if (!client) return null;
        
        const { data: { session } } = await client.auth.getSession();
        return session;
    } catch (error) {
        console.error('Error en checkAuth:', error);
        return null;
    }
};

window.requireAuth = async function() {
    const session = await checkAuth();
    if (!session) {
        const currentPage = window.location.pathname;
        if (!currentPage.includes('login.html') && 
            !currentPage.includes('register.html') && 
            !currentPage.includes('forgot-password.html') &&
            !currentPage.includes('index.html')) {
            window.location.href = 'login.html';
        }
    }
    return session;
};

window.redirectIfAuthenticated = async function() {
    const session = await checkAuth();
    if (session) {
        const currentPage = window.location.pathname;
        if (currentPage.includes('login.html') || 
            currentPage.includes('register.html') || 
            currentPage.includes('forgot-password.html')) {
            window.location.href = 'dashboard.html';
        }
    }
};

window.logout = async function() {
    try {
        const client = getSupabase();
        if (client) {
            await client.auth.signOut();
        }
        window.location.href = 'login.html';
    } catch (error) {
        console.error('Error en logout:', error);
        window.location.href = 'login.html';
    }
};

window.getCurrentUser = async function() {
    try {
        const client = getSupabase();
        if (!client) return null;
        
        const { data: { user } } = await client.auth.getUser();
        return user;
    } catch (error) {
        console.error('Error obteniendo usuario:', error);
        return null;
    }
};

// Inicializar
document.addEventListener('DOMContentLoaded', function() {
    console.log('Inicializando Supabase...');
    
    // Pequeño delay para asegurar carga
    setTimeout(() => {
        const client = initSupabase();
        
        if (client) {
            // Listener de cambios de autenticación
            client.auth.onAuthStateChange((event, session) => {
                console.log('Auth state:', event, session ? 'Sesión activa' : 'Sin sesión');
                
                // Cuando un usuario inicia sesión, asegurar su perfil
                if (event === 'SIGNED_IN' && session?.user) {
                    const fullName = session.user.user_metadata?.full_name || 'Usuario';
                    ensureUserProfile(session.user.id, fullName);
                }
            });
        }
    }, 100);
});


// Exportar función para obtener el cliente
window.getSupabaseClient = function() {
    return getSupabase();
};

// También exponer el cliente directamente
window.supabaseClient = supabaseClient;


//Recuperar contraseña
// Función para restablecer contraseña (forgot password)
async function resetPassword(email) {
    try {
        const client = getSupabaseClient();
        if (!client) {
            return {
                success: false,
                error: 'Error de conexión con la base de datos'
            };
        }

        const redirectUrl = `${window.location.origin}/reset-password.html`;
        console.log('Redirect URL:', redirectUrl);

        // Enviar enlace de restablecimiento de contraseña
        const { data, error } = await client.auth.resetPasswordForEmail(email, {
            // Opciones adicionales (opcional)
            redirectTo: redirectUrl
        });

        if (error) {
            console.error('Error resetting password:', error);
            
            // Traducir errores comunes
            let errorMessage = 'Error al enviar el enlace de recuperación';
            if (error.message.includes('rate limit')) {
                errorMessage = 'Demasiados intentos. Por favor espera unos minutos.';
            } else if (error.message.includes('email not confirmed')) {
                errorMessage = 'Primero debes confirmar tu correo electrónico.';
            } else if (error.message.includes('user not found')) {
                // Por seguridad, mostramos un mensaje genérico aunque el usuario no exista
                errorMessage = 'Si el correo existe, recibirás un enlace de recuperación.';
            }
            
            return {
                success: false,
                error: errorMessage
            };
        }

        // Éxito - siempre devolver éxito aunque el email no exista (por seguridad)
        return {
            success: true,
            message: 'Si el correo existe en nuestro sistema, recibirás un enlace de recuperación.'
        };

    } catch (error) {
        console.error('Unexpected error in resetPassword:', error);
        return {
            success: false,
            error: 'Error inesperado. Por favor intenta nuevamente.'
        };
    }

}
